// Shared type definitions for the IS-code (Indian Standard) ingestion pipeline.
//
// The pipeline is: PDF -> LlamaParse markdown -> typed AST (IsCodeBlock[]) ->
// amendment merge -> chunks + relational rows -> Pinecone + Supabase.
//
// All downstream modules depend on these types, so keep them stable.

// ---------- AST: what isCodeParser.ts emits ----------

export type AmendmentAction =
  | "substitute"
  | "delete"
  | "insert"
  | "renumber"
  | "add";

export type ClauseBlock = {
  kind: "clause";
  number: string; // e.g. "8.2.2.4" or "26.5.1.1(b)"
  title?: string; // e.g. "Exposure to sulphate attack"
  text: string;
  page?: number;
  // Heading path captured at parse time so we don't recompute downstream.
  // ["SECTION 2 MATERIALS, WORKMANSHIP, INSPECTION AND TESTING", "8 DURABILITY OF CONCRETE", "8.2 Requirements for Durability", "8.2.2 Exposure Conditions"]
  headingPath: string[];
  section?: string; // "2"
  parentClause?: string; // "8.2.2"
};

export type NoteBlock = {
  kind: "note";
  underClause: string; // "8.2.2.4"
  text: string;
  page?: number;
};

export type TableHeaderRow = string[];

export type TableRow = {
  label?: string; // e.g. "Class 3" or roman "iii"
  cells: string[]; // aligned with the deepest header row
};

export type TableBlock = {
  kind: "table";
  number: string; // "Table 4"
  title: string;
  sourceClauses: string[]; // from "(Clauses 8.2.2.4 and 9.1.2)"
  headers: TableHeaderRow[]; // may be 2+ rows for merged-header tables
  rows: TableRow[];
  notes?: string;
  page?: number;
};

export type InformalTableBlock = {
  kind: "informal_table";
  parentClause: string; // clause it sits inside
  headers: string[];
  rows: string[][];
  page?: number;
};

export type EquationBlock = {
  kind: "equation";
  parentClause: string;
  raw: string; // as it appears in the markdown
  symbolsUsed: string[]; // ["f_cr", "f_ck"]
  page?: number;
};

export type SymbolBlock = {
  kind: "symbol";
  symbol: string; // "f_ck"
  definition: string; // "Characteristic cube compressive strength of concrete"
  unit?: string; // "N/mm²"
};

export type AnnexClauseBlock = {
  kind: "annex_clause";
  annexLetter: string; // "B"
  number: string; // "B-1.1" or "B-1.1.1"
  title?: string;
  text: string;
  page?: number;
  headingPath: string[];
};

export type AmendmentBlock = {
  kind: "amendment";
  amendmentNo: string; // "No. 3"
  date?: string; // ISO yyyy-mm-dd if parseable
  pageRef?: number;
  clauseRef?: string;
  lineRef?: number;
  action: AmendmentAction;
  oldText?: string;
  newText?: string;
  raw: string; // verbatim amendment line, for provenance
};

export type ForewordBlock = {
  kind: "foreword";
  section: string; // "FOREWORD" or "FOREWORD - Section 2 changes"
  text: string;
  page?: number;
};

export type SectionMarker = {
  kind: "section";
  number: string; // "2"
  title: string; // "MATERIALS, WORKMANSHIP, INSPECTION AND TESTING"
  page?: number;
};

export type IsCodeBlock =
  | SectionMarker
  | ClauseBlock
  | NoteBlock
  | TableBlock
  | InformalTableBlock
  | EquationBlock
  | SymbolBlock
  | AnnexClauseBlock
  | AmendmentBlock
  | ForewordBlock;

export type IsCodeAst = {
  docId: string; // canonical id: "IS_456_2000"
  title: string; // "Plain and Reinforced Concrete — Code of Practice"
  versionLabel: string; // human-friendly: "2000 (4th rev), reaffirmed 2005, with Amend 2 & 3"
  year: number; // 2000
  amendments: Array<{
    no: string;
    date?: string;
    scope?: string;
  }>;
  blocks: IsCodeBlock[];
};

// ---------- Chunks: what the chunkers emit and Pinecone receives ----------

export type CivilContentType =
  | "clause"
  | "clause_note"
  | "table_summary"
  | "table_row"
  | "informal_table"
  | "equation"
  | "symbol"
  | "annex_clause"
  | "amendment"
  | "foreword";

// Mirrors the metadata schema in the plan. Pinecone metadata must be flat
// (strings, numbers, booleans, or string arrays) — no nested objects.
export type CivilCodeMetadata = {
  doc_id: string;
  doc_version?: string;
  section?: string;
  clause_number?: string;
  clause_path?: string; // "8/8.2/8.2.2/8.2.2.4"
  heading_hierarchy?: string; // human-readable prefix
  content_type: CivilContentType;
  page_number?: number;
  table_number?: string;
  table_row_label?: string;
  symbols_used?: string[];
  cross_references?: string[];
  is_amended?: boolean;
  amended_by?: string; // joined comma-list (Pinecone metadata flat)
};

export type CivilChunk = {
  id: string; // deterministic Pinecone ID, e.g. "civil:IS_456_2000:clause:8.2.2.4"
  text: string; // what gets embedded
  metadata: CivilCodeMetadata;
};

// ---------- Relational row shapes (what gets upserted into Supabase) ----------

export type ClauseRow = {
  doc_id: string;
  clause_number: string;
  clause_title?: string;
  section?: string;
  parent_clause?: string;
  heading_path: string[];
  body: string;
  page_number?: number;
  is_amended: boolean;
  amended_by: string[];
  is_annex: boolean;
};

export type TableRowRecord = {
  doc_id: string;
  table_number: string; // "Table 4" or null for informal — use empty string in that case
  table_title: string;
  source_clauses: string[];
  row_label?: string;
  columns: Record<string, string>; // header -> cell
  notes?: string;
  page_number?: number;
};

export type SymbolRow = {
  doc_id: string;
  symbol: string;
  definition: string;
  unit?: string;
};

export type CrossRefRow = {
  doc_id: string;
  from_clause: string;
  to_kind: "clause" | "table" | "annex" | "external_is";
  to_ref: string;
};

export type AmendmentRow = {
  doc_id: string;
  amendment_no: string;
  amendment_date?: string;
  page_ref?: number;
  clause_ref?: string;
  line_ref?: number;
  action: AmendmentAction;
  old_text?: string;
  new_text?: string;
};

// ---------- Aggregate ingest result ----------

export type IngestResult = {
  docId: string;
  clauseCount: number;
  noteCount: number;
  tableCount: number;
  tableRowCount: number;
  symbolCount: number;
  equationCount: number;
  annexClauseCount: number;
  amendmentCount: number;
  crossRefCount: number;
  pineconeUpserts: number;
};
