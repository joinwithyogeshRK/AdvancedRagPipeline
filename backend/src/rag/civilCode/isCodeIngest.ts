// End-to-end ingestion: PDF buffer -> Pinecone + Supabase populated.
//
// Pipeline:
//   1. parsePdfToMarkdown    (LlamaParse)
//   2. parseIsCodeMarkdown   (markdown -> AST)
//   3. mergeAmendmentsIntoClauses (apply Amendment N to clauses)
//   4. chunkClauses + extractTables + extractSymbolRows + extractCrossRefs
//   5. embedChunks           (Voyage AI)
//   6. upsertCivilVectors    (Pinecone, batched)
//   7. upsertIsCode + insertClauses + insertTableRows + insertSymbols +
//      insertCrossRefs + insertAmendments (Supabase)
//
// Re-ingestion semantics:
//   • Pinecone: deleteCivilVectorsForDoc(docId) then upsert. Deterministic
//     IDs would let us skip the delete, but we'd leak old chunks if the
//     parser produces a different set of clauses.
//   • Supabase: deleteAllForDoc(docId) then bulk insert.

import { embedChunks } from "../embedder.js";
import {
  deleteCivilVectorsForDoc,
  upsertCivilVectors,
  type CivilVectorRecord,
} from "../pinecone.js";
import {
  deleteAllForDoc,
  insertAmendments,
  insertClauses,
  insertCrossRefs,
  insertSymbols,
  insertTableRows,
  upsertIsCode,
  type IsCodeRecord,
} from "../../services/civilCodeService.js";
import { parsePdfToMarkdown, type ParseOptions } from "./llamaParseClient.js";
import { parseIsCodeMarkdown } from "./isCodeParser.js";
import { mergeAmendmentsIntoClauses } from "./amendmentMerger.js";
import { chunkClauses } from "./clauseChunker.js";
import { extractTables } from "./tableExtractor.js";
import { extractSymbolRows } from "./symbolExtractor.js";
import { extractCrossRefs } from "./crossRefResolver.js";
import type {
  AmendmentRow,
  IngestResult,
  IsCodeAst,
} from "./types.js";

export type IngestRequest = {
  pdfBuffer: Buffer;
  docId: string;          // canonical id, e.g. "IS_456_2000"
  title: string;
  versionLabel: string;
  year: number;
  uploadedBy?: string;    // optional Supabase user UUID
  parseOptions?: ParseOptions;
};

export const ingestIsCodePdf = async (
  req: IngestRequest,
): Promise<IngestResult> => {
  console.log(
    `[civilIngest] start docId=${req.docId} (${req.pdfBuffer.byteLength} bytes)`,
  );

  // ---- 1. PDF -> markdown
  const { markdown, pageCount } = await parsePdfToMarkdown(
    req.pdfBuffer,
    req.parseOptions ?? {},
  );
  console.log(`[civilIngest] markdown: ${markdown.length} chars, ${pageCount} pages`);

  // ---- 2. markdown -> AST
  const astRaw = parseIsCodeMarkdown(markdown, {
    docId: req.docId,
    title: req.title,
    versionLabel: req.versionLabel,
    year: req.year,
  });

  // ---- 3. Apply amendments
  const { ast, report } = mergeAmendmentsIntoClauses(astRaw);
  console.log(
    `[civilIngest] amendments: ${report.applied} applied, ${report.missed.length} missed`,
  );
  if (report.missed.length > 0) {
    for (const m of report.missed) {
      console.log(
        `  ⚠️ amendment '${m.amendment.amendmentNo}' -> clause ${m.amendment.clauseRef ?? "?"}: ${m.reason}`,
      );
    }
  }

  // ---- 4. Chunks + relational rows
  const { chunks: clauseChunks, clauseRows } = chunkClauses(ast);
  const { chunks: tableChunks, rowRecords: tableRowRecords } = extractTables(ast);
  const symbolRows = extractSymbolRows(ast);
  const crossRefRows = extractCrossRefs(ast);
  const amendmentRows = buildAmendmentRows(ast);

  const allChunks = [...clauseChunks, ...tableChunks];
  const counts = summarize(ast, allChunks, tableRowRecords);
  console.log(
    `[civilIngest] chunks: clause=${clauseChunks.length}, table=${tableChunks.length}, total=${allChunks.length}`,
  );
  console.log(
    `[civilIngest] sql rows: clauses=${clauseRows.length}, table_rows=${tableRowRecords.length}, symbols=${symbolRows.length}, cross_refs=${crossRefRows.length}, amendments=${amendmentRows.length}`,
  );

  // ---- 5. Embed
  const embedded = await embedChunks(allChunks.map((c) => c.text));
  if (embedded.length !== allChunks.length) {
    throw new Error(
      `embedder returned ${embedded.length} vectors for ${allChunks.length} chunks`,
    );
  }

  const vectorRecords: CivilVectorRecord[] = allChunks.map((c, i) => ({
    id: c.id,
    vector: embedded[i]!.vector,
    text: c.text,
    metadata: c.metadata,
  }));

  // ---- 6. Pinecone
  await safeDeletePineconeForDoc(req.docId);
  await upsertCivilVectors(vectorRecords);

  // ---- 7. Supabase
  const isCodeRec: IsCodeRecord = {
    doc_id: req.docId,
    title: req.title,
    version_label: req.versionLabel,
    year: req.year,
    amendments: ast.amendments,
    is_shared: true,
    ...(req.uploadedBy !== undefined ? { uploaded_by: req.uploadedBy } : {}),
  };
  await upsertIsCode(isCodeRec);
  await deleteAllForDoc(req.docId);
  await insertClauses(clauseRows);
  await insertTableRows(tableRowRecords);
  await insertSymbols(symbolRows);
  await insertCrossRefs(crossRefRows);
  await insertAmendments(amendmentRows);

  console.log(`[civilIngest] DONE docId=${req.docId}`);

  return {
    docId: req.docId,
    clauseCount: counts.clauses,
    noteCount: counts.notes,
    tableCount: counts.tables,
    tableRowCount: tableRowRecords.length,
    symbolCount: symbolRows.length,
    equationCount: counts.equations,
    annexClauseCount: counts.annexClauses,
    amendmentCount: amendmentRows.length,
    crossRefCount: crossRefRows.length,
    pineconeUpserts: vectorRecords.length,
  };
};

// ---------- helpers ----------

const safeDeletePineconeForDoc = async (docId: string): Promise<void> => {
  try {
    await deleteCivilVectorsForDoc(docId);
  } catch (e: unknown) {
    // First ingest will have nothing to delete; metadata-based deletes
    // may also be unsupported on certain pod-based indexes. Don't fail the run.
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`[civilIngest] delete pre-existing vectors (ignored): ${msg}`);
  }
};

const buildAmendmentRows = (ast: IsCodeAst): AmendmentRow[] => {
  const rows: AmendmentRow[] = [];
  for (const b of ast.blocks) {
    if (b.kind !== "amendment") continue;
    rows.push({
      doc_id: ast.docId,
      amendment_no: b.amendmentNo,
      action: b.action,
      ...(b.date !== undefined ? { amendment_date: b.date } : {}),
      ...(b.pageRef !== undefined ? { page_ref: b.pageRef } : {}),
      ...(b.clauseRef !== undefined ? { clause_ref: b.clauseRef } : {}),
      ...(b.lineRef !== undefined ? { line_ref: b.lineRef } : {}),
      ...(b.oldText !== undefined ? { old_text: b.oldText } : {}),
      ...(b.newText !== undefined ? { new_text: b.newText } : {}),
    });
  }
  return rows;
};

const summarize = (
  ast: IsCodeAst,
  _chunks: { id: string }[],
  _tableRowRecords: { doc_id: string }[],
): {
  clauses: number;
  notes: number;
  tables: number;
  equations: number;
  annexClauses: number;
} => {
  let clauses = 0,
    notes = 0,
    tables = 0,
    equations = 0,
    annexClauses = 0;
  for (const b of ast.blocks) {
    if (b.kind === "clause") clauses++;
    else if (b.kind === "note") notes++;
    else if (b.kind === "table" || b.kind === "informal_table") tables++;
    else if (b.kind === "equation") equations++;
    else if (b.kind === "annex_clause") annexClauses++;
  }
  return { clauses, notes, tables, equations, annexClauses };
};
