// Dump the raw LlamaParse markdown to a file for inspection.
import "dotenv/config";
import * as fs from "node:fs/promises";
import { parsePdfToMarkdown } from "../rag/civilCode/llamaParseClient.js";

const main = async () => {
  const file = process.argv[2];
  const pages = process.argv[3];
  const out = process.argv[4] ?? "/tmp/is456-markdown.md";
  if (!file) {
    console.error("Usage: dumpMarkdown <file.pdf> [pages] [outPath]");
    process.exit(2);
  }
  const buf = await fs.readFile(file);
  const { markdown, pageCount } = await parsePdfToMarkdown(buf, pages !== undefined ? { targetPages: pages } : {});
  await fs.writeFile(out, markdown);
  console.log(`wrote ${markdown.length} chars (${pageCount} sentinels) to ${out}`);
};
main().catch((e) => { console.error(e); process.exit(1); });
