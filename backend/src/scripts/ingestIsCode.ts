// Standalone CLI: ingest an IS code PDF directly, bypassing the HTTP route.
// Useful for first-time setup and for iterating on parser quality without
// needing Clerk auth.
//
// Usage (compiled):
//   node dist/scripts/ingestIsCode.js \
//     --file ~/Downloads/is4562000forconcrete.pdf \
//     --doc-id IS_456_2000 \
//     --title "Plain and Reinforced Concrete — Code of Practice" \
//     --version "2000 (4th rev), reaffirmed 2005, with Amend 2 & 3" \
//     --year 2000
//
// Optional:
//   --pages 1-30       limit to first N pages (dev mode)
//   --dry-run          parse only, don't embed/store
//
// Requires LLAMA_CLOUD_API_KEY in backend/.env, plus the same Supabase /
// Pinecone / Voyage env vars the server uses.

import "dotenv/config";
import * as fs from "node:fs/promises";
import { ingestIsCodePdf } from "../rag/civilCode/isCodeIngest.js";
import { parsePdfToMarkdown } from "../rag/civilCode/llamaParseClient.js";
import { parseIsCodeMarkdown } from "../rag/civilCode/isCodeParser.js";
import { mergeAmendmentsIntoClauses } from "../rag/civilCode/amendmentMerger.js";

type Args = {
  file: string;
  docId: string;
  title: string;
  version: string;
  year: number;
  pages?: string;
  dryRun: boolean;
};

const parseArgs = (): Args => {
  const argv = process.argv.slice(2);
  const get = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    if (i < 0 || i + 1 >= argv.length) return undefined;
    return argv[i + 1];
  };
  const has = (name: string): boolean => argv.includes(`--${name}`);

  const file = get("file");
  const docId = get("doc-id");
  const title = get("title");
  const version = get("version");
  const yearRaw = get("year");

  if (!file || !docId || !title || !version || !yearRaw) {
    console.error(
      "Usage: ingestIsCode --file PATH --doc-id ID --title T --version V --year YYYY [--pages 1-30] [--dry-run]",
    );
    process.exit(2);
  }
  const year = Number(yearRaw);
  if (!Number.isInteger(year)) {
    console.error("--year must be an integer");
    process.exit(2);
  }
  const result: Args = {
    file,
    docId,
    title,
    version,
    year,
    dryRun: has("dry-run"),
  };
  const pages = get("pages");
  if (pages !== undefined) result.pages = pages;
  return result;
};

const main = async () => {
  const args = parseArgs();
  console.log(`[ingest] reading ${args.file}`);
  const buf = await fs.readFile(args.file);

  if (args.dryRun) {
    console.log(`[ingest] DRY RUN — parse only, no embed/store`);
    const parseOpts = args.pages !== undefined ? { targetPages: args.pages } : {};
    const { markdown, pageCount } = await parsePdfToMarkdown(buf, parseOpts);
    console.log(`[ingest] markdown: ${markdown.length} chars, ${pageCount} pages`);
    const astRaw = parseIsCodeMarkdown(markdown, {
      docId: args.docId,
      title: args.title,
      versionLabel: args.version,
      year: args.year,
    });
    const { ast, report } = mergeAmendmentsIntoClauses(astRaw);

    const counts: Record<string, number> = {};
    for (const b of ast.blocks) counts[b.kind] = (counts[b.kind] ?? 0) + 1;
    console.log(`[ingest] AST block counts:`);
    for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
    console.log(`[ingest] amendments applied: ${report.applied}, missed: ${report.missed.length}`);

    // Dump first 5 clauses, first 2 tables for eyeballing.
    const clauses = ast.blocks.filter((b) => b.kind === "clause").slice(0, 5);
    for (const c of clauses) {
      if (c.kind !== "clause") continue;
      console.log(`\n--- Clause ${c.number} ${c.title ?? ""} (page ${c.page ?? "?"})`);
      console.log(c.text.slice(0, 300));
    }
    const tables = ast.blocks.filter((b) => b.kind === "table").slice(0, 2);
    for (const t of tables) {
      if (t.kind !== "table") continue;
      console.log(`\n--- ${t.number}: ${t.title} (${t.rows.length} rows)`);
      console.log("  headers:", t.headers);
      console.log("  first row:", t.rows[0]);
    }
    return;
  }

  const parseOpts = args.pages !== undefined ? { targetPages: args.pages } : {};
  const result = await ingestIsCodePdf({
    pdfBuffer: buf,
    docId: args.docId,
    title: args.title,
    versionLabel: args.version,
    year: args.year,
    parseOptions: parseOpts,
  });
  console.log("\n[ingest] DONE");
  console.log(JSON.stringify(result, null, 2));
};

main().catch((e) => {
  console.error("[ingest] FAILED:", e);
  process.exit(1);
});
