import Groq from 'groq-sdk'

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!
})

const BROAD_REPOSITORY_HINTS = [
  'architecture', 'codebase', 'entire project', 'full flow', 'overall flow',
  'end to end', 'end-to-end', 'how does this code work', 'how does this project work',
  'explain the project', 'explain this project', 'project overview', 'system design',
  'walk me through', 'main components', 'complete flow',
]

const DEFAULT_REPOSITORY_SEARCH_FACETS = [
  'server entry point route registration authentication middleware request flow',
  'document ingestion repository indexing chunking embedding vector storage',
  'query expansion embedding pinecone search hybrid retrieval reranking',
  'answer generation repository context conversation history persistence response',
]

export function isBroadRepositoryQuery(query: string): boolean {
  const lower = query.toLowerCase()
  return BROAD_REPOSITORY_HINTS.some(hint => lower.includes(hint))
}

function parseSearchQueries(content: string): string[] {
  try {
    const json = content.replace(/```(?:json)?|```/g, '').trim()
    const parsed: unknown = JSON.parse(json)
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((query): query is string => typeof query === 'string')
      .map(query => query.trim())
      .filter(Boolean)
      .slice(0, 4)
  } catch {
    return []
  }
}

export async function generateRepositorySearchQueries(
  query: string,
  repository: string,
): Promise<string[]> {
  console.log('\n🧭 HyDE — Generating repository search facets...')

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content:
          `You create internal search queries for a source-code repository.
           Expand the user's broad repository question into exactly 4 focused search queries
           that retrieve complementary implementation evidence. Cover different parts of the
           requested flow, such as entry points, routes, indexing, retrieval, answer generation,
           and persistence when relevant. Preserve exact identifiers from the question.
           Do not answer the question. Do not invent repository-specific identifiers.
           Return only a JSON array of 4 strings.`
      },
      {
        role: 'user',
        content: `Repository: ${repository}\nQuestion: ${query}`
      }
    ],
    temperature: 0.2,
    max_tokens:  320,
  })

  const generated = parseSearchQueries(response.choices[0]?.message?.content?.trim() ?? '')
  const facets = generated.length === 4 ? generated : DEFAULT_REPOSITORY_SEARCH_FACETS
  const queries = [query, ...facets]

  console.log(`  🔎 Search facets: ${queries.length}`)
  queries.forEach((searchQuery, i) => console.log(`    ${i + 1}. ${searchQuery.slice(0, 120)}`))

  return queries
}

// ─────────────────────────────────────────────────────────────
// GENERATE HYPOTHETICAL DOCUMENT
// ─────────────────────────────────────────────────────────────

export async function generateHypotheticalDocument(
  query: string,
  options: { repository?: string } = {}
): Promise<string> {

  const isRepoQuery = !!options.repository

  console.log(`\n💭 HyDE — Generating ${isRepoQuery ? 'repository retrieval passage' : 'hypothetical answer'}...`)

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content:
          isRepoQuery
          ? `You improve search queries for a source-code repository.
             Given a user's question, write a compact retrieval passage that is likely
             to match the relevant implementation. Preserve exact file names, function
             names, classes, routes, and error messages from the question. Add closely
             related code concepts and likely implementation terminology only when useful.
             Focus on what code must be retrieved to answer the question thoroughly.
             Do not answer the user, write a plan, or add headings.
             Keep it under 140 words.`
          : `You are a document passage generator.
           Given a question, write a short factual passage (2-4 sentences)
           that would ANSWER this question if it existed in a real document.
           Write it as a statement — not as a question.
           Do NOT say "I think" or "possibly" — write it as if it is fact.
           Keep it under 100 words.`
      },
      {
        role: 'user',
        content: query
      }
    ],
    temperature: isRepoQuery ? 0.25 : 0.7,
    max_tokens:  isRepoQuery ? 220 : 150,
  })

  const hypothetical = response.choices[0]?.message?.content?.trim() ?? query

  console.log(`  📝 Hypothetical: "${hypothetical.slice(0, 100)}..."`)

  return hypothetical
}
