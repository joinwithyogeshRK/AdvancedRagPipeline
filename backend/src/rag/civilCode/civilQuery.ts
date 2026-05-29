// Route-aware retrieval for civil-code queries. Given a query and a doc_id,
// returns the chunks to feed into Groq plus a label for the prompt.
//
// Flow:
//   1. Load known clauses + symbols for the doc (small, cached per request)
//   2. classifyQuery(...) -> route
//   3. Per-route fetch:
//        clause_lookup: SQL fetch the clause + parent + any NOTES
//        symbol_lookup: SQL symbol + clauses that use it (vector filter)
//        table_lookup:  SQL table summary + matching rows
//        conceptual:    vector + civil-BM25 hybrid + Cohere rerank, then
//                       cross-ref expansion
//
// Output text is shaped so the LLM can cite clause numbers verbatim — each
// chunk's first line contains "Clause N.N.N" or "Table N", etc.

import { embedQuery } from "../embedder.js";
import { searchCivilPinecone } from "../pinecone.js";
import { rerankChunks } from "../reranker.js";
import { generateHypotheticalDocument } from "../hyde.js";
import {
  buildBM25Index,
  civilCodeTokenizer,
  searchBM25,
  type BM25Chunk,
} from "../bm25.js";
import { classifyQuery, shouldUseHyDE, type RouteResult } from "../queryRouter.js";
import {
  getClauseByNumber,
  getClausesInPrefix,
  getOutgoingRefs,
  getSymbolByName,
  getTableRows,
  listIsCodes,
} from "../../services/civilCodeService.js";
import { supabase } from "../../lib/supabase.js";

export type CivilQueryResult = {
  route: RouteResult["route"];
  chunks: string[];
  civilDocLabel: string;
  debug?: Record<string, unknown>;
};

export const civilQuery = async (
  query: string,
  docId: string,
): Promise<CivilQueryResult> => {
  // ---- 1. Doc metadata (label for the LLM prompt)
  const codes = await listIsCodes();
  const code = codes.find((c) => c.doc_id === docId);
  const civilDocLabel = code
    ? `${code.title} (${code.doc_id.replace(/_/g, " ").replace(" ", " ").trim()}, ${code.version_label})`
    : docId.replace(/_/g, " ");

  // ---- 2. Known clauses + symbols for the router
  const [{ data: clauseRows }, { data: symbolRows }] = await Promise.all([
    supabase.from("is_code_clauses").select("clause_number").eq("doc_id", docId),
    supabase.from("is_code_symbols").select("symbol").eq("doc_id", docId),
  ]);
  const knownClauseNumbers = new Set<string>(
    (clauseRows ?? []).map((r: { clause_number: string }) => r.clause_number),
  );
  const knownSymbols = new Set<string>(
    (symbolRows ?? []).map((r: { symbol: string }) => r.symbol),
  );

  const route = classifyQuery(query, { knownClauseNumbers, knownSymbols });
  console.log(`🛣  Civil route: ${route.route}`, route);

  // ---- 3. Per-route fetch
  switch (route.route) {
    case "clause_lookup": {
      const chunks = await fetchClauseLookup(docId, route.clauseNumber);
      return { route: route.route, chunks, civilDocLabel };
    }
    case "symbol_lookup": {
      const chunks = await fetchSymbolLookup(docId, route.symbol);
      return { route: route.route, chunks, civilDocLabel };
    }
    case "table_lookup": {
      const chunks = await fetchTableLookup(
        docId,
        route.tableNumber,
        route.hints,
      );
      return { route: route.route, chunks, civilDocLabel };
    }
    case "conceptual": {
      const chunks = await fetchConceptual(docId, query);
      return { route: route.route, chunks, civilDocLabel };
    }
  }
};

// ---------- clause_lookup ----------

const fetchClauseLookup = async (
  docId: string,
  clauseNumber: string,
): Promise<string[]> => {
  const exact = await getClauseByNumber(docId, clauseNumber);
  if (!exact) {
    // Fall back to prefix match (user asked for "8.2" — return whole subtree).
    const family = await getClausesInPrefix(docId, clauseNumber);
    return family.map(renderClauseRow);
  }
  const chunks: string[] = [renderClauseRow(exact)];

  if (exact.parent_clause) {
    const parent = await getClauseByNumber(docId, exact.parent_clause);
    if (parent) chunks.unshift(renderClauseRow(parent));
  }

  // Sibling sub-clauses (immediate children of this clause).
  const children = await getClausesInPrefix(docId, `${clauseNumber}.`);
  for (const c of children.slice(0, 4)) {
    if (c.clause_number !== clauseNumber) chunks.push(renderClauseRow(c));
  }

  return chunks;
};

// ---------- symbol_lookup ----------

const fetchSymbolLookup = async (
  docId: string,
  symbol: string,
): Promise<string[]> => {
  const sym = await getSymbolByName(docId, symbol);
  const chunks: string[] = [];
  if (sym) {
    const unitPart = sym.unit ? ` [${sym.unit}]` : "";
    chunks.push(`Symbol ${sym.symbol}${unitPart} — ${sym.definition}`);
  }
  // Find clauses that use this symbol (via Pinecone metadata filter).
  // We use the symbol token itself as a "query" — Cohere reranker doesn't
  // matter here; we just want any chunks tagged with symbols_used = symbol.
  try {
    const qv = await embedQuery(symbol);
    const hits = await searchCivilPinecone(qv, 5, {
      doc_id: docId,
      content_type: ["clause", "equation"],
      symbols_used: symbol,
    });
    for (const h of hits) chunks.push(h.text);
  } catch (e: unknown) {
    console.warn("symbol_lookup vector fetch failed (non-fatal):", (e as Error).message);
  }
  return chunks;
};

// ---------- table_lookup ----------

const fetchTableLookup = async (
  docId: string,
  tableNumber: string | undefined,
  hints: string[],
): Promise<string[]> => {
  const chunks: string[] = [];

  if (tableNumber) {
    const rows = await getTableRows(docId, tableNumber);
    if (rows.length > 0) {
      const first = rows[0];
      chunks.push(`${tableNumber}: ${first?.table_title ?? ""}`);
      for (const r of rows) chunks.push(renderTableRow(tableNumber, r));
      return chunks;
    }
  }

  // No explicit table number — fall back to vector search constrained to
  // table_row / table_summary content types, using the hints as the query.
  const queryHint = hints.join(" ") || "table value";
  try {
    const qv = await embedQuery(queryHint);
    const hits = await searchCivilPinecone(qv, 8, {
      doc_id: docId,
      content_type: ["table_row", "table_summary"],
    });
    for (const h of hits) chunks.push(h.text);
  } catch (e: unknown) {
    console.warn("table_lookup vector fetch failed (non-fatal):", (e as Error).message);
  }
  return chunks;
};

const renderTableRow = (tableNumber: string, r: any): string => {
  const lines: string[] = [];
  lines.push(`${tableNumber}${r.row_label ? `, row ${r.row_label}` : ""}`);
  if (r.columns && typeof r.columns === "object") {
    for (const [k, v] of Object.entries(r.columns as Record<string, string>)) {
      if (v && String(v).trim()) lines.push(`  ${k}: ${v}`);
    }
  }
  if (r.notes) lines.push(`  NOTES: ${r.notes}`);
  return lines.join("\n");
};

// ---------- conceptual ----------

const fetchConceptual = async (
  docId: string,
  query: string,
): Promise<string[]> => {
  // HyDE on for conceptual queries.
  const useHyde = shouldUseHyDE("conceptual");
  const queryText = useHyde ? await generateHypotheticalDocument(query) : query;
  const queryVector = await embedQuery(queryText);

  // Vector hits.
  const vectorHits = await searchCivilPinecone(queryVector, 8, {
    doc_id: docId,
    content_type: ["clause", "clause_note", "equation", "annex_clause"],
  });

  // Civil-tokenized BM25 over the vector candidates (small corpus = cheap).
  const bm25Chunks: BM25Chunk[] = vectorHits.map((h) => ({
    id: h.id,
    text: h.text,
    metadata: h.metadata ?? {},
  }));
  const bm25 = buildBM25Index(bm25Chunks, civilCodeTokenizer);
  const bm25Hits = searchBM25(query, bm25, Math.min(bm25Chunks.length, 5));

  // Merge: prefer BM25-ranked when scores nonzero; otherwise vector order.
  const merged: string[] = [];
  const seenIds = new Set<string>();
  for (const h of bm25Hits) {
    if (h.score <= 0) continue;
    if (seenIds.has(h.chunk.id)) continue;
    seenIds.add(h.chunk.id);
    merged.push(h.chunk.text);
  }
  for (const v of vectorHits) {
    if (seenIds.has(v.id)) continue;
    seenIds.add(v.id);
    merged.push(v.text);
    if (merged.length >= 8) break;
  }

  // Cohere rerank for final ordering.
  let reranked: string[] = merged;
  try {
    const r = await rerankChunks(query, merged, 5);
    reranked = r.map((x) => x.text);
  } catch (e: unknown) {
    console.warn("Cohere rerank failed (non-fatal):", (e as Error).message);
    reranked = merged.slice(0, 5);
  }

  // Cross-reference expansion. Extract clause numbers cited at the START of
  // each chunk's heading line (chunkers emit "Clause N.N.N" near the top).
  const fromClauses = extractClauseNumbersFromText(reranked.join("\n"));
  if (fromClauses.length > 0) {
    const refs = await getOutgoingRefs(docId, fromClauses);
    const extraClauseNumbers = refs
      .filter((r) => r.to_kind === "clause")
      .slice(0, 3)
      .map((r) => r.to_ref);

    for (const cn of extraClauseNumbers) {
      const c = await getClauseByNumber(docId, cn);
      if (c) reranked.push(renderClauseRow(c));
    }
  }

  return reranked;
};

// ---------- helpers ----------

const renderClauseRow = (row: any): string => {
  const headingLine = Array.isArray(row.heading_path)
    ? row.heading_path.join(" > ")
    : "";
  const titlePart = row.clause_title ? ` — ${row.clause_title}` : "";
  const amendLine =
    row.is_amended && Array.isArray(row.amended_by) && row.amended_by.length > 0
      ? `\n\n[Amended by: ${row.amended_by.join(", ")}]`
      : "";
  return `${headingLine}\n\nClause ${row.clause_number}${titlePart}\n\n${row.body}${amendLine}`;
};

const extractClauseNumbersFromText = (text: string): string[] => {
  const out = new Set<string>();
  const re = /\bClause\s+(\d+(?:\.\d+)+(?:\([a-z]\))?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[1]) out.add(m[1]);
  }
  return [...out];
};
