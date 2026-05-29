import "dotenv/config";
import { supabase } from "../lib/supabase.js";

const main = async () => {
  const docId = process.argv[2] ?? "IS_456_2000";

  const { count: cCount } = await supabase
    .from("is_code_clauses").select("*", { count: "exact", head: true }).eq("doc_id", docId);
  const { count: tCount } = await supabase
    .from("is_code_tables").select("*", { count: "exact", head: true }).eq("doc_id", docId);
  const { count: sCount } = await supabase
    .from("is_code_symbols").select("*", { count: "exact", head: true }).eq("doc_id", docId);
  const { count: aCount } = await supabase
    .from("is_code_amendments").select("*", { count: "exact", head: true }).eq("doc_id", docId);
  const { count: rCount } = await supabase
    .from("is_code_cross_refs").select("*", { count: "exact", head: true }).eq("doc_id", docId);

  console.log(`docId=${docId}`);
  console.log(`  clauses:     ${cCount}`);
  console.log(`  table_rows:  ${tCount}`);
  console.log(`  symbols:     ${sCount}`);
  console.log(`  amendments:  ${aCount}`);
  console.log(`  cross_refs:  ${rCount}`);

  const { data: nums } = await supabase
    .from("is_code_clauses")
    .select("clause_number, is_amended, amended_by")
    .eq("doc_id", docId)
    .order("clause_number");
  console.log(`\nAll clause numbers (${nums?.length ?? 0}):`);
  console.log((nums ?? []).map((r: any) => r.clause_number).join(", "));

  const amended = (nums ?? []).filter((r: any) => r.is_amended);
  console.log(`\nAmended clauses (${amended.length}):`);
  for (const a of amended) console.log(`  ${a.clause_number}  amended_by=${(a.amended_by ?? []).join("; ")}`);
};
main().catch((e) => { console.error(e); process.exit(1); });
