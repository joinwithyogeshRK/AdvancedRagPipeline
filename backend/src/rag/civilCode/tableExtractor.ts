// Tables get a two-track treatment:
//
//   1. Row-wise embedded chunks. Each row chunk repeats the table title and
//      column headers so the row is self-describing in retrieval. A separate
//      "table summary" chunk holds the title + caption + NOTES for queries
//      like "what does Table 5 say?".
//
//   2. Structured rows in Supabase (is_code_tables). Each row becomes one
//      row in the table with the columns flattened into a JSONB blob keyed
//      by the column header. This is what `table_lookup` queries hit
//      directly, returning exact values rather than asking the LLM to read
//      a chunk and guess.
//
// Merged-header support: we flatten multi-row headers into single header
// strings by joining with " / ". For Table 4's "Concentration of Sulphates →
// Total SO₃ / SO₃ in 2:1 Water / In Ground Water", the row-chunk header line
// becomes "Concentration_of_Sulphates_Total_SO3, Concentration_of_Sulphates_SO3_in_2_1_Water, ...".

import type {
  CivilChunk,
  CivilCodeMetadata,
  IsCodeAst,
  IsCodeBlock,
  InformalTableBlock,
  TableBlock,
  TableRowRecord,
} from "./types.js";

export type TableExtractionOutput = {
  chunks: CivilChunk[];
  rowRecords: TableRowRecord[];
};

export const extractTables = (ast: IsCodeAst): TableExtractionOutput => {
  const chunks: CivilChunk[] = [];
  const rowRecords: TableRowRecord[] = [];

  for (const block of ast.blocks) {
    if (block.kind === "table") {
      // Skip tables we couldn't identify (no "Table N" caption). These are
      // almost always document boilerplate — committee membership lists,
      // amendment metadata pages, etc. — not real data tables.
      if (!block.number || block.number === "Table ?") continue;
      const r = extractFromTable(ast, block);
      chunks.push(...r.chunks);
      rowRecords.push(...r.rows);
    } else if (block.kind === "informal_table") {
      const r = extractFromInformalTable(ast, block);
      chunks.push(...r.chunks);
      rowRecords.push(...r.rows);
    }
  }

  return { chunks, rowRecords };
};

// ---------- Numbered tables ----------

const extractFromTable = (
  ast: IsCodeAst,
  table: TableBlock,
): { chunks: CivilChunk[]; rows: TableRowRecord[] } => {
  const chunks: CivilChunk[] = [];
  const rows: TableRowRecord[] = [];

  const flatHeaders = flattenHeaders(table.headers);
  const tableMetaBase: CivilCodeMetadata = {
    doc_id: ast.docId,
    doc_version: ast.versionLabel,
    content_type: "table_summary",
    table_number: table.number,
    ...(table.page !== undefined ? { page_number: table.page } : {}),
    ...(table.sourceClauses.length > 0
      ? { cross_references: table.sourceClauses }
      : {}),
  };

  // 1) Table summary chunk
  const summaryParts = [
    `${table.number}: ${table.title}`,
    table.sourceClauses.length > 0
      ? `Referenced by Clauses: ${table.sourceClauses.join(", ")}`
      : undefined,
    `Columns: ${flatHeaders.join(" | ")}`,
    `Rows: ${table.rows.length}`,
    table.notes ? `NOTES: ${table.notes}` : undefined,
  ].filter(Boolean) as string[];

  chunks.push({
    id: `civil:${ast.docId}:table_summary:${slug(table.number)}`,
    text: summaryParts.join("\n\n"),
    metadata: tableMetaBase,
  });

  // 2) Per-row chunks + SQL rows
  table.rows.forEach((row, idx) => {
    const labelPart = row.label ? `Row ${row.label}` : `Row ${idx + 1}`;
    const columns: Record<string, string> = {};
    flatHeaders.forEach((h, ci) => {
      const cell = row.cells[ci] ?? "";
      columns[normalizeColumnKey(h)] = cell;
    });

    const rowText = renderRowText(table, flatHeaders, row, labelPart);
    const rowMeta: CivilCodeMetadata = {
      doc_id: ast.docId,
      doc_version: ast.versionLabel,
      content_type: "table_row",
      table_number: table.number,
      ...(row.label !== undefined ? { table_row_label: row.label } : {}),
      ...(table.page !== undefined ? { page_number: table.page } : {}),
      ...(table.sourceClauses.length > 0
        ? { cross_references: table.sourceClauses }
        : {}),
    };

    chunks.push({
      id: `civil:${ast.docId}:table_row:${slug(table.number)}-${row.label ? slug(row.label) : `r${idx + 1}`}`,
      text: rowText,
      metadata: rowMeta,
    });

    rows.push({
      doc_id: ast.docId,
      table_number: table.number,
      table_title: table.title,
      source_clauses: table.sourceClauses,
      columns,
      ...(row.label !== undefined ? { row_label: row.label } : {}),
      ...(table.notes !== undefined ? { notes: table.notes } : {}),
      ...(table.page !== undefined ? { page_number: table.page } : {}),
    });
  });

  return { chunks, rows };
};

const renderRowText = (
  table: TableBlock,
  flatHeaders: string[],
  row: { label?: string; cells: string[] },
  labelPart: string,
): string => {
  const pairs = flatHeaders
    .map((h, ci) => `${h}: ${row.cells[ci] ?? ""}`)
    .filter((p) => !p.endsWith(": "));
  const lines = [
    `${table.number}: ${table.title}`,
    table.sourceClauses.length > 0
      ? `(Clauses ${table.sourceClauses.join(", ")})`
      : undefined,
    `${labelPart}`,
    pairs.join("\n"),
  ].filter(Boolean) as string[];
  return lines.join("\n");
};

// ---------- Informal inline tables ----------

const extractFromInformalTable = (
  ast: IsCodeAst,
  table: InformalTableBlock,
): { chunks: CivilChunk[]; rows: TableRowRecord[] } => {
  const chunks: CivilChunk[] = [];
  const rows: TableRowRecord[] = [];

  table.rows.forEach((cells, idx) => {
    const columns: Record<string, string> = {};
    table.headers.forEach((h, ci) => {
      columns[normalizeColumnKey(h)] = cells[ci] ?? "";
    });

    const text = [
      `Inline table within Clause ${table.parentClause}`,
      `Columns: ${table.headers.join(" | ")}`,
      `Row ${idx + 1}: ${table.headers
        .map((h, ci) => `${h}=${cells[ci] ?? ""}`)
        .join(", ")}`,
    ].join("\n");

    const meta: CivilCodeMetadata = {
      doc_id: ast.docId,
      doc_version: ast.versionLabel,
      content_type: "informal_table",
      clause_number: table.parentClause,
      ...(table.page !== undefined ? { page_number: table.page } : {}),
    };

    chunks.push({
      id: `civil:${ast.docId}:informal_table:${table.parentClause}:r${idx + 1}`,
      text,
      metadata: meta,
    });

    rows.push({
      doc_id: ast.docId,
      table_number: "",
      table_title: `Inline within Clause ${table.parentClause}`,
      source_clauses: [table.parentClause],
      columns,
      ...(table.page !== undefined ? { page_number: table.page } : {}),
    });
  });

  return { chunks, rows };
};

// ---------- Helpers ----------

const flattenHeaders = (headers: string[][]): string[] => {
  // If there are no headers, return empty. If one row, use it directly. If
  // multiple rows (merged headers), join column-wise with " / ".
  if (headers.length === 0) return [];
  const firstRow = headers[0] ?? [];
  if (headers.length === 1) return firstRow;
  // Determine the widest row to set column count.
  const colCount = Math.max(...headers.map((r) => r.length));
  const out: string[] = [];
  for (let c = 0; c < colCount; c++) {
    const parts: string[] = [];
    for (const row of headers) {
      const cell = row[c];
      if (cell && cell.trim().length > 0) parts.push(cell.trim());
    }
    out.push(parts.join(" / "));
  }
  return out;
};

const normalizeColumnKey = (h: string): string =>
  h
    .replace(/[/]/g, "_")
    .replace(/[²]/g, "2")
    .replace(/[°]/g, "deg")
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// Public: detect whether any table blocks exist (for ingest summary).
export const countTables = (blocks: IsCodeBlock[]): { tables: number; rows: number } => {
  let tables = 0;
  let rows = 0;
  for (const b of blocks) {
    if (b.kind === "table") {
      tables++;
      rows += b.rows.length;
    } else if (b.kind === "informal_table") {
      tables++;
      rows += b.rows.length;
    }
  }
  return { tables, rows };
};
