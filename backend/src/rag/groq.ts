import "dotenv/config"
import Groq from "groq-sdk"

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
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────

export const askGroq = async (
  question:            string,
  relevantChunks:      string[],
  conversationHistory: { role: "user" | "assistant"; content: string }[] = [],
  repoContext?: {
    repoName: string
    tree:     { path: string; type: string; size?: number }[]
    broadQuery?: boolean
  },
): Promise<string> => {
  const hasChunks   = relevantChunks.length > 0
  const hasRepoTree = !!repoContext
  const referenceBlock = hasChunks
    ? relevantChunks.join("\n\n---\n\n")
    : null

  console.log(`📦 Chunks received: ${relevantChunks.length}`)
  console.log(`💬 History messages: ${conversationHistory.length}`)
  console.log(`🌳 Repo tree injected: ${hasRepoTree ? repoContext!.repoName : "no"}`)
  if (referenceBlock)
    console.log(`📄 Reference preview: ${referenceBlock.slice(0, 200)}...`)

  const baseVoice = `You are Oracle, a warm, knowledgeable assistant. Be concise, clear, and friendly.`

  // Build the full context block
  let contextBlock = ""

  if (hasRepoTree) {
    contextBlock += `\n\n=== REPOSITORY STRUCTURE ===\n${formatRepoTree(repoContext!.repoName, repoContext!.tree)}\n`
  }

  if (referenceBlock) {
    const referenceTitle = repoContext ? "RETRIEVED REPOSITORY CODE" : "RELEVANT DOCUMENT CONTENT"
    contextBlock += `\n\n=== ${referenceTitle} ===\n${referenceBlock}\n`
  }

  const systemPrompt = repoContext
    ? `${baseVoice}

You are explaining the GitHub repository "${repoContext.repoName}".
${repoContext.broadQuery ? "The user is asking a broad repository question. Cover the verified end-to-end flow across the available files before discussing optional improvements." : ""}

Repository answer rules:
- Treat only the repository structure and retrieved repository code below as verified evidence.
- Never invent routes, files, functions, classes, dependencies, database operations, or runtime behavior.
- Do not infer implementation details merely from file names, package names, or common framework conventions.
- If the available code does not prove part of the requested flow, state that the specific detail is not visible in the available code and continue with the verified parts.
- When explaining a full flow, connect only steps that are directly supported by the available code. Mention the actual file paths and function names.
- Before writing, silently identify the user's intent and organize the answer in the clearest order. Do not reveal a plan or your internal reasoning.
- Give a complete, natural answer in one response. Use descriptive headings only when they help the user scan the answer.
- Do not show generic headings such as "Plan", "Step-by-step explanation", "Improvement guidelines", or "Conclusion".
- Include focused existing-code snippets only when they help. Keep them faithful to the retrieved code and label them with their file path.
- If you provide a new or improved snippet, clearly label it as a suggested change so it cannot be confused with existing repository code.
- Include improvement guidance only when it is relevant to the user's question.
- Do not mention chunks, passages, retrieval, RAG, embeddings, or hidden context. Do not say "based on the context" or "according to the reference".
- Do not add filler. For a simple file or structure question, answer directly without unnecessary snippets.
${contextBlock}`
    : hasChunks
    ? `${baseVoice}

You have access to relevant document content. Use it to answer accurately.

Strict rules:
- Do not mention chunks, passages, retrieval, RAG, embeddings, or "the document" / "provided material" / "Chunk 1".
- Do not say "based on the context" or "according to the reference". Speak as if you simply know this.
- If something is not in the provided information, say so clearly rather than guessing.
${contextBlock}`
    : `${baseVoice}
Answer using conversation history and your general knowledge when needed.`

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system",  content: systemPrompt },
    ...conversationHistory,
    { role: "user",    content: question },
  ]

  console.log(`📨 Sending ${messages.length} messages to Groq`)

  const response = await groq.chat.completions.create({
    model:       "llama-3.3-70b-versatile",
    max_tokens:  repoContext?.broadQuery ? 3072 : repoContext ? 2048 : 1024,
    temperature: repoContext ? 0.2 : 0.35,
    messages,
  })

  const answer =
    response.choices[0]?.message.content?.trim() ??
    "I could not generate an answer. Please try again."

  console.log("✅ Groq answered:", answer.slice(0, 100))

  return answer
}
