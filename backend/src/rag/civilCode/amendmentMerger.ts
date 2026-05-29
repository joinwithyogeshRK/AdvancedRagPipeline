// Applies amendment blocks to the clause blocks they reference, in-place.
//
// Why merge at ingest time: engineers asking the system about a clause want
// the CURRENT text. If we left amendments separate, every retrieval would
// need to resolve "is this clause amended?" and stitch. Merging once at
// ingest is simpler, cheaper, and lets the chunk text shown to the LLM
// reflect reality.
//
// Provenance is preserved: each modified clause gets `is_amended=true` and
// an `amended_by[]` list, and the raw AmendmentBlock entries stay in the
// AST (and get their own amendment chunks + amendment SQL rows).
//
// Limitations:
//   • Line-level "substitute X for Y" replaces verbatim; if the parser's
//     extracted clause text differs slightly (whitespace, ligatures), the
//     replace will silently no-op. We log such misses so they surface in
//     QA, not in production.
//   • "Add the following at the end" appends to the clause body.
//   • "Delete" removes the matched word/phrase (or, with no target, leaves
//     the clause untouched and just tags it for review).
//   • Renumbering is recorded but not physically applied — too risky to
//     rewrite clause numbers automatically.

import type {
  AmendmentBlock,
  ClauseBlock,
  IsCodeAst,
  IsCodeBlock,
} from "./types.js";

export type MergeReport = {
  applied: number;
  missed: Array<{ amendment: AmendmentBlock; reason: string }>;
};

export const mergeAmendmentsIntoClauses = (
  ast: IsCodeAst,
): { ast: IsCodeAst; report: MergeReport } => {
  const clauseByNumber = new Map<string, ClauseBlock>();
  for (const b of ast.blocks) {
    if (b.kind === "clause") clauseByNumber.set(b.number, b);
  }

  const report: MergeReport = { applied: 0, missed: [] };

  for (const b of ast.blocks) {
    if (b.kind !== "amendment") continue;
    const target = b.clauseRef ? clauseByNumber.get(stripCompoundRef(b.clauseRef)) : undefined;
    if (!target) {
      report.missed.push({
        amendment: b,
        reason: b.clauseRef
          ? `target clause '${b.clauseRef}' not found in AST`
          : `amendment has no clauseRef`,
      });
      continue;
    }

    const updated = applyAmendment(target, b);
    if (!updated) {
      report.missed.push({
        amendment: b,
        reason: `action '${b.action}' could not be applied to clause ${target.number}`,
      });
      continue;
    }
    target.text = updated.text;
    target.headingPath = updated.headingPath ?? target.headingPath;

    // Tag the clause as amended. We don't dedupe — multiple amendments to
    // the same clause should all show up.
    const tag = `${b.amendmentNo}${b.date ? ` (${b.date})` : ""}`;
    (target as ClauseBlock & { _amendedBy?: string[] })._amendedBy ??= [];
    (target as ClauseBlock & { _amendedBy: string[] })._amendedBy.push(tag);
    report.applied += 1;
  }

  return { ast: { ...ast, blocks: ast.blocks }, report };
};

// Public helpers used by the chunker to read the merge-tagged metadata.

export const getAmendedBy = (clause: ClauseBlock): string[] => {
  return (clause as ClauseBlock & { _amendedBy?: string[] })._amendedBy ?? [];
};

export const isAmended = (clause: ClauseBlock): boolean => {
  return getAmendedBy(clause).length > 0;
};

// ---------- internal ----------

const stripCompoundRef = (ref: string): string => {
  // "5.2.1.2 and corresponding Note" → "5.2.1.2"
  // "26.5.1.1(b)" → "26.5.1.1(b)"
  const m = ref.match(/^(\d+(?:\.\d+)*(?:\([a-z]\))?)/);
  return m && m[1] ? m[1] : ref;
};

const applyAmendment = (
  clause: ClauseBlock,
  amendment: AmendmentBlock,
): { text: string; headingPath?: string[] } | undefined => {
  switch (amendment.action) {
    case "substitute": {
      if (amendment.oldText && amendment.newText) {
        // Try literal replace, then a normalized-whitespace replace.
        if (clause.text.includes(amendment.oldText)) {
          return { text: clause.text.replace(amendment.oldText, amendment.newText) };
        }
        const normTarget = normalizeWs(clause.text);
        const normOld = normalizeWs(amendment.oldText);
        if (normTarget.includes(normOld)) {
          return {
            text: normTarget.replace(normOld, amendment.newText),
          };
        }
        // Line-level substitution failed. Fall through to "replace whole body
        // with newText" only if line-level was explicitly the only signal.
        // Safer to no-op and let QA see it.
        return undefined;
      }
      if (amendment.newText) {
        // "Substitute the following for the existing: <new text>" — wholesale.
        return { text: amendment.newText };
      }
      return undefined;
    }
    case "delete": {
      if (amendment.oldText && clause.text.includes(amendment.oldText)) {
        return { text: clause.text.replace(amendment.oldText, "").replace(/\s{2,}/g, " ") };
      }
      // Tag-only deletion; clause body unchanged.
      return { text: clause.text };
    }
    case "add": {
      if (amendment.newText) {
        return { text: `${clause.text}\n\n${amendment.newText}` };
      }
      return undefined;
    }
    case "insert": {
      if (amendment.newText) {
        return { text: `${clause.text}\n\n${amendment.newText}` };
      }
      return undefined;
    }
    case "renumber": {
      // Don't physically renumber — record-only. Keep clause body as-is.
      return { text: clause.text };
    }
  }
};

const normalizeWs = (s: string): string => s.replace(/\s+/g, " ").trim();

// Convenience: walk the AST and return only the merged clauses (for tests).
export const filterClauses = (blocks: IsCodeBlock[]): ClauseBlock[] =>
  blocks.filter((b): b is ClauseBlock => b.kind === "clause");
