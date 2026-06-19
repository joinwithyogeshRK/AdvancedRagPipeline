// Structure-Aware Chunker
// Splits on meaning boundaries — not character counts

const MAX_CHUNK_SIZE = 600
const MIN_CHUNK_SIZE = 40
const OVERLAP_SIZE   = 80

type ChunkType = 'prose' | 'table' | 'code' | 'header'

interface Section {
  text: string
  type: ChunkType
}


// LINE TYPE DETECTION


function isBlankLine(line: string): boolean {
  return line.trim().length === 0
}

function isMarkdownTableRow(line: string): boolean {
  const trimmed = line.trim()
  // | col | col |  or  |---|---|
  return /^\|.*\|$/.test(trimmed) || /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?$/.test(trimmed)
}

function isTableRow(line: string): boolean {
  if (isMarkdownTableRow(line)) return true
  const hasMultipleSpaces = /\s{2,}/.test(line)
  const hasTablePattern   = /[A-Z]{2,}\s{2,}/.test(line)
  const hasNumericColumns = /\d\s{2,}[A-Z]\s{2,}\d/.test(line)
  return hasMultipleSpaces && (hasTablePattern || hasNumericColumns)
}

function isCodeFence(line: string): boolean {
  return /^\s*```/.test(line)
}

function isHeader(line: string): boolean {
  const trimmed = line.trim()
  if (trimmed.length === 0) return false

  // Markdown headers: #, ##, ### ...
  if (/^#{1,6}\s+\S/.test(trimmed)) return true

  // Numbered headers: "1. Introduction", "2.3 Scope"
  if (/^\d+(\.\d+)*\.?\s+[A-Z][^,;]{2,78}$/.test(trimmed) && trimmed.length < 80) return true

  // ALL CAPS short line, no trailing comma/semicolon
  const isAllCaps    = trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed) && trimmed.length > 5
  const isShortClean = trimmed.length < 80 && !/[,;]$/.test(trimmed)
  return isAllCaps && isShortClean
}


// SPLIT LARGE SECTION


function splitLargeSection(text: string): string[] {
  if (text.length <= MAX_CHUNK_SIZE) return [text]

  const results:   string[] = []
  const sentences            = text.split(/(?<=[.!?])\s+/)
  let   current              = ''

  for (const sentence of sentences) {
    if ((current + ' ' + sentence).trim().length <= MAX_CHUNK_SIZE) {
      current = (current + ' ' + sentence).trim()
    } else {
      if (current.length >= MIN_CHUNK_SIZE) results.push(current)

      // Snap overlap to the next whole word so we don't start mid-token
      let overlapText = current.slice(-OVERLAP_SIZE)
      overlapText = overlapText.replace(/^\S*\s/, '')

      current = (overlapText + ' ' + sentence).trim()
    }
  }

  if (current.length >= MIN_CHUNK_SIZE) results.push(current)
  return results
}


// MERGE SMALL CHUNKS (instead of dropping them)


function mergeSmallChunks(sections: Section[]): Section[] {
  const cleaned = sections
    .map(s => ({ text: s.text.trim(), type: s.type }))
    .filter(s => s.text.length > 0)

  if (cleaned.length === 0) return []

  const merged: Section[] = []

  for (const section of cleaned) {
    const prev = merged[merged.length - 1]

    if (
      prev !== undefined &&
      prev.text.length < MIN_CHUNK_SIZE &&
      (prev.text.length + section.text.length) <= MAX_CHUNK_SIZE
    ) {
      // Glue the too-small previous chunk onto this one.
      // Preserve structure with a newline if either side is table/code.
      const joiner = (prev.type === 'code' || prev.type === 'table' ||
                       section.type === 'code' || section.type === 'table') ? '\n' : ' '
      merged[merged.length - 1] = {
        text: `${prev.text}${joiner}${section.text}`,
        // promote to the more "structural" type so cleanup doesn't mangle it
        type: section.type === 'prose' ? prev.type : section.type,
      }
    } else {
      merged.push(section)
    }
  }

  // If the final chunk is still too small, fold it backward into its neighbor
  if (merged.length > 1) {
    const last = merged[merged.length - 1]!
    if (last.text.length < MIN_CHUNK_SIZE) {
      const prev = merged[merged.length - 2]!
      const joiner = (prev.type === 'code' || prev.type === 'table' ||
                       last.type === 'code' || last.type === 'table') ? '\n' : ' '
      merged[merged.length - 2] = {
        text: `${prev.text}${joiner}${last.text}`,
        type: last.type === 'prose' ? prev.type : last.type,
      }
      merged.pop()
    }
  }

  return merged
}


// FINAL CLEAN (type-aware — don't destroy table/code formatting)


function cleanSection(section: Section): string {
  if (section.type === 'table' || section.type === 'code') {
    // Preserve internal line breaks, just trim each line and drop blank
    // lines at the very start/end.
    const lines = section.text.split('\n').map(l => l.replace(/\s+$/, ''))
    while (lines.length && lines[0]!.trim() === '') lines.shift()
    while (lines.length && lines[lines.length - 1]!.trim() === '') lines.pop()
    return lines.join('\n')
  }
  // prose / header — safe to collapse all whitespace to single spaces
  return section.text.replace(/\s+/g, ' ').trim()
}


// MAIN CHUNKER


const chunkText = (document: string): string[] => {
  const lines    = document.split('\n')
  const sections: Section[] = []
  let   current  = ''
  let   inTable  = false
  let   inCode   = false

  const flush = (type: ChunkType) => {
    if (current.trim().length > 0) {
      sections.push({ text: current.trim(), type })
    }
    current = ''
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!

    // Code fence — treat the whole block as one atomic, untouched chunk
    if (isCodeFence(line)) {
      if (!inCode) {
        flush('prose')
        inCode  = true
        current = line
      } else {
        current += '\n' + line
        flush('code')
        inCode = false
      }
      continue
    }

    if (inCode) {
      current += '\n' + line
      continue
    }

    // Blank line = section boundary
    if (isBlankLine(line)) {
      flush(inTable ? 'table' : 'prose')
      inTable = false
      continue
    }

    // Table row
    if (isTableRow(line)) {
      if (!inTable) {
        flush('prose')
        inTable = true
      }
      current += (current ? '\n' : '') + line
      continue
    }

    // Leaving a table
    if (inTable && !isTableRow(line)) {
      flush('table')
      inTable = false
    }

    // Header = fresh chunk
    if (isHeader(line)) {
      flush('prose')
      current = line
      flush('header')
      continue
    }

    // Normal line
    current += (current ? ' ' : '') + line.trim()

    // Too large — split at sentence boundary
    if (current.length > MAX_CHUNK_SIZE) {
      const splits = splitLargeSection(current)
      splits.slice(0, -1).forEach(s => sections.push({ text: s, type: 'prose' }))
      current = splits[splits.length - 1] ?? ''
    }
  }

  // Trailing content (close out whatever state we ended in)
  flush(inTable ? 'table' : inCode ? 'code' : 'prose')

  // Merge anything too small instead of discarding it
  const merged = mergeSmallChunks(sections)

  // Type-aware whitespace cleanup
  const chunks = merged
    .map(cleanSection)
    .filter(s => s.length > 0)

  console.log(`📦 Structure-aware chunker: ${chunks.length} chunks`)
  chunks.forEach((c, i) =>
    console.log(`  [${i + 1}] (${c.length} chars) "${c.slice(0, 70)}..."`)
  )

  return chunks
}

export { chunkText }