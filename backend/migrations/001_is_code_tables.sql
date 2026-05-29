-- Civil-engineering IS-code shared library schema.
-- Run this in the Supabase SQL editor (or via `psql`) once before first ingest.
--
-- Idempotent: uses CREATE TABLE IF NOT EXISTS and IF NOT EXISTS guards on
-- indexes / extensions, so re-running is safe.

-- gen_random_uuid() lives in pgcrypto.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- is_codes: one row per ingested code ----------

CREATE TABLE IF NOT EXISTS is_codes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id          text UNIQUE NOT NULL,
  title           text NOT NULL,
  version_label   text NOT NULL,
  year            int  NOT NULL,
  amendments      jsonb,
  uploaded_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  is_shared       boolean NOT NULL DEFAULT true,
  ingested_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS is_codes_is_shared_idx ON is_codes(is_shared);

-- ---------- is_code_clauses: one row per leaf clause ----------

CREATE TABLE IF NOT EXISTS is_code_clauses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id          text NOT NULL REFERENCES is_codes(doc_id) ON DELETE CASCADE,
  clause_number   text NOT NULL,
  clause_title    text,
  section         text,
  parent_clause   text,
  heading_path    text[] NOT NULL,
  body            text NOT NULL,
  page_number     int,
  is_amended      boolean NOT NULL DEFAULT false,
  amended_by      text[] NOT NULL DEFAULT '{}',
  is_annex        boolean NOT NULL DEFAULT false,
  UNIQUE(doc_id, clause_number)
);

CREATE INDEX IF NOT EXISTS is_code_clauses_doc_idx
  ON is_code_clauses(doc_id);

CREATE INDEX IF NOT EXISTS is_code_clauses_parent_idx
  ON is_code_clauses(doc_id, parent_clause);

-- ---------- is_code_tables: one row per table row ----------

CREATE TABLE IF NOT EXISTS is_code_tables (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id          text NOT NULL REFERENCES is_codes(doc_id) ON DELETE CASCADE,
  table_number    text NOT NULL,
  table_title     text NOT NULL,
  source_clauses  text[] NOT NULL DEFAULT '{}',
  row_label       text,
  columns         jsonb NOT NULL,
  notes           text,
  page_number     int
);

CREATE INDEX IF NOT EXISTS is_code_tables_lookup
  ON is_code_tables(doc_id, table_number);

-- GIN on the JSONB columns enables key-existence and value queries used by
-- the table_lookup route (e.g. WHERE columns ? 'Minimum_Cement_Content').
CREATE INDEX IF NOT EXISTS is_code_tables_columns_gin
  ON is_code_tables USING GIN (columns);

-- ---------- is_code_symbols: one row per symbol entry ----------

CREATE TABLE IF NOT EXISTS is_code_symbols (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id          text NOT NULL REFERENCES is_codes(doc_id) ON DELETE CASCADE,
  symbol          text NOT NULL,
  definition      text NOT NULL,
  unit            text,
  UNIQUE(doc_id, symbol)
);

CREATE INDEX IF NOT EXISTS is_code_symbols_lookup
  ON is_code_symbols(doc_id, symbol);

-- ---------- is_code_cross_refs: directional citation graph ----------

CREATE TABLE IF NOT EXISTS is_code_cross_refs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id          text NOT NULL REFERENCES is_codes(doc_id) ON DELETE CASCADE,
  from_clause     text NOT NULL,
  to_kind         text NOT NULL CHECK (to_kind IN ('clause','table','annex','external_is')),
  to_ref          text NOT NULL
);

CREATE INDEX IF NOT EXISTS is_code_cross_refs_from_idx
  ON is_code_cross_refs(doc_id, from_clause);

-- ---------- is_code_amendments: raw amendments for provenance ----------

CREATE TABLE IF NOT EXISTS is_code_amendments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id          text NOT NULL REFERENCES is_codes(doc_id) ON DELETE CASCADE,
  amendment_no    text NOT NULL,
  amendment_date  date,
  page_ref        int,
  clause_ref      text,
  line_ref        int,
  action          text NOT NULL CHECK (action IN ('substitute','delete','insert','renumber','add')),
  old_text        text,
  new_text        text
);

CREATE INDEX IF NOT EXISTS is_code_amendments_clause_idx
  ON is_code_amendments(doc_id, clause_ref);
