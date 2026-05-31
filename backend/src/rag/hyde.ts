import Groq from 'groq-sdk'

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!
})

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
