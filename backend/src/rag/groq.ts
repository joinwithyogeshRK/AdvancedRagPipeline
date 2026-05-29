import "dotenv/config"
import Groq from "groq-sdk"
import { askBedrock } from "./bedrock.js"

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

// ─────────────────────────────────────────────────────────────
// Keywords that signal the user wants repo structure info
// ─────────────────────────────────────────────────────────────
const STRUCTURE_KEYWORDS = [
  "files", "folders", "structure", "tree", "directory", "directories",
  "what's in", "what is in", "list", "show me", "all files",
  "codebase", "project structure", "architecture", "overview",
  "how is it organized", "what does this repo", "what does this project",
  "explain this", "walk me through", "what are the",
]

export function isStructuralQuery(query: string): boolean {
  const lower = query.toLowerCase()
  return STRUCTURE_KEYWORDS.some(kw => lower.includes(kw))
}

// ─────────────────────────────────────────────────────────────
// Format repo tree into a clean readable block for Groq
// ─────────────────────────────────────────────────────────────

function formatRepoTree(
  repoName: string,
  tree: { path: string; type: string; size?: number }[]
): string {
  // Group by top-level directory
  const grouped = new Map<string, string[]>()

  for (const item of tree) {
    const parts   = item.path.split("/")
    const topDir  = parts.length > 1 ? parts[0]! : "(root)"
    const current = grouped.get(topDir) ?? []
    current.push(item.path)
    grouped.set(topDir, current)
  }

  const lines: string[] = [
    `Repository: ${repoName}`,
    `Total files: ${tree.length}`,
    ``,
    `File structure:`,
  ]

  for (const [dir, files] of grouped) {
    lines.push(``)
    lines.push(`📁 ${dir}/`)
    for (const f of files.slice(0, 30)) {   // cap per-dir to avoid token overflow
      lines.push(`   ${f}`)
    }
    if (files.length > 30) {
      lines.push(`   … and ${files.length - 30} more files`)
    }
  }

  return lines.join("\n")
}

// ─────────────────────────────────────────────────────────────
// SYSTEM PROMPT BUILDER (domain-aware)
// ─────────────────────────────────────────────────────────────

const buildSystemPrompt = (input: {
  baseVoice: string
  hasChunks: boolean
  hasRepoTree: boolean
  contextBlock: string
  domain: "default" | "civil_code"
  civilDocLabel?: string
}): string => {
  const { baseVoice, hasChunks, hasRepoTree, contextBlock, domain, civilDocLabel } = input
  if (!hasChunks && !hasRepoTree) {
    return `${baseVoice}\nAnswer using conversation history and your general knowledge when needed.`
  }

  if (domain === "civil_code") {
    const docLine = civilDocLabel
      ? `You are answering questions about ${civilDocLabel}. Always identify the code by name and year when citing.`
      : `You are answering questions about an Indian Standard (IS) civil engineering code.`
    return `${baseVoice}

${docLine}

Strict rules for civil-engineering code answers:
- Cite the clause number verbatim whenever you give a rule or value (e.g. "Per Clause 8.2.2.4, …").
- When the user asks for a specific value (cement content, w/c ratio, cover, etc.), give the exact number with its unit. Do not round, paraphrase, or "estimate".
- If the excerpt indicates an amendment applies (e.g. "[Amended by: No. 3, …]"), surface that fact in the answer so the user knows the value reflects the latest amendment.
- If the answer requires a value from a table, name the table (e.g. "Table 5") and the row identifier (e.g. "Severe exposure, Reinforced Concrete").
- If the excerpts do not contain the answer, say so explicitly. Do NOT invent clause numbers, do NOT fabricate values. Engineering wrong-answers cause real-world harm.
- Do not refer to "the excerpts", "the chunks", "the document", or "the provided material" by those names — speak as the authority of the code.
- Skip safety disclaimers; the user is a professional engineer.
${contextBlock}`
  }

  return `${baseVoice}

You have access to the following information about this project. Use it to answer accurately.

Strict rules:
- Do not mention chunks, passages, retrieval, RAG, embeddings, or "the document" / "provided material" / "Chunk 1".
- Do not say "based on the context" or "according to the reference". Speak as if you simply know this.
- For file/structure questions, use the repository structure section to give precise accurate answers.
- For code questions, use the relevant code section.
- If something is not in the provided information, say so clearly rather than guessing.
- Be specific — when listing files, list the actual files. When explaining code, reference actual file paths.
${contextBlock}`
}

// ─────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────

export type AskGroqDomain = "default" | "civil_code"

export type AskGroqOptions = {
  domain?: AskGroqDomain
  // Civil-code answers benefit from naming the document version up front so
  // the user knows which code is being cited (e.g. "IS 456:2000 with
  // Amendments 2 & 3"). Optional.
  civilDocLabel?: string
}

export const askGroq = async (
  question:            string,
  relevantChunks:      string[],
  conversationHistory: { role: "user" | "assistant"; content: string }[] = [],
  repoContext?: {
    repoName: string
    tree:     { path: string; type: string; size?: number }[]
  },
  options:             AskGroqOptions = {},
): Promise<string> => {
  const hasChunks   = relevantChunks.length > 0
  const hasRepoTree = !!repoContext
  const domain      = options.domain ?? "default"

  const referenceBlock = hasChunks
    ? relevantChunks.join("\n\n---\n\n")
    : null

  console.log(`📦 Chunks received: ${relevantChunks.length}`)
  console.log(`💬 History messages: ${conversationHistory.length}`)
  console.log(`🌳 Repo tree injected: ${hasRepoTree ? repoContext!.repoName : "no"}`)
  console.log(`🏗  Domain: ${domain}`)
  if (referenceBlock)
    console.log(`📄 Reference preview: ${referenceBlock.slice(0, 200)}...`)

  const baseVoice = `You are Oracle, a warm, knowledgeable assistant. Be concise, clear, and friendly.`

  // Build the full context block
  let contextBlock = ""

  if (hasRepoTree) {
    contextBlock += `\n\n=== REPOSITORY STRUCTURE ===\n${formatRepoTree(repoContext!.repoName, repoContext!.tree)}\n`
  }

  if (referenceBlock) {
    // For civil-code answers, label the block more explicitly so the LLM
    // can cite clause numbers verbatim from it.
    const blockLabel = domain === "civil_code"
      ? "=== IS CODE EXCERPTS (verbatim — cite by clause number) ==="
      : "=== RELEVANT CODE / CONTENT ==="
    contextBlock += `\n\n${blockLabel}\n${referenceBlock}\n`
  }

  const systemPrompt = buildSystemPrompt({
    baseVoice,
    hasChunks,
    hasRepoTree,
    contextBlock,
    domain,
    ...(options.civilDocLabel !== undefined ? { civilDocLabel: options.civilDocLabel } : {}),
  })

  // Temperature: civil-code answers want verbatim citations, not paraphrase.
  const temperature = domain === "civil_code" ? 0.15 : 0.35

  // ── Primary path: AWS Bedrock (Claude Haiku) for ALL domains. ──
  // Bedrock's Messages API takes `system` separately, not inside `messages`.
  const bedrockMessages = [
    ...conversationHistory,
    { role: "user" as const, content: question },
  ]
  try {
    const answer = await askBedrock(systemPrompt, bedrockMessages, {
      temperature,
      maxTokens: 1024,
    })
    console.log("✅ Bedrock answered:", answer.slice(0, 100))
    return answer
  } catch (e: unknown) {
    // Fallback to Groq so a Bedrock outage / misconfig doesn't take answers
    // down entirely. Logged loudly so the operator sees it.
    const msg = e instanceof Error ? e.message : String(e)
    console.warn(`⚠️  Bedrock failed (${msg}); falling back to Groq`)
  }

  // ── Fallback path: Groq (Llama 3.3 70B). ──
  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system",  content: systemPrompt },
    ...conversationHistory,
    { role: "user",    content: question },
  ]

  console.log(`📨 Sending ${messages.length} messages to Groq (fallback)`)

  const response = await groq.chat.completions.create({
    model:       "llama-3.3-70b-versatile",
    max_tokens:  1024,
    temperature,
    messages,
  })

  const answer =
    response.choices[0]?.message.content?.trim() ??
    "I could not generate an answer. Please try again."

  console.log("✅ Groq fallback answered:", answer.slice(0, 100))

  return answer
}