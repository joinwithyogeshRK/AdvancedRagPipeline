// Converts LlamaParse markdown of an Indian Standard PDF into a typed AST.
//
// The parser is line-driven with a small state machine. It maintains a
// heading stack (Section → Top clause → 8.2 → 8.2.2 → 8.2.2.4) so each
// emitted block carries its full hierarchical context. It also tracks the
// current page index via the <<<PAGE:N>>> sentinel injected by
// llamaParseClient.ts.
//
// Design choices:
//   • Lenient on markdown decoration. LlamaParse may wrap clause numbers in
//     bold/italic; we strip * _ ** before matching.
//   • One pass, no backtracking. State transitions only on positive matches.
//   • Tables come in as HTML (we requested output_tables_as_HTML=true) so
//     they're segmented as whole blocks before classification.
//   • Amendments at the front of the doc use a fully different pattern;
//     detected by their `(Page N, clause X, line Y) — Substitute ...` form.
//   • The Symbols section (Clause 4) needs special row-wise parsing.

import type {
  AmendmentAction,
  AmendmentBlock,
  AnnexClauseBlock,
  ClauseBlock,
  EquationBlock,
  ForewordBlock,
  IsCodeAst,
  IsCodeBlock,
  NoteBlock,
  SectionMarker,
  SymbolBlock,
  TableBlock,
  TableHeaderRow,
  TableRow,
} from "./types.js";
import { PAGE_SEPARATOR_REGEX } from "./llamaParseClient.js";

// ---------- Public entry ----------

export type ParseMeta = {
  docId: string;
  title: string;
  versionLabel: string;
  year: number;
};

export const parseIsCodeMarkdown = (
  markdown: string,
  meta: ParseMeta,
): IsCodeAst => {
  const segments = splitWithPages(markdown);
  const blocks: IsCodeBlock[] = [];
  const amendmentsSummary: Array<{ no: string; date?: string; scope?: string }> = [];

  let inAmendmentSection = false;
  let currentAmendmentNo: string | undefined;
  let currentAmendmentDate: string | undefined;
  let inForeword = false;
  let inSymbolsSection = false;
  let inAnnex = false;
  let currentAnnexLetter: string | undefined;
  let currentSection: SectionMarker | undefined;
  // Heading stack of clauses by depth — index 0 is the top-level clause (e.g. "8"),
  // index 1 is "8.2", etc. Resets when a new top clause appears.
  const clauseStack: ClauseBlock[] = [];
  let lastClauseRef: ClauseBlock | AnnexClauseBlock | undefined;

  const headingPath = (): string[] => {
    const out: string[] = [];
    if (currentSection) out.push(`SECTION ${currentSection.number} ${currentSection.title}`);
    for (const c of clauseStack) {
      out.push(`${c.number} ${c.title ?? ""}`.trim());
    }
    return out;
  };

  for (const seg of segments) {
    const { page, text } = seg;
    const rawBlocks = splitBlocks(text);

    for (const raw of rawBlocks) {
      const block = stripMarkdownDecoration(raw).trim();
      if (!block) continue;

      // -------- Page-level structural markers --------

      const amendHeader = matchAmendmentHeader(block);
      if (amendHeader) {
        inAmendmentSection = true;
        currentAmendmentNo = amendHeader.no;
        currentAmendmentDate = amendHeader.date;
        amendmentsSummary.push({
          no: amendHeader.no,
          ...(amendHeader.date !== undefined ? { date: amendHeader.date } : {}),
        });
        continue;
      }

      if (matchForewordHeader(block)) {
        inAmendmentSection = false;
        inForeword = true;
        continue;
      }

      const sectionHit = matchSectionHeader(block);
      if (sectionHit) {
        // Exiting any prior context
        inAmendmentSection = false;
        inForeword = false;
        inSymbolsSection = false;
        inAnnex = false;
        currentAnnexLetter = undefined;
        clauseStack.length = 0;
        currentSection = {
          kind: "section",
          number: sectionHit.number,
          title: sectionHit.title,
          ...(page !== undefined ? { page } : {}),
        };
        blocks.push(currentSection);
        continue;
      }

      const annexHit = matchAnnexHeader(block);
      if (annexHit) {
        inAmendmentSection = false;
        inForeword = false;
        inSymbolsSection = false;
        inAnnex = true;
        currentAnnexLetter = annexHit.letter;
        clauseStack.length = 0;
        continue;
      }

      // -------- Amendments (highest priority while in amendment section) --------

      if (inAmendmentSection) {
        const amendments = parseAmendmentLines(
          block,
          currentAmendmentNo ?? "Unknown",
          currentAmendmentDate,
        );
        for (const a of amendments) blocks.push(a);
        // Amendment sections may also contain inserted clause text — but
        // detecting those is fragile. Skip for now; the merger handles
        // substitution by clause/page reference.
        continue;
      }

      // -------- Foreword --------

      if (inForeword) {
        // Anything until we hit "SECTION N ..." is foreword body.
        blocks.push({
          kind: "foreword",
          section: "FOREWORD",
          text: block,
          ...(page !== undefined ? { page } : {}),
        } satisfies ForewordBlock);
        continue;
      }

      // -------- HTML tables (LlamaParse output_tables_as_HTML) --------

      if (block.startsWith("<table") || block.includes("<table")) {
        const table = parseHtmlTable(block, page);
        if (table) {
          // If we just entered the symbols section, treat the table rows as
          // symbol entries instead of a data table.
          if (inSymbolsSection) {
            const syms = symbolsFromTable(table);
            if (syms.length > 0) {
              blocks.push(...syms);
              continue;
            }
          }
          blocks.push(table);
          continue;
        }
      }

      // -------- Markdown pipe tables (fallback if LlamaParse emitted them) --------

      if (isPipeTable(block)) {
        const table = parsePipeTable(block, page);
        if (table) {
          if (inSymbolsSection) {
            const syms = symbolsFromTable(table);
            if (syms.length > 0) {
              blocks.push(...syms);
              continue;
            }
          }
          blocks.push(table);
          continue;
        }
      }

      // -------- Symbols section (Clause 4 in IS 456) --------

      // The symbols section is signposted by the "4 SYMBOLS" clause. Once we
      // enter it, lines look like `f_ck  —  Characteristic cube compressive
      // strength of concrete`. We exit when we see the next top-level clause.
      if (inSymbolsSection) {
        const symbolHit = parseSymbolEntries(block);
        if (symbolHit.length > 0) {
          blocks.push(...symbolHit);
          continue;
        }
        // Not a symbol line — fall through; might be the next clause heading.
      }

      // -------- NOTES (under the most recent clause or table) --------

      const noteHit = matchNote(block);
      if (noteHit && lastClauseRef) {
        blocks.push({
          kind: "note",
          underClause: lastClauseRef.number,
          text: noteHit,
          ...(page !== undefined ? { page } : {}),
        } satisfies NoteBlock);
        continue;
      }

      // -------- Annex clauses (B-1.1, B-1.1.1) --------

      if (inAnnex && currentAnnexLetter) {
        const annexClause = matchAnnexClause(block, currentAnnexLetter);
        if (annexClause) {
          const annexBlock: AnnexClauseBlock = {
            kind: "annex_clause",
            annexLetter: currentAnnexLetter,
            number: annexClause.number,
            text: annexClause.text,
            headingPath: [...headingPath(), `ANNEX ${currentAnnexLetter}`],
            ...(annexClause.title !== undefined ? { title: annexClause.title } : {}),
            ...(page !== undefined ? { page } : {}),
          };
          blocks.push(annexBlock);
          lastClauseRef = annexBlock;
          continue;
        }
      }

      // -------- Clauses (the main body shape) --------

      const clauseHit = matchClause(block);
      if (clauseHit) {
        // Manage clause stack: drop any deeper clauses, push current.
        const depth = clauseDepth(clauseHit.number);
        while (clauseStack.length >= depth) clauseStack.pop();

        const parentClause =
          clauseStack.length > 0 ? clauseStack[clauseStack.length - 1]?.number : undefined;

        const newClause: ClauseBlock = {
          kind: "clause",
          number: clauseHit.number,
          text: clauseHit.text,
          headingPath: headingPath(),
          ...(clauseHit.title !== undefined ? { title: clauseHit.title } : {}),
          ...(currentSection ? { section: currentSection.number } : {}),
          ...(parentClause !== undefined ? { parentClause } : {}),
          ...(page !== undefined ? { page } : {}),
        };
        clauseStack.push(newClause);
        blocks.push(newClause);
        lastClauseRef = newClause;

        // Enter / exit the symbols section based on top-level clause "4".
        inSymbolsSection = newClause.number === "4";

        // Detect inline equations within this clause body.
        const equations = extractInlineEquations(newClause.text, newClause.number, page);
        for (const eq of equations) blocks.push(eq);

        continue;
      }

      // -------- Continuation paragraph for the current clause --------

      // If nothing matched and we're inside a clause, treat the paragraph as
      // a continuation of the last clause body.
      if (lastClauseRef && lastClauseRef.kind === "clause") {
        lastClauseRef.text += `\n\n${block}`;
        const equations = extractInlineEquations(block, lastClauseRef.number, page);
        for (const eq of equations) blocks.push(eq);
        continue;
      }

      // Otherwise, drop the orphan block. Logging at debug verbosity only.
    }
  }

  return {
    docId: meta.docId,
    title: meta.title,
    versionLabel: meta.versionLabel,
    year: meta.year,
    amendments: amendmentsSummary,
    blocks,
  };
};

// ---------- Page splitter ----------

type PageSegment = { page: number | undefined; text: string };

const splitWithPages = (markdown: string): PageSegment[] => {
  // The sentinel marks the END of a page; the FIRST segment has no preceding
  // sentinel, so we assign it page 1 if any sentinel is found, undefined otherwise.
  const out: PageSegment[] = [];
  let lastIndex = 0;
  let currentPage: number | undefined = undefined;
  const re = new RegExp(PAGE_SEPARATOR_REGEX.source, "g");
  let firstSeen = false;
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown)) !== null) {
    const text = markdown.slice(lastIndex, match.index);
    if (!firstSeen) {
      // The first sentinel demarcates the FIRST page index value.
      // Everything before it is page (current_page - 1) typically; but
      // LlamaParse emits the suffix at the end of each page, so the text
      // BEFORE the sentinel is the page identified BY the sentinel.
      const pageNum = Number(match[1]);
      out.push({ page: pageNum, text });
      currentPage = pageNum;
      firstSeen = true;
    } else {
      const pageNum = Number(match[1]);
      out.push({ page: pageNum, text });
      currentPage = pageNum;
    }
    lastIndex = match.index + match[0].length;
  }
  // Trailing text after the final sentinel (should be empty for well-formed
  // output, but be safe).
  if (lastIndex < markdown.length) {
    const tail = markdown.slice(lastIndex);
    if (tail.trim()) {
      out.push({
        page: currentPage !== undefined ? currentPage + 1 : undefined,
        text: tail,
      });
    }
  }
  if (out.length === 0) {
    // No sentinels found — return everything as a single page-less segment.
    out.push({ page: undefined, text: markdown });
  }
  return out;
};

// ---------- Block splitter ----------

const splitBlocks = (text: string): string[] =>
  // Two-or-more newlines as a block separator. Keep HTML tables intact —
  // they're already grouped because LlamaParse emits them as a unit.
  text
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

// ---------- Decoration stripper ----------

const stripMarkdownDecoration = (block: string): string =>
  block
    // Strip ATX headers (# / ## / ### prefixes) but keep the text.
    .replace(/^#{1,6}\s+/gm, "")
    // Bold/italic markers — strip * and _ when used for emphasis.
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(?<!\w)_([^_]+)_(?!\w)/g, "$1");

// ---------- Pattern matchers ----------

const matchAmendmentHeader = (
  block: string,
): { no: string; date?: string } | undefined => {
  // Header variants seen in the wild:
  //   "AMENDMENT NO. 2 SEPTEMBER 2005"      (one line, dated)
  //   "AMENDMENT NO. 2"                     (one line, no date)
  //   "AMENDMENT NO.3 AUGUST 2007"          (no space before number)
  //   "AMENDMENT NO. I JUNI .1"             (OCR'd; number garbled)
  // Match the number+optional-date form first; fall back to bare number.
  // Also accept the OCR'd "NO. I" → treat as "No. 1".
  const dated = block.match(
    /^AMENDMENT\s+NO\.?\s*([\dIVXLC]+)\s+([A-Z]+\.?\s*\d{0,4})/im,
  );
  if (dated) {
    const num = romanOrDigit(dated[1] ?? "");
    const date = parseAmendmentDate(dated[2] ?? "");
    return { no: `No. ${num}`, ...(date !== undefined ? { date } : {}) };
  }
  const bare = block.match(/^AMENDMENT\s+NO\.?\s*([\dIVXLC]+)\s*$/im);
  if (bare) {
    const num = romanOrDigit(bare[1] ?? "");
    return { no: `No. ${num}` };
  }
  return undefined;
};

const romanOrDigit = (s: string): string => {
  if (/^\d+$/.test(s)) return s;
  // Tiny roman parser for I, II, III, IV, V — enough for amendment numbers.
  const map: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };
  let total = 0;
  let prev = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    const ch = s[i];
    if (!ch) continue;
    const v = map[ch.toUpperCase()] ?? 0;
    if (v < prev) total -= v;
    else { total += v; prev = v; }
  }
  return String(total || 1);
};

const parseAmendmentDate = (raw: string): string | undefined => {
  // "SEPTEMBER 2005" → "2005-09-01"
  const months: Record<string, string> = {
    JANUARY: "01", FEBRUARY: "02", MARCH: "03", APRIL: "04",
    MAY: "05", JUNE: "06", JULY: "07", AUGUST: "08",
    SEPTEMBER: "09", OCTOBER: "10", NOVEMBER: "11", DECEMBER: "12",
  };
  const m = raw.match(/^([A-Z]+)\s+(\d{4})/i);
  if (!m) return undefined;
  const monthRaw = m[1];
  const yearRaw = m[2];
  if (!monthRaw || !yearRaw) return undefined;
  const mm = months[monthRaw.toUpperCase()];
  if (!mm) return undefined;
  return `${yearRaw}-${mm}-01`;
};

const matchForewordHeader = (block: string): boolean =>
  /^FOREWORD\s*$/im.test(block) || /^FOREWORD\b/i.test(block.split("\n")[0] ?? "");

const matchSectionHeader = (
  block: string,
): { number: string; title: string } | undefined => {
  // "SECTION 2 MATERIALS, WORKMANSHIP, INSPECTION AND TESTING"
  // "SECTION 1  GENERAL"
  // Some docs use "Section 2" with title case.
  const m = block.match(/^SECTION\s+(\d+)\s+(.+)$/im);
  if (!m) return undefined;
  const num = m[1];
  const title = m[2];
  if (!num || !title) return undefined;
  // Heuristic: the title should be on its own line; reject if a paragraph
  // came after (which would suggest this is a sentence, not a heading).
  const firstLine = block.split("\n")[0] ?? "";
  if (!/^SECTION/i.test(firstLine)) return undefined;
  return { number: num.trim(), title: title.trim() };
};

const matchAnnexHeader = (block: string): { letter: string } | undefined => {
  // "ANNEX A" / "ANNEX B"
  const m = block.match(/^ANNEX\s+([A-Z])\s*$/im);
  if (!m || !m[1]) return undefined;
  return { letter: m[1] };
};

const matchAnnexClause = (
  block: string,
  letter: string,
): { number: string; title?: string; text: string } | undefined => {
  // Annex clauses look like "B-1", "B-1.1", "B-1.1.1"
  const pattern = new RegExp(`^${letter}-(\\d+(?:\\.\\d+)*)\\s+(.+)`, "s");
  const m = block.match(pattern);
  if (!m) return undefined;
  const numTail = m[1];
  const rest = m[2];
  if (!numTail || !rest) return undefined;
  return splitTitleAndBody(`${letter}-${numTail}`, rest);
};

const matchClause = (
  block: string,
): { number: string; title?: string; text: string } | undefined => {
  // "8.2.2.4 Exposure to sulphate attack\n\n<body>"  OR
  // "5.1 Cement\n<body>"  OR
  // "26.5.1.1(b) Some title\n<body>"
  // Also tolerates "5.1.1" with no title.
  const m = block.match(/^(\d+(?:\.\d+)*(?:\([a-z]\))?)\s+([\s\S]+)$/);
  if (!m) return undefined;
  const number = m[1];
  const rest = m[2];
  if (!number || !rest) return undefined;
  // Reject "table-like" numerics e.g. "1 2 3 4 5" — require non-numeric chars in the rest.
  if (!/[A-Za-z]/.test(rest)) return undefined;

  const result = splitTitleAndBody(number, rest);

  // Distinguish three cases:
  //   (a) Real clause with prose body in same block:
  //         "5.1 Cement\nThe cement used shall be..." → keep, body has prose
  //   (b) Heading-only clause (body will arrive as continuation blocks):
  //         "26.1.1 General" → keep with empty body; next blocks append
  //   (c) TOC entry with page number masquerading as body:
  //         "13.5 Curing" followed by separate "27" block. Same shape as (b)
  //         from the regex's view, but we can detect it via the FOLLOW-UP block.
  //
  // Approach: reject pure-numeric bodies (page numbers leaking in). Accept
  // everything else — the orchestrator's continuation logic will fold real
  // prose into (b), and lone TOC entries will end up with empty bodies that
  // we filter at chunking time.
  const bodyTrimmed = result.text.trim();
  if (/^\d{1,4}$/.test(bodyTrimmed)) return undefined; // pure page number
  // If the body is short AND looks like a title (no periods, no shall/should),
  // emit a heading-only clause with empty text — continuation logic will fill it.
  const looksLikeProse =
    bodyTrimmed.length >= 80 ||
    /[.!?]\s|[.!?]$/.test(bodyTrimmed) ||
    /\bshall\b|\bshould\b|\bmay\b/i.test(bodyTrimmed);
  if (!looksLikeProse) {
    // Heading-only — body becomes title, real body fills via continuation.
    return { number, title: bodyTrimmed, text: "" };
  }
  return result;
};

const splitTitleAndBody = (
  number: string,
  rest: string,
): { number: string; title?: string; text: string } => {
  // If the first line is short (<= 80 chars) and is followed by a paragraph,
  // treat it as the clause title and the rest as body. Otherwise the whole
  // thing is body.
  const lines = rest.split("\n");
  const firstLine = (lines[0] ?? "").trim();
  if (firstLine.length > 0 && firstLine.length <= 80 && lines.length > 1) {
    const body = lines.slice(1).join("\n").trim();
    if (body.length > 0) {
      return { number, title: firstLine, text: body };
    }
  }
  return { number, text: rest.trim() };
};

const clauseDepth = (clauseNum: string): number => {
  // "8.2.2.4" → 4. Letter suffixes don't increase depth: "26.5.1.1(b)" → 4.
  const dotted = clauseNum.replace(/\([a-z]\)$/, "");
  return dotted.split(".").length;
};

const matchNote = (block: string): string | undefined => {
  // "NOTE — text..." or "NOTE-text" or "NOTE 1 — text" or "NOTES\n1. text..."
  const m = block.match(/^NOTE(?:\s*\d+)?\s*[—–\-]\s*(.+)$/is);
  if (m && m[1]) return m[1].trim();
  // Multi-line NOTES block
  if (/^NOTES?\s*$/im.test(block.split("\n")[0] ?? "")) {
    return block.replace(/^NOTES?\s*\n/i, "").trim();
  }
  return undefined;
};

// ---------- Symbol section ----------

const parseSymbolEntries = (block: string): SymbolBlock[] => {
  // Each symbol entry in IS 456's Clause 4 looks like:
  //   "f_ck — Characteristic cube compressive strength of concrete"
  // or "f_{ck} — Characteristic..." (LlamaParse might LaTeX-ify subscripts).
  // The block may contain multiple entries on consecutive lines.
  const out: SymbolBlock[] = [];
  const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    // Allow short symbol token (1-12 chars, letters/digits/Greek/underscore/braces),
    // then an em-dash / en-dash / hyphen / "-", then definition text.
    const m = line.match(/^([A-Za-z_α-ωΑ-Ω\d\\{}]{1,16})\s*[—–\-]\s*(.+)$/);
    if (m && m[1] && m[2]) {
      const symbol = normalizeSymbol(m[1]);
      const definition = m[2].trim();
      // Filter out things that aren't really symbols: definitions must contain a letter.
      if (/[A-Za-z]/.test(definition)) {
        out.push({ kind: "symbol", symbol, definition });
      }
    }
  }
  return out;
};

const normalizeSymbol = (raw: string): string =>
  raw
    .replace(/\\?_?\{([^}]+)\}/g, "_$1") // f_{ck} → f_ck
    .replace(/\\([a-zA-Z]+)/g, "$1");    // \sigma → sigma

// Convert a 2-column table (symbol | definition) into SymbolBlocks.
// Used when we detect a table inside the SYMBOLS section (Clause 4) — LlamaParse
// renders the original two-column glossary as a markdown table, not as line
// entries.
const symbolsFromTable = (table: TableBlock): SymbolBlock[] => {
  const out: SymbolBlock[] = [];
  for (const row of table.rows) {
    // The data structure puts the first cell as label and rest as cells; in
    // a 2-col table, label is the symbol, cells[0] is the definition.
    const symbolRaw = (row.label ?? row.cells[0] ?? "").trim();
    const defRaw = (row.label !== undefined ? row.cells[0] : row.cells[1]) ?? "";
    const definition = defRaw
      .replace(/^[-—–\s]+/, "")
      .trim();
    if (!symbolRaw || !definition) continue;
    if (symbolRaw.length > 16) continue; // not a symbol
    if (!/[A-Za-zα-ωΑ-Ω]/.test(symbolRaw)) continue;
    out.push({
      kind: "symbol",
      symbol: normalizeSymbol(symbolRaw),
      definition,
    });
  }
  return out;
};

// ---------- Equations ----------

const extractInlineEquations = (
  text: string,
  parentClause: string,
  page: number | undefined,
): EquationBlock[] => {
  const out: EquationBlock[] = [];
  // Match formulas of the form "X = ..." where X starts with a letter and the
  // RHS contains math characters (√, =, /, digits, sub/super, ×).
  // Conservative: must have an `=` and at least one math-ish token.
  const eqPattern =
    /\b([A-Za-z][A-Za-z_]{0,8})\s*=\s*([0-9A-Za-z_×·√^/\\.()\s+\-]+(?:N\/mm[²2]|kN\/mm[²2]|MPa)?)/g;
  let m: RegExpExecArray | null;
  while ((m = eqPattern.exec(text)) !== null) {
    const lhs = m[1];
    const rhs = m[2];
    if (!lhs || !rhs) continue;
    // Heuristic filter: skip plain assignments inside prose ("which = the value")
    // by requiring either √, ², ×, /, or a digit in the RHS.
    if (!/[√²×/.0-9^]/.test(rhs)) continue;
    out.push({
      kind: "equation",
      parentClause,
      raw: `${lhs} = ${rhs.trim()}`,
      symbolsUsed: extractSymbolTokens(`${lhs} ${rhs}`),
      ...(page !== undefined ? { page } : {}),
    });
  }
  return out;
};

const extractSymbolTokens = (text: string): string[] => {
  const tokens = new Set<string>();
  // Greedy: pull every "letter[_letter|digits]" run.
  const pattern = /\b([A-Za-z](?:_[A-Za-z0-9]+|[A-Za-z]{0,6}))\b/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    const t = m[1];
    if (!t) continue;
    // Skip common English words to reduce noise.
    if (/^(the|and|of|for|in|on|to|is|at|or|by|as)$/i.test(t)) continue;
    tokens.add(t);
  }
  return [...tokens];
};

// ---------- Tables ----------

const parseHtmlTable = (
  block: string,
  page: number | undefined,
): TableBlock | undefined => {
  // Look for a preceding caption: "Table N <Title>" before the <table>.
  const beforeTable = block.split(/<table[^>]*>/i)[0] ?? "";
  const captionInfo = extractTableCaption(beforeTable);

  // Find rows.
  const tableMatch = block.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch || !tableMatch[1]) return undefined;
  const inner = tableMatch[1];

  // Pull <thead>/<tbody> if present, else treat all <tr>s by position.
  const rows: string[][] = [];
  const trMatches = inner.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
  for (const tr of trMatches) {
    const cells: string[] = [];
    const cellMatches = (tr[1] ?? "").matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi);
    for (const c of cellMatches) {
      cells.push(stripHtml(c[1] ?? "").trim());
    }
    if (cells.length > 0) rows.push(cells);
  }
  if (rows.length === 0) return undefined;

  // Heuristic: rows whose cells contain no digits and are short are header rows.
  // Stop counting header rows at the first row that has a numeric/data cell.
  const headers: TableHeaderRow[] = [];
  const dataRows: TableRow[] = [];
  let inHeader = true;
  for (const r of rows) {
    if (inHeader && isHeaderRow(r)) {
      headers.push(r);
    } else {
      inHeader = false;
      // First cell often holds the row label (e.g. "i)", "Class 3").
      const [label, ...cells] = r;
      const row: TableRow = { cells: r };
      if (label !== undefined && /^[ivxlc\d]+\)?$/i.test(label.trim())) {
        row.label = label.trim();
        row.cells = cells;
      }
      dataRows.push(row);
    }
  }

  const blockAfterTable = block.split(/<\/table>/i)[1] ?? "";
  const notes = extractTrailingNotes(blockAfterTable);

  if (!captionInfo) {
    // Table without a caption — still useful, but we synthesize a placeholder.
    return {
      kind: "table",
      number: "Table ?",
      title: "",
      sourceClauses: [],
      headers,
      rows: dataRows,
      ...(notes !== undefined ? { notes } : {}),
      ...(page !== undefined ? { page } : {}),
    };
  }
  return {
    kind: "table",
    number: captionInfo.number,
    title: captionInfo.title,
    sourceClauses: captionInfo.sourceClauses,
    headers,
    rows: dataRows,
    ...(notes !== undefined ? { notes } : {}),
    ...(page !== undefined ? { page } : {}),
  };
};

const extractTableCaption = (
  beforeTable: string,
): { number: string; title: string; sourceClauses: string[] } | undefined => {
  // "Table 4 Requirements for Concrete Exposed to Sulphate Attack\n(Clauses 8.2.2.4 and 9.1.2)"
  const lines = beforeTable
    .split("\n")
    .map((l) => stripMarkdownDecoration(l).trim())
    .filter(Boolean);
  if (lines.length === 0) return undefined;
  // Find the last "Table N ..." line — caption is closest to the <table>.
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] ?? "";
    const tableMatch = line.match(/^Table\s+(\d+)\s+(.+)$/i);
    if (tableMatch) {
      const number = `Table ${tableMatch[1]}`;
      const title = tableMatch[2]?.trim() ?? "";
      // Next line often has "(Clauses X.Y and X.Y)"
      const next = lines[i + 1] ?? "";
      const clauseRefMatch = next.match(/\(Clauses?\s+([\d., and]+)\)/i);
      const sourceClauses: string[] = clauseRefMatch
        ? (clauseRefMatch[1] ?? "")
            .split(/[,\s]+and\s+|,\s*/i)
            .map((s) => s.trim())
            .filter((s) => /^\d+(?:\.\d+)*$/.test(s))
        : [];
      return { number, title, sourceClauses };
    }
  }
  return undefined;
};

const extractTrailingNotes = (afterTable: string): string | undefined => {
  const trimmed = afterTable.trim();
  if (!trimmed) return undefined;
  if (/^NOTES?\b/i.test(trimmed)) return trimmed;
  return undefined;
};

const isHeaderRow = (cells: string[]): boolean => {
  // A header row has at least one cell with letters and no cell with a
  // pure-number value pattern (e.g. "320" or "0.45") in non-label columns.
  if (cells.length === 0) return false;
  const hasLetters = cells.some((c) => /[A-Za-z]/.test(c));
  const hasOnlyShortLabels = cells.every((c) => c.length < 80);
  return hasLetters && hasOnlyShortLabels;
};

const stripHtml = (s: string): string =>
  s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));

// ---------- Pipe-style markdown tables (fallback) ----------

const isPipeTable = (block: string): boolean => {
  const lines = block.split("\n");
  if (lines.length < 2) return false;
  const line0 = lines[0] ?? "";
  const line1 = lines[1] ?? "";
  return line0.includes("|") && /^[\s|:\-]+$/.test(line1);
};

const parsePipeTable = (
  block: string,
  page: number | undefined,
): TableBlock | undefined => {
  const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return undefined;
  const splitRow = (row: string): string[] =>
    row.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const header = splitRow(lines[0] ?? "");
  const rows: TableRow[] = [];
  for (let i = 2; i < lines.length; i++) {
    const cells = splitRow(lines[i] ?? "");
    rows.push({ cells });
  }
  return {
    kind: "table",
    number: "Table ?",
    title: "",
    sourceClauses: [],
    headers: [header],
    rows,
    ...(page !== undefined ? { page } : {}),
  };
};

// ---------- Amendments ----------

const parseAmendmentLines = (
  block: string,
  amendmentNo: string,
  amendmentDate: string | undefined,
): AmendmentBlock[] => {
  const out: AmendmentBlock[] = [];
  // Amendments come as bullet lines like (parens OR brackets accepted):
  //   "(Page 13, clause 5.2.1.1, line 1) — Substitute 'IS 3812 (Part 1)' for ..."
  //   "[Page 17, clause 7.1 (see also Amendment No. 1)] - In the informal..."
  //   "[Page 30, Table 11, col 3 (see also Amendment No. 1)] — Substitute ..."
  //   "(Page 15, clause 5.6.3) — Add the following after the clause and..."
  // We accept either [...] or (...) bracketing, allow a "(see also Amendment No. X)"
  // tail inside, and don't require the leading dash to be em-dash.
  const itemPattern =
    /[\(\[]\s*Page\s+(\d+)\s*,\s*(?:clause|Annex|Table|Foreword|para|col)\s+([\w\-.()]+)(?:\s*,\s*line\s+(\d+))?[^\)\]]*[\)\]]\s*[—–\-]\s*([\s\S]+?)(?=\n\s*[\(\[]\s*Page\s+\d+\s*,|\n*$)/gi;

  let m: RegExpExecArray | null;
  while ((m = itemPattern.exec(block)) !== null) {
    const pageRefStr = m[1];
    const clauseRef = m[2];
    const lineRefStr = m[3];
    const body = (m[4] ?? "").trim();
    if (!pageRefStr || !clauseRef || !body) continue;
    const { action, oldText, newText } = classifyAmendmentBody(body);
    out.push({
      kind: "amendment",
      amendmentNo,
      ...(amendmentDate !== undefined ? { date: amendmentDate } : {}),
      pageRef: Number(pageRefStr),
      clauseRef,
      ...(lineRefStr !== undefined ? { lineRef: Number(lineRefStr) } : {}),
      action,
      ...(oldText !== undefined ? { oldText } : {}),
      ...(newText !== undefined ? { newText } : {}),
      raw: m[0],
    });
  }
  return out;
};

const classifyAmendmentBody = (
  body: string,
): { action: AmendmentAction; oldText?: string; newText?: string } => {
  // "Substitute 'NEW' for 'OLD'."
  const subMatch = body.match(
    /Substitute\s+['"‘“]([^'"’”]+)['"’”]\s+for\s+['"‘“]([^'"’”]+)['"’”]/i,
  );
  if (subMatch && subMatch[1] && subMatch[2]) {
    return { action: "substitute", newText: subMatch[1], oldText: subMatch[2] };
  }
  // "Substitute the following for the existing: 'NEW'"
  const subFollowing = body.match(/Substitute\s+the\s+following\s+for\s+the\s+existing:?\s*([\s\S]+)/i);
  if (subFollowing && subFollowing[1]) {
    return { action: "substitute", newText: subFollowing[1].trim() };
  }
  // "Delete the word 'X'." / "Delete." / "Delete the last sentence."
  const delMatch = body.match(/^Delete(?:\s+the\s+word\s+['"‘“]([^'"’”]+)['"’”])?/i);
  if (delMatch) {
    return { action: "delete", ...(delMatch[1] !== undefined ? { oldText: delMatch[1] } : {}) };
  }
  // "Add the following at the end:" / "Add the following after ..."
  const addMatch = body.match(/^Add(?:\s+the\s+following)?[:\s]+([\s\S]+)/i);
  if (addMatch && addMatch[1]) {
    return { action: "add", newText: addMatch[1].trim() };
  }
  // "Insert the following ..."
  const insMatch = body.match(/^Insert\s+the\s+following[:\s]+([\s\S]+)/i);
  if (insMatch && insMatch[1]) {
    return { action: "insert", newText: insMatch[1].trim() };
  }
  // "renumber ... as ..."
  if (/renumber/i.test(body)) {
    return { action: "renumber", newText: body };
  }
  // Default: substitute with raw body as newText.
  return { action: "substitute", newText: body };
};
