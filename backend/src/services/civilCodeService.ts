// Thin CRUD layer for the is_code_* Supabase tables. Keeps SQL out of the
// route and orchestrator code.
//
// All inserts use upsert with the natural unique key (doc_id, ...) so
// re-ingesting a code overwrites instead of duplicating.

import { supabase } from "../lib/supabase.js";
import type {
  AmendmentRow,
  ClauseRow,
  CrossRefRow,
  SymbolRow,
  TableRowRecord,
} from "../rag/civilCode/types.js";

export type IsCodeRecord = {
  doc_id: string;
  title: string;
  version_label: string;
  year: number;
  amendments?: Array<{ no: string; date?: string; scope?: string }>;
  uploaded_by?: string | null;
  is_shared?: boolean;
};

export const upsertIsCode = async (rec: IsCodeRecord) => {
  const { error } = await supabase
    .from("is_codes")
    .upsert(
      {
        doc_id: rec.doc_id,
        title: rec.title,
        version_label: rec.version_label,
        year: rec.year,
        amendments: rec.amendments ?? [],
        uploaded_by: rec.uploaded_by ?? null,
        is_shared: rec.is_shared ?? true,
      },
      { onConflict: "doc_id" },
    );
  if (error) throw new Error(`upsertIsCode failed: ${error.message}`);
};

// Replace-all semantics: for a fresh ingest of a doc, we wipe the doc's prior
// rows in each child table and re-insert. Safer than chasing diffs row by row
// when the parser changes.
export const deleteAllForDoc = async (docId: string) => {
  for (const table of [
    "is_code_clauses",
    "is_code_tables",
    "is_code_symbols",
    "is_code_cross_refs",
    "is_code_amendments",
  ]) {
    const { error } = await supabase.from(table).delete().eq("doc_id", docId);
    if (error) throw new Error(`deleteAllForDoc(${table}) failed: ${error.message}`);
  }
};

export const insertClauses = async (rows: ClauseRow[]) => {
  if (rows.length === 0) return;
  // Dedupe by (doc_id, clause_number): same clause may appear multiple times
  // in the AST (TOC vs body vs amendment refs). Keep the row with the longest
  // body — that's almost always the real body clause.
  const byKey = new Map<string, ClauseRow>();
  for (const r of rows) {
    const key = `${r.doc_id}|${r.clause_number}`;
    const existing = byKey.get(key);
    if (!existing || r.body.length > existing.body.length) {
      byKey.set(key, r);
    }
  }
  const deduped = [...byKey.values()];
  // Upsert on the unique constraint to be safe even if other writers exist.
  for (const batch of batches(deduped, 500)) {
    const { error } = await supabase
      .from("is_code_clauses")
      .upsert(batch, { onConflict: "doc_id,clause_number" });
    if (error) throw new Error(`insertClauses failed: ${error.message}`);
  }
};

export const insertTableRows = async (rows: TableRowRecord[]) => {
  if (rows.length === 0) return;
  for (const batch of batches(rows, 500)) {
    const { error } = await supabase.from("is_code_tables").insert(batch);
    if (error) throw new Error(`insertTableRows failed: ${error.message}`);
  }
};

export const insertSymbols = async (rows: SymbolRow[]) => {
  if (rows.length === 0) return;
  // Dedupe by (doc_id, symbol) — same symbol may be listed twice if the
  // glossary appears once per region or under amendments.
  const byKey = new Map<string, SymbolRow>();
  for (const r of rows) {
    const key = `${r.doc_id}|${r.symbol}`;
    const existing = byKey.get(key);
    if (!existing || r.definition.length > existing.definition.length) {
      byKey.set(key, r);
    }
  }
  for (const batch of batches([...byKey.values()], 500)) {
    const { error } = await supabase
      .from("is_code_symbols")
      .upsert(batch, { onConflict: "doc_id,symbol" });
    if (error) throw new Error(`insertSymbols failed: ${error.message}`);
  }
};

export const insertCrossRefs = async (rows: CrossRefRow[]) => {
  if (rows.length === 0) return;
  for (const batch of batches(rows, 1000)) {
    const { error } = await supabase.from("is_code_cross_refs").insert(batch);
    if (error) throw new Error(`insertCrossRefs failed: ${error.message}`);
  }
};

export const insertAmendments = async (rows: AmendmentRow[]) => {
  if (rows.length === 0) return;
  for (const batch of batches(rows, 500)) {
    const { error } = await supabase.from("is_code_amendments").insert(batch);
    if (error) throw new Error(`insertAmendments failed: ${error.message}`);
  }
};

// ---------- Read helpers used by queryRouter / pdf.ts ----------

export const listIsCodes = async () => {
  const { data, error } = await supabase
    .from("is_codes")
    .select("doc_id, title, version_label, year, ingested_at, is_shared")
    .order("ingested_at", { ascending: false });
  if (error) throw new Error(`listIsCodes failed: ${error.message}`);
  return data ?? [];
};

export const getClauseByNumber = async (
  docId: string,
  clauseNumber: string,
) => {
  const { data, error } = await supabase
    .from("is_code_clauses")
    .select("*")
    .eq("doc_id", docId)
    .eq("clause_number", clauseNumber)
    .maybeSingle();
  if (error) throw new Error(`getClauseByNumber failed: ${error.message}`);
  return data;
};

export const getClausesInPrefix = async (
  docId: string,
  prefix: string,
) => {
  // For parent-document retrieval: fetch all clauses whose number starts with
  // the prefix (e.g. prefix="8.2" returns 8.2, 8.2.1, 8.2.1.1, ...).
  const { data, error } = await supabase
    .from("is_code_clauses")
    .select("clause_number, clause_title, body, heading_path, is_amended, amended_by")
    .eq("doc_id", docId)
    .like("clause_number", `${prefix}%`);
  if (error) throw new Error(`getClausesInPrefix failed: ${error.message}`);
  return data ?? [];
};

export const getSymbolByName = async (docId: string, symbol: string) => {
  const { data, error } = await supabase
    .from("is_code_symbols")
    .select("*")
    .eq("doc_id", docId)
    .eq("symbol", symbol)
    .maybeSingle();
  if (error) throw new Error(`getSymbolByName failed: ${error.message}`);
  return data;
};

export const getTableRows = async (
  docId: string,
  tableNumber: string,
) => {
  const { data, error } = await supabase
    .from("is_code_tables")
    .select("*")
    .eq("doc_id", docId)
    .eq("table_number", tableNumber);
  if (error) throw new Error(`getTableRows failed: ${error.message}`);
  return data ?? [];
};

export const getOutgoingRefs = async (
  docId: string,
  fromClauses: string[],
) => {
  if (fromClauses.length === 0) return [];
  const { data, error } = await supabase
    .from("is_code_cross_refs")
    .select("from_clause, to_kind, to_ref")
    .eq("doc_id", docId)
    .in("from_clause", fromClauses);
  if (error) throw new Error(`getOutgoingRefs failed: ${error.message}`);
  return data ?? [];
};

// ---------- internal ----------

function* batches<T>(arr: T[], size: number): Generator<T[]> {
  for (let i = 0; i < arr.length; i += size) {
    yield arr.slice(i, i + size);
  }
}
