import Groq from 'groq-sdk'
import { askBedrock } from './bedrock.js'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY ?? '' })

const JUDGE_SYSTEM_PROMPT = `You are a strict RAG evaluation judge.
Always respond with ONLY valid JSON in this exact format:
{ "score": <number between 0 and 1>, "reason": "<one sentence>" }
No markdown. No explanation outside JSON.`

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export interface EvalResult {
  faithfulness:     number   // 0-1: answer grounded in chunks?
  answerRelevance:  number   // 0-1: answer addresses the query?
  contextPrecision: number   // 0-1: chunks were actually useful?
  overallScore:     number   // 0-1: weighted average
  reasoning: {
    faithfulness:     string
    answerRelevance:  string
    contextPrecision: string
  }
}

// ─────────────────────────────────────────────────────────────
// HELPER — ask Groq to judge, parse score back
// ─────────────────────────────────────────────────────────────

async function judgeWithGroq(prompt: string): Promise<{ score: number; reason: string }> {
  // Primary: Bedrock Haiku. Fall back to Groq if Bedrock is unavailable.
  let raw = ''
  try {
    raw = await askBedrock(
      JUDGE_SYSTEM_PROMPT,
      [{ role: 'user', content: prompt }],
      { temperature: 0, maxTokens: 200 },
    )
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn(`⚠️  Bedrock eval-judge failed (${msg}); falling back to Groq`)
    try {
      const response = await groq.chat.completions.create({
        model:       'llama-3.3-70b-versatile',
        temperature: 0,
        max_tokens:  200,
        messages: [
          { role: 'system', content: JUDGE_SYSTEM_PROMPT },
          { role: 'user',   content: prompt },
        ],
      })
      raw = response.choices[0]?.message?.content?.trim() ?? ''
    } catch (e2: unknown) {
      const msg2 = e2 instanceof Error ? e2.message : String(e2)
      console.warn(`⚠️  Groq eval-judge also failed (${msg2})`)
      return { score: 0.5, reason: 'Both Bedrock and Groq judges failed' }
    }
  }

  // Some models wrap JSON in ```json ... ``` blocks. Strip if present.
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()

  try {
    const parsed = JSON.parse(cleaned)
    return {
      score:  Math.min(1, Math.max(0, Number(parsed.score))),  // clamp 0-1
      reason: parsed.reason ?? 'No reason provided'
    }
  } catch {
    console.warn('⚠️  Eval JSON parse failed — raw:', raw)
    return { score: 0.5, reason: 'Parse failed — defaulted to 0.5' }
  }
}

// ─────────────────────────────────────────────────────────────
// METRIC 1 — FAITHFULNESS
// Did the answer come from the chunks or did LLM hallucinate?
// ─────────────────────────────────────────────────────────────

async function judgeFaithfulness(
  chunks: string[],
  answer: string
): Promise<{ score: number; reason: string }> {

  const context = chunks.map((c, i) => `[Chunk ${i + 1}]: ${c}`).join('\n\n')

  const prompt = `
You are evaluating whether an AI answer is faithful to the source chunks.

SOURCE CHUNKS:
${context}

AI ANSWER:
${answer}

Score from 0 to 1:
- 1.0 = every claim in the answer is directly supported by the chunks
- 0.5 = answer is partially supported, some claims are not in chunks
- 0.0 = answer contains claims not found in chunks (hallucination)

Respond with JSON only: { "score": <0-1>, "reason": "<one sentence>" }
`
  return judgeWithGroq(prompt)
}

// ─────────────────────────────────────────────────────────────
// METRIC 2 — ANSWER RELEVANCE
// Does the answer actually address what was asked?
// ─────────────────────────────────────────────────────────────

async function judgeAnswerRelevance(
  query:  string,
  answer: string
): Promise<{ score: number; reason: string }> {

  const prompt = `
You are evaluating whether an AI answer is relevant to the user's question.

USER QUESTION:
${query}

AI ANSWER:
${answer}

Score from 0 to 1:
- 1.0 = answer directly and completely addresses the question
- 0.5 = answer is related but incomplete or partially off-topic
- 0.0 = answer does not address the question at all

Respond with JSON only: { "score": <0-1>, "reason": "<one sentence>" }
`
  return judgeWithGroq(prompt)
}

// ─────────────────────────────────────────────────────────────
// METRIC 3 — CONTEXT PRECISION
// Were the retrieved chunks actually useful for answering?
// ─────────────────────────────────────────────────────────────

async function judgeContextPrecision(
  query:  string,
  chunks: string[]
): Promise<{ score: number; reason: string }> {

  const context = chunks.map((c, i) => `[Chunk ${i + 1}]: ${c}`).join('\n\n')

  const prompt = `
You are evaluating whether retrieved chunks are relevant to answer a question.

USER QUESTION:
${query}

RETRIEVED CHUNKS:
${context}

Score from 0 to 1:
- 1.0 = all chunks are directly relevant to answering the question
- 0.5 = some chunks are relevant, others are noise
- 0.0 = chunks are irrelevant to the question

Respond with JSON only: { "score": <0-1>, "reason": "<one sentence>" }
`
  return judgeWithGroq(prompt)
}

// ─────────────────────────────────────────────────────────────
// MAIN EXPORT — run all 3 metrics in parallel
// ─────────────────────────────────────────────────────────────

export async function evalRAG(
  query:  string,
  chunks: string[],
  answer: string
): Promise<EvalResult> {

  console.log('\n📊 Running RAG Evaluation...')

  // All 3 judges run in parallel — no reason to wait sequentially
  const [faithfulness, answerRelevance, contextPrecision] = await Promise.all([
    judgeFaithfulness(chunks, answer),
    judgeAnswerRelevance(query, answer),
    judgeContextPrecision(query, chunks),
  ])

  // Weighted average — faithfulness matters most in RAG
  const overallScore = (
    faithfulness.score     * 0.4 +
    answerRelevance.score  * 0.4 +
    contextPrecision.score * 0.2
  )

  const result: EvalResult = {
    faithfulness:     faithfulness.score,
    answerRelevance:  answerRelevance.score,
    contextPrecision: contextPrecision.score,
    overallScore:     Math.round(overallScore * 100) / 100,
    reasoning: {
      faithfulness:     faithfulness.reason,
      answerRelevance:  answerRelevance.reason,
      contextPrecision: contextPrecision.reason,
    }
  }

  // ── Pretty terminal output ────────────────────────────────
  console.log('\n┌─────────────────────────────────────────┐')
  console.log('│           RAG EVALUATION REPORT          │')
  console.log('├─────────────────────────────────────────┤')
  console.log(`│  Faithfulness      : ${bar(faithfulness.score)}  ${pct(faithfulness.score)} │`)
  console.log(`│  Answer Relevance  : ${bar(answerRelevance.score)}  ${pct(answerRelevance.score)} │`)
  console.log(`│  Context Precision : ${bar(contextPrecision.score)}  ${pct(contextPrecision.score)} │`)
  console.log('├─────────────────────────────────────────┤')
  console.log(`│  OVERALL SCORE     : ${bar(overallScore)}  ${pct(overallScore)} │`)
  console.log('└─────────────────────────────────────────┘')
  console.log(`\n  💬 Faithfulness:     ${faithfulness.reason}`)
  console.log(`  💬 Answer Relevance: ${answerRelevance.reason}`)
  console.log(`  💬 Context Precision:${contextPrecision.reason}`)

  return result
}

// ─────────────────────────────────────────────────────────────
// DISPLAY HELPERS
// ─────────────────────────────────────────────────────────────

function bar(score: number): string {
  const filled = Math.round(score * 10)
  return '█'.repeat(filled) + '░'.repeat(10 - filled)
}

function pct(score: number): string {
  return `${Math.round(score * 100)}%`.padStart(4)
}