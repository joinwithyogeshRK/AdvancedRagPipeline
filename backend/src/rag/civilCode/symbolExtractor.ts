// Extracts the SymbolRow records from SymbolBlocks. The corresponding
// per-symbol embed chunks are produced by clauseChunker (kind: "symbol").
//
// This file is intentionally tiny — its job is just to translate AST
// symbols into the relational shape the orchestrator inserts into
// is_code_symbols.

import type { IsCodeAst, SymbolRow } from "./types.js";

export const extractSymbolRows = (ast: IsCodeAst): SymbolRow[] => {
  const out: SymbolRow[] = [];
  for (const b of ast.blocks) {
    if (b.kind !== "symbol") continue;
    out.push({
      doc_id: ast.docId,
      symbol: b.symbol,
      definition: b.definition,
      ...(b.unit !== undefined ? { unit: b.unit } : {}),
    });
  }
  return out;
};
