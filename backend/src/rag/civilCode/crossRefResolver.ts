// Builds the cross-reference graph from the AST.
//
// Scans every clause body for inline references like:
//   (see 8.2.1)
//   (see Table 4)
//   (see Annex B)
//   in accordance with IS 3025 (Part 22)
// and emits one CrossRefRow per (from_clause, to_*) pair.
//
// Used by:
//   • Ingest:  persisted into is_code_cross_refs for downstream graph traversal
//   • Retrieve: post-rerank step expands top-K chunks with referenced clauses
//
// Detection is conservative — we only match patterns that engineers actually
// write. False positives hurt retrieval more than false negatives here.

import type {
  CrossRefRow,
  IsCodeAst,
  IsCodeBlock,
} from "./types.js";

export const extractCrossRefs = (ast: IsCodeAst): CrossRefRow[] => {
  const out: CrossRefRow[] = [];
  for (const b of ast.blocks) {
    if (b.kind !== "clause" && b.kind !== "annex_clause") continue;
    const refs = findRefsInText(b.text);
    for (const ref of refs) {
      out.push({
        doc_id: ast.docId,
        from_clause: b.number,
        to_kind: ref.kind,
        to_ref: ref.ref,
      });
    }
  }
  return dedupe(out);
};

type Ref = { kind: CrossRefRow["to_kind"]; ref: string };

const findRefsInText = (text: string): Ref[] => {
  const refs: Ref[] = [];

  // Clause references inside parentheses or prose:
  //   "(see 8.2.1)" / "see clause 8.2.1" / "as per 26.4" / "in accordance with 16"
  // Be conservative on the prose form to avoid matching page or table numbers.
  const clauseInParen = /\(\s*see\s+([\d]+(?:\.\d+)*(?:\([a-z]\))?)\s*\)/gi;
  for (const m of text.matchAll(clauseInParen)) {
    if (m[1]) refs.push({ kind: "clause", ref: m[1] });
  }

  const clauseProse = /\b(?:see|as per|in accordance with|per)\s+(?:Clause\s+)?(\d+(?:\.\d+)+(?:\([a-z]\))?)\b/gi;
  for (const m of text.matchAll(clauseProse)) {
    if (m[1]) refs.push({ kind: "clause", ref: m[1] });
  }

  // Table references:
  const tableRef = /\b(?:see\s+)?Table\s+(\d+)\b/g;
  for (const m of text.matchAll(tableRef)) {
    if (m[1]) refs.push({ kind: "table", ref: `Table ${m[1]}` });
  }

  // Annex references:
  const annexRef = /\bAnnex\s+([A-Z])\b/g;
  for (const m of text.matchAll(annexRef)) {
    if (m[1]) refs.push({ kind: "annex", ref: `Annex ${m[1]}` });
  }

  // External IS standard references:
  //   "IS 3025 (Part 22)" / "IS 269 : 2003"
  const isRef = /\bIS\s+\d{2,5}(?:\s*\(Part\s+\d+\))?(?:\s*:\s*\d{4})?\b/g;
  for (const m of text.matchAll(isRef)) {
    if (m[0]) refs.push({ kind: "external_is", ref: m[0].trim() });
  }

  return refs;
};

const dedupe = (rows: CrossRefRow[]): CrossRefRow[] => {
  const seen = new Set<string>();
  const out: CrossRefRow[] = [];
  for (const r of rows) {
    const key = `${r.from_clause}|${r.to_kind}|${r.to_ref}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
};

// Public: used at retrieval time to expand top-K chunks. Given a list of
// clause numbers, return the unique set of clause/table refs they cite.
export const collectOutgoingRefs = (
  rows: CrossRefRow[],
  fromClauses: string[],
): Array<{ kind: CrossRefRow["to_kind"]; ref: string }> => {
  const wanted = new Set(fromClauses);
  const seen = new Set<string>();
  const out: Array<{ kind: CrossRefRow["to_kind"]; ref: string }> = [];
  for (const r of rows) {
    if (!wanted.has(r.from_clause)) continue;
    const key = `${r.to_kind}|${r.to_ref}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: r.to_kind, ref: r.to_ref });
  }
  return out;
};

// Convenience guard used by other modules.
export const isClauseLikeRef = (ref: string): boolean =>
  /^\d+(?:\.\d+)*(?:\([a-z]\))?$/.test(ref);

// Helper: derive all clause numbers present in the AST (so a query router
// can avoid recommending references to clauses that don't actually exist).
export const allClauseNumbers = (blocks: IsCodeBlock[]): Set<string> => {
  const out = new Set<string>();
  for (const b of blocks) {
    if (b.kind === "clause" || b.kind === "annex_clause") out.add(b.number);
  }
  return out;
};
