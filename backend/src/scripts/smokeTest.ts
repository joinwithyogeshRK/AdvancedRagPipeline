// Exercise the civil-code retrieval pipeline end-to-end against a doc_id
// without going through the HTTP layer. Prints which route was taken,
// how many chunks were retrieved, and the LLM's final answer.

import "dotenv/config";
import { civilQuery } from "../rag/civilCode/civilQuery.js";
import { askGroq } from "../rag/groq.js";

const QUERIES = [
  "What does clause 8.2.2.4 say?",
  "What is f_ck?",
  "Minimum cement content for severe exposure, reinforced concrete?",
  "How should I detail reinforcement to avoid congestion?",
  "What changed in the 2007 amendment?",
];

const main = async () => {
  const docId = process.argv[2] ?? "IS_456_2000";
  const overrideQuery = process.argv[3];
  const queries = overrideQuery ? [overrideQuery] : QUERIES;

  for (const q of queries) {
    console.log("\n" + "=".repeat(72));
    console.log(`QUERY: ${q}`);
    console.log("=".repeat(72));
    try {
      const r = await civilQuery(q, docId);
      console.log(`route=${r.route}  chunks=${r.chunks.length}  doc=${r.civilDocLabel}`);
      if (r.chunks.length > 0) {
        console.log(`\n--- top chunk preview ---`);
        console.log(r.chunks[0]?.slice(0, 400));
      }
      const answer = await askGroq(q, r.chunks, [], undefined, {
        domain: "civil_code",
        civilDocLabel: r.civilDocLabel,
      });
      console.log(`\n--- ANSWER ---`);
      console.log(answer);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`❌ FAILED: ${msg}`);
    }
  }
};

main().catch((e) => { console.error(e); process.exit(1); });
