// Classifies a query against the civil-code library into one of four routes.
// The router is pure (no I/O) — callers pass in the set of known symbols and
// (optionally) the set of known clause numbers so we can confirm matches
// before claiming a lookup route.
//
// Routes:
//   • clause_lookup  — query contains a clause number AND that clause exists
//                       in the doc. SQL fetch + parent. Skip HyDE.
//   • symbol_lookup  — query contains a known symbol (from is_code_symbols)
//                       used in word-boundary context. SQL + symbols_used
//                       filter. Skip HyDE.
//   • table_lookup   — query mentions "Table N" OR matches a table-value
//                       template ("minimum cement content for severe..."). SQL.
//   • conceptual     — default. Run hybrid (vector + civil BM25) + rerank +
//                       cross-ref expansion. HyDE on.

export type QueryRoute = "clause_lookup" | "symbol_lookup" | "table_lookup" | "conceptual";

export type RouteResult =
  | {
      route: "clause_lookup";
      clauseNumber: string;
    }
  | {
      route: "symbol_lookup";
      symbol: string;
    }
  | {
      route: "table_lookup";
      tableNumber?: string;
      // Heuristic: tokens extracted from the query that look like column
      // labels (e.g. "minimum cement content", "severe exposure") so the
      // SQL layer can pre-filter.
      hints: string[];
    }
  | {
      route: "conceptual";
    };

export type RouterContext = {
  // From is_code_clauses (loaded for the doc being queried).
  knownClauseNumbers?: Set<string>;
  // From is_code_symbols.
  knownSymbols?: Set<string>;
};

// Patterns precompiled once at module load.
const CLAUSE_NUMBER_RE = /\b(\d+(?:\.\d+)+(?:\([a-z]\))?)\b/;
const ANNEX_CLAUSE_RE = /\b([A-Z])-(\d+(?:\.\d+)*)\b/;
const TABLE_RE = /\bTable\s+(\d+)\b/i;
const TABLE_VALUE_HINTS = [
  // Concrete / IS 456 vocabulary that strongly implies a table lookup.
  /\bminimum\s+cement\s+content\b/i,
  /\bmaximum\s+(?:free\s+)?water[-\s]?cement\s+ratio\b/i,
  /\bminimum\s+grade\s+of\s+concrete\b/i,
  /\bnominal\s+cover\b/i,
  /\bexposure\s+condition\b/i,
  /\b(?:mild|moderate|severe|very\s+severe|extreme)\s+exposure\b/i,
  // Generic patterns
  /\bvalue\s+of\b.+\bfor\b/i,
  /\bfor\s+(?:mild|moderate|severe|very\s+severe|extreme)\b/i,
];

export const classifyQuery = (
  query: string,
  ctx: RouterContext = {},
): RouteResult => {
  // 1. Clause-number lookup (highest priority — explicit reference).
  const clauseMatch = query.match(CLAUSE_NUMBER_RE);
  if (clauseMatch && clauseMatch[1]) {
    const num = clauseMatch[1];
    if (!ctx.knownClauseNumbers || ctx.knownClauseNumbers.has(num)) {
      return { route: "clause_lookup", clauseNumber: num };
    }
  }
  const annexMatch = query.match(ANNEX_CLAUSE_RE);
  if (annexMatch && annexMatch[1] && annexMatch[2]) {
    const num = `${annexMatch[1]}-${annexMatch[2]}`;
    if (!ctx.knownClauseNumbers || ctx.knownClauseNumbers.has(num)) {
      return { route: "clause_lookup", clauseNumber: num };
    }
  }

  // 2. Table lookup — explicit "Table N" OR template hint.
  const tableMatch = query.match(TABLE_RE);
  const hints: string[] = [];
  for (const re of TABLE_VALUE_HINTS) {
    const m = query.match(re);
    if (m && m[0]) hints.push(m[0].toLowerCase());
  }
  if (tableMatch && tableMatch[1]) {
    return {
      route: "table_lookup",
      tableNumber: `Table ${tableMatch[1]}`,
      hints,
    };
  }
  if (hints.length >= 1) {
    return { route: "table_lookup", hints };
  }

  // 3. Symbol lookup — requires a known symbol.
  if (ctx.knownSymbols && ctx.knownSymbols.size > 0) {
    const sym = findKnownSymbol(query, ctx.knownSymbols);
    if (sym) return { route: "symbol_lookup", symbol: sym };
  }

  // 4. Default.
  return { route: "conceptual" };
};

const findKnownSymbol = (query: string, known: Set<string>): string | undefined => {
  // Lexical: prefer longer symbols to shorter (so "f_ck" wins over "f").
  const sorted = [...known].sort((a, b) => b.length - a.length);
  for (const sym of sorted) {
    // Word-boundary that respects underscores.
    const re = new RegExp(`(?<![A-Za-z0-9_])${escape(sym)}(?![A-Za-z0-9_])`);
    if (re.test(query)) return sym;
  }
  return undefined;
};

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Should HyDE run for this route? HyDE hurts exact lookups.
export const shouldUseHyDE = (route: QueryRoute): boolean =>
  route === "conceptual";
