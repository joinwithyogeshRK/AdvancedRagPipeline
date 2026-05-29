// HyDE: generate a hypothetical answer passage so we can embed it instead
// of (or alongside) the raw query. Embedding a passage-shaped query
// usually beats embedding a question-shaped one for retrieval.
//
// Backed by AWS Bedrock (Claude Haiku) like the rest of the LLM stack.
// Groq is kept as a transparent fallback in case Bedrock is unavailable.

import Groq from 'groq-sdk'
import { askBedrock } from './bedrock.js'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY ?? '' })

const SYSTEM_PROMPT = `You are a document passage generator.
Given a question, write a short factual passage (2-4 sentences)
that would ANSWER this question if it existed in a real document.
Write it as a statement — not as a question.
Do NOT say "I think" or "possibly" — write it as if it is fact.
Keep it under 100 words.`

export async function generateHypotheticalDocument(
  query: string,
): Promise<string> {

  console.log('\n💭 HyDE — Generating hypothetical answer...')

  // Primary: Bedrock Haiku
  try {
    const hypothetical = await askBedrock(
      SYSTEM_PROMPT,
      [{ role: 'user', content: query }],
      { temperature: 0.7, maxTokens: 200 },
    )
    console.log(`  📝 Hypothetical: "${hypothetical.slice(0, 100)}..."`)
    return hypothetical || query
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn(`⚠️  Bedrock HyDE failed (${msg}); falling back to Groq`)
  }

  // Fallback: Groq Llama
  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: query },
      ],
      temperature: 0.7,
      max_tokens:  150,
    })
    const hypothetical = response.choices[0]?.message?.content?.trim() ?? query
    console.log(`  📝 Hypothetical (Groq fallback): "${hypothetical.slice(0, 100)}..."`)
    return hypothetical
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn(`⚠️  Groq HyDE also failed (${msg}); using raw query`)
    return query
  }
}
