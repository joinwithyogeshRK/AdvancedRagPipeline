// ============================================================
// BM25 — Keyword Relevance Scoring from Scratch
// ============================================================

const K1 = 1.5
const B  = 0.75

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export interface BM25Chunk {
  id: string
  text: string
  metadata?: Record<string, any>
}

export interface BM25Result {
  chunk: BM25Chunk
  score: number
  rank: number
}

export type Tokenizer = (text: string) => string[]

interface BM25Index {
  chunks: BM25Chunk[]
  tokenizedChunks: string[][]
  chunkLengths: number[]
  avgChunkLength: number
  documentFrequency: Map<string, number>
  N: number
  tokenizer: Tokenizer
}

// ─────────────────────────────────────────────────────────────
// TOKENIZERS
// ─────────────────────────────────────────────────────────────

// Default tokenizer — strips punctuation and lowercases. Good enough for
// generic prose. NOT good for engineering codes where "8.2.1.2" and "f_ck"
// must survive as single tokens (use civilCodeTokenizer for those).
export const defaultTokenizer: Tokenizer = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(token => token.length > 1)

// Civil-code tokenizer: preserves clause numbers (8.2.1.2), symbol tokens
// (f_ck, σ_st), IS standard references (IS 456:2000 -> 'is456:2000'), and
// table references (Table 4 -> 'table4'). Keeps Greek letters via Unicode
// classes. Case-insensitive; lowercased after extraction.
//
// Strategy: match a sequence of "interesting" patterns in priority order
// rather than splitting + stripping. The longest match wins per position.
const CIVIL_TOKEN_RE = new RegExp(
  [
    // "IS 456:2000" / "IS 3025 (Part 22)" — collapse spaces to keep as one token
    "IS\\s*\\d{2,5}(?:\\s*\\(Part\\s*\\d+\\))?(?:\\s*:\\s*\\d{4})?",
    // "Table 4" / "Annex B"
    "Table\\s*\\d+",
    "Annex\\s*[A-Z]",
    // Clause number with optional letter suffix: 8.2.1.2, 26.5.1.1(b), B-1.1.1
    "[A-Z]?-?\\d+(?:\\.\\d+)+(?:\\([a-z]\\))?",
    // Symbol tokens like f_ck, σ_st, f_{ck}
    "[A-Za-zα-ωΑ-Ω][A-Za-zα-ωΑ-Ω0-9]*_[A-Za-zα-ωΑ-Ω0-9]+",
    // Greek single letters
    "[α-ωΑ-Ω]",
    // Plain words (3+ chars to drop noise)
    "[A-Za-z][A-Za-z0-9]{2,}",
    // Bare integers (e.g. "300", "20")
    "\\d{2,}",
  ].join("|"),
  "g",
)

export const civilCodeTokenizer: Tokenizer = (text) => {
  const out: string[] = []
  const matches = text.matchAll(CIVIL_TOKEN_RE)
  for (const m of matches) {
    const token = m[0]
      .toLowerCase()
      .replace(/\s+/g, '')   // "Table 4" -> "table4", "IS 456:2000" -> "is456:2000"
    if (token.length > 1) out.push(token)
  }
  return out
}

// ─────────────────────────────────────────────────────────────
// BUILD INDEX
// ─────────────────────────────────────────────────────────────

export function buildBM25Index(
  chunks: BM25Chunk[],
  tokenizer: Tokenizer = defaultTokenizer,
): BM25Index {
  const tokenizedChunks = chunks.map(c => tokenizer(c.text))
  const chunkLengths    = tokenizedChunks.map(t => t.length)
  const avgChunkLength  = chunkLengths.length > 0
    ? chunkLengths.reduce((a, b) => a + b, 0) / chunks.length
    : 0

  const documentFrequency = new Map<string, number>()

  for (const tokens of tokenizedChunks) {
    const uniqueTokens = new Set(tokens)
    for (const token of uniqueTokens) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1)
    }
  }

  return {
    chunks,
    tokenizedChunks,
    chunkLengths,
    avgChunkLength,
    documentFrequency,
    N: chunks.length,
    tokenizer,
  }
}

// ─────────────────────────────────────────────────────────────
// IDF
// ─────────────────────────────────────────────────────────────

function computeIDF(word: string, index: BM25Index): number {
  const n = index.documentFrequency.get(word) ?? 0
  if (n === 0) return 0
  return Math.log((index.N - n + 0.5) / (n + 0.5) + 1)
}

// ─────────────────────────────────────────────────────────────
// SCORE ONE CHUNK
// ─────────────────────────────────────────────────────────────

function scoreChunk(
  chunkIndex: number,
  queryTokens: string[],
  index: BM25Index
): number {
  const tokens   = index.tokenizedChunks[chunkIndex]
  const chunkLen = index.chunkLengths[chunkIndex]
  const avgLen   = index.avgChunkLength

  const termFrequency = new Map<string, number>()

  for (const token of tokens!) {
    termFrequency.set(token, (termFrequency.get(token) ?? 0) + 1)
  }

  let totalScore = 0

  for (const queryToken of queryTokens) {
    const freq = termFrequency.get(queryToken) ?? 0
    if (freq === 0) continue

    const idf         = computeIDF(queryToken, index)
    const numerator   = freq * (K1 + 1)
    const denominator = freq + K1 * (1 - B + B * (chunkLen! / avgLen))
    const tf          = numerator / denominator

    totalScore += idf * tf
  }

  return totalScore
}

// ─────────────────────────────────────────────────────────────
// SEARCH
// ─────────────────────────────────────────────────────────────

export function searchBM25(
  query: string,
  index: BM25Index,
  topK: number = 5
): BM25Result[] {
  const queryTokens = index.tokenizer(query)

  const scored = index.chunks.map((chunk, i) => ({
    chunk,
    score: scoreChunk(i, queryTokens, index)
  }))

  scored.sort((a, b) => b.score - a.score)

  return scored
    .slice(0, topK)
    .map((result, i) => ({
      ...result,
      rank: i + 1
    }))
}