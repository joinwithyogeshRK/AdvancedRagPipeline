// Walks the merged AST and emits one chunk per retrievable unit, following
// the table in the plan. Each chunk carries:
//   • text  — what gets embedded; the heading path is prepended so even an
//             isolated retrieved chunk is self-contextualizing
//   • metadata — flat Pinecone-compatible metadata (CivilCodeMetadata)
//   • a deterministic ID — re-running ingest upserts in place
//
// This module also returns the parallel SQL rows (clauses, etc.) so the
// orchestrator can upsert them in one place.

import type {
  AnnexClauseBlock,
  ClauseBlock,
  ClauseRow,
  CivilChunk,
  CivilCodeMetadata,
  EquationBlock,
  ForewordBlock,
  IsCodeAst,
  IsCodeBlock,
  NoteBlock,
  SymbolBlock,
  AmendmentBlock,
} from "./types.js";
import { getAmendedBy, isAmended } from "./amendmentMerger.js";

export type ChunkingOutput = {
  chunks: CivilChunk[];
  clauseRows: ClauseRow[];
};

export const chunkClauses = (ast: IsCodeAst): ChunkingOutput => {
  const chunks: CivilChunk[] = [];
  const clauseRows: ClauseRow[] = [];
  const symbolsInDoc = collectSymbols(ast.blocks);

  // Track NOTES that follow each clause so we can render `clause_note` chunks
  // pointing back to the right clause. The parser already attaches NOTES via
  // their `underClause` field, so this is straightforward.
  const cross = extractCrossRefsByClause(ast.blocks);

  for (const block of ast.blocks) {
    switch (block.kind) {
      case "clause":
        // Skip clauses with no body — they're either TOC entries that never
        // got prose attached, or duplicate heading markers.
        if (block.text.trim().length < 20) break;
        emitClause(ast, block, chunks, clauseRows, symbolsInDoc, cross);
        break;
      case "annex_clause":
        emitAnnexClause(ast, block, chunks, clauseRows, symbolsInDoc, cross);
        break;
      case "note":
        emitNote(ast, block, chunks);
        break;
      case "equation":
        emitEquation(ast, block, chunks);
        break;
      case "symbol":
        emitSymbol(ast, block, chunks);
        break;
      case "amendment":
        emitAmendment(ast, block, chunks);
        break;
      case "foreword":
        emitForeword(ast, block, chunks);
        break;
      // "section", "table", "informal_table" handled elsewhere
      default:
        break;
    }
  }

  return { chunks, clauseRows };
};

// ---------- Clause ----------

const emitClause = (
  ast: IsCodeAst,
  c: ClauseBlock,
  chunks: CivilChunk[],
  rows: ClauseRow[],
  symbolsInDoc: Set<string>,
  cross: Map<string, string[]>,
) => {
  const headingHierarchy = c.headingPath.join(" > ");
  const symbolsUsed = symbolsReferenced(c.text, symbolsInDoc);
  const crossRefs = cross.get(c.number) ?? [];
  const amendedBy = getAmendedBy(c);

  const text = renderClauseChunkText(c, headingHierarchy);

  const meta: CivilCodeMetadata = {
    doc_id: ast.docId,
    doc_version: ast.versionLabel,
    content_type: "clause",
    clause_number: c.number,
    clause_path: c.number.split(/[.()]/).filter(Boolean).join("/"),
    heading_hierarchy: headingHierarchy,
    ...(c.section !== undefined ? { section: c.section } : {}),
    ...(c.page !== undefined ? { page_number: c.page } : {}),
    ...(symbolsUsed.length > 0 ? { symbols_used: symbolsUsed } : {}),
    ...(crossRefs.length > 0 ? { cross_references: crossRefs } : {}),
    ...(isAmended(c) ? { is_amended: true } : {}),
    ...(amendedBy.length > 0 ? { amended_by: amendedBy.join(", ") } : {}),
  };

  chunks.push({
    id: `civil:${ast.docId}:clause:${c.number}`,
    text,
    metadata: meta,
  });

  rows.push({
    doc_id: ast.docId,
    clause_number: c.number,
    body: c.text,
    heading_path: c.headingPath,
    is_amended: isAmended(c),
    amended_by: amendedBy,
    is_annex: false,
    ...(c.title !== undefined ? { clause_title: c.title } : {}),
    ...(c.section !== undefined ? { section: c.section } : {}),
    ...(c.parentClause !== undefined ? { parent_clause: c.parentClause } : {}),
    ...(c.page !== undefined ? { page_number: c.page } : {}),
  });
};

const renderClauseChunkText = (c: ClauseBlock, headingHierarchy: string): string => {
  const titlePart = c.title ? ` — ${c.title}` : "";
  const amendNote = isAmended(c)
    ? `\n\n[Amended by: ${getAmendedBy(c).join(", ")}]`
    : "";
  return `${headingHierarchy}\n\nClause ${c.number}${titlePart}\n\n${c.text}${amendNote}`;
};

// ---------- Annex clause ----------

const emitAnnexClause = (
  ast: IsCodeAst,
  c: AnnexClauseBlock,
  chunks: CivilChunk[],
  rows: ClauseRow[],
  symbolsInDoc: Set<string>,
  cross: Map<string, string[]>,
) => {
  const headingHierarchy = c.headingPath.join(" > ");
  const symbolsUsed = symbolsReferenced(c.text, symbolsInDoc);
  const crossRefs = cross.get(c.number) ?? [];
  const titlePart = c.title ? ` — ${c.title}` : "";
  const text = `${headingHierarchy}\n\nAnnex Clause ${c.number}${titlePart}\n\n${c.text}`;

  const meta: CivilCodeMetadata = {
    doc_id: ast.docId,
    doc_version: ast.versionLabel,
    content_type: "annex_clause",
    clause_number: c.number,
    clause_path: c.number.replace("-", "/"),
    heading_hierarchy: headingHierarchy,
    ...(c.page !== undefined ? { page_number: c.page } : {}),
    ...(symbolsUsed.length > 0 ? { symbols_used: symbolsUsed } : {}),
    ...(crossRefs.length > 0 ? { cross_references: crossRefs } : {}),
  };

  chunks.push({
    id: `civil:${ast.docId}:annex_clause:${c.number}`,
    text,
    metadata: meta,
  });

  rows.push({
    doc_id: ast.docId,
    clause_number: c.number,
    body: c.text,
    heading_path: c.headingPath,
    is_amended: false,
    amended_by: [],
    is_annex: true,
    ...(c.title !== undefined ? { clause_title: c.title } : {}),
    ...(c.page !== undefined ? { page_number: c.page } : {}),
  });
};

// ---------- Note ----------

const emitNote = (ast: IsCodeAst, n: NoteBlock, chunks: CivilChunk[]) => {
  const meta: CivilCodeMetadata = {
    doc_id: ast.docId,
    doc_version: ast.versionLabel,
    content_type: "clause_note",
    clause_number: n.underClause,
    ...(n.page !== undefined ? { page_number: n.page } : {}),
  };
  chunks.push({
    id: `civil:${ast.docId}:clause_note:${n.underClause}:${hashShort(n.text)}`,
    text: `NOTE under Clause ${n.underClause}:\n\n${n.text}`,
    metadata: meta,
  });
};

// ---------- Equation ----------

const emitEquation = (ast: IsCodeAst, e: EquationBlock, chunks: CivilChunk[]) => {
  const meta: CivilCodeMetadata = {
    doc_id: ast.docId,
    doc_version: ast.versionLabel,
    content_type: "equation",
    clause_number: e.parentClause,
    ...(e.symbolsUsed.length > 0 ? { symbols_used: e.symbolsUsed } : {}),
    ...(e.page !== undefined ? { page_number: e.page } : {}),
  };
  chunks.push({
    id: `civil:${ast.docId}:equation:${e.parentClause}:${hashShort(e.raw)}`,
    text: `Equation in Clause ${e.parentClause}:\n\n${e.raw}\n\nSymbols: ${e.symbolsUsed.join(", ")}`,
    metadata: meta,
  });
};

// ---------- Symbol ----------

const emitSymbol = (ast: IsCodeAst, s: SymbolBlock, chunks: CivilChunk[]) => {
  const unitPart = s.unit ? ` [${s.unit}]` : "";
  const meta: CivilCodeMetadata = {
    doc_id: ast.docId,
    doc_version: ast.versionLabel,
    content_type: "symbol",
  };
  chunks.push({
    id: `civil:${ast.docId}:symbol:${s.symbol}`,
    text: `Symbol ${s.symbol}${unitPart} — ${s.definition}`,
    metadata: meta,
  });
};

// ---------- Amendment ----------

const emitAmendment = (
  ast: IsCodeAst,
  a: AmendmentBlock,
  chunks: CivilChunk[],
) => {
  const meta: CivilCodeMetadata = {
    doc_id: ast.docId,
    doc_version: ast.versionLabel,
    content_type: "amendment",
    ...(a.clauseRef !== undefined ? { clause_number: a.clauseRef } : {}),
    ...(a.pageRef !== undefined ? { page_number: a.pageRef } : {}),
  };
  chunks.push({
    id: `civil:${ast.docId}:amendment:${a.amendmentNo.replace(/\s+/g, "_")}:${a.clauseRef ?? "?"}:${hashShort(a.raw)}`,
    text: `Amendment ${a.amendmentNo}${a.date ? ` (${a.date})` : ""}, target: clause ${a.clauseRef ?? "?"}\n\n${a.raw}`,
    metadata: meta,
  });
};

// ---------- Foreword ----------

const emitForeword = (
  ast: IsCodeAst,
  f: ForewordBlock,
  chunks: CivilChunk[],
) => {
  const meta: CivilCodeMetadata = {
    doc_id: ast.docId,
    doc_version: ast.versionLabel,
    content_type: "foreword",
    ...(f.page !== undefined ? { page_number: f.page } : {}),
  };
  chunks.push({
    id: `civil:${ast.docId}:foreword:${f.section}:${hashShort(f.text)}`,
    text: `${f.section}\n\n${f.text}`,
    metadata: meta,
  });
};

// ---------- Helpers ----------

const collectSymbols = (blocks: IsCodeBlock[]): Set<string> => {
  const out = new Set<string>();
  for (const b of blocks) {
    if (b.kind === "symbol") out.add(b.symbol);
  }
  return out;
};

const symbolsReferenced = (text: string, symbolsInDoc: Set<string>): string[] => {
  const referenced: string[] = [];
  for (const sym of symbolsInDoc) {
    // Word-boundary check on the symbol token. f_ck matches "f_ck" but not "f_ckm".
    const re = new RegExp(`(?<![A-Za-z0-9_])${escapeRegExp(sym)}(?![A-Za-z0-9_])`);
    if (re.test(text)) referenced.push(sym);
  }
  return referenced;
};

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const extractCrossRefsByClause = (
  blocks: IsCodeBlock[],
): Map<string, string[]> => {
  const out = new Map<string, string[]>();
  const refPattern = /\(see\s+([A-Z]?-?\d+(?:\.\d+)*|Table\s+\d+|Annex\s+[A-Z])\)/gi;
  for (const b of blocks) {
    if (b.kind !== "clause" && b.kind !== "annex_clause") continue;
    const refs = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = refPattern.exec(b.text)) !== null) {
      const ref = (m[1] ?? "").trim();
      if (ref) refs.add(ref);
    }
    if (refs.size > 0) out.set(b.number, [...refs]);
  }
  return out;
};

const hashShort = (s: string): string => {
  // Lightweight 32-bit FNV-1a hash, hex. Stable across runs.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
};
