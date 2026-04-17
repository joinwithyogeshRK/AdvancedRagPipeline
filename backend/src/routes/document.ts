// backend/src/routes/document.ts
import { Router, type Request, type Response } from "express"
import { requireClerkSession } from "../middleware/requireClerk.js"
import { Pinecone } from "@pinecone-database/pinecone"
import { createClient } from "@supabase/supabase-js"

const router = Router()

// ── Supabase client ────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// ── Pinecone client ────────────────────────────────────────────────────────
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! })
const index    = pinecone.index("rag-index")

router.use(requireClerkSession)

// ─────────────────────────────────────────────────────────────────────────
// GET /documents/list
// Source of truth is Supabase — faster, cheaper, no Pinecone query credits.
// ─────────────────────────────────────────────────────────────────────────
router.get("/list", async (req: Request, res: Response) => {
  try {
    const userId = req.supabaseUserId!

    const { data, error } = await supabase
      .from("documents")
      .select("source, uploaded_at")
      .eq("user_id", userId)
      .order("uploaded_at", { ascending: false })

    if (error) throw error

    // Deduplicate by source — keep the most-recent entry per source
    const seen   = new Set<string>()
    const unique = (data ?? []).filter((row: any) => {
      if (seen.has(row.source)) return false
      seen.add(row.source)
      return true
    })

    res.json({
      documents: unique.map((row: any) => ({
        source:     row.source,
        uploadedAt: new Date(row.uploaded_at).getTime(),
      })),
    })

  } catch (err) {
    console.error("GET /documents/list error:", err)
    res.status(500).json({ error: "Failed to fetch documents" })
  }
})

// ─────────────────────────────────────────────────────────────────────────
// DELETE /documents/delete
// Body: { source: string }
//
// Steps:
//   1. Query Pinecone with zero-vector + metadata filter to collect IDs
//   2. Delete by IDs in batches of 1000
//      FIX: serverless Pinecone requires index.deleteMany({ ids: [...] })
//           NOT index.deleteMany([...]) — passing a plain array causes
//           PineconeBadRequestError on serverless indexes
//   3. Delete rows from Supabase
// ─────────────────────────────────────────────────────────────────────────
router.delete("/delete", async (req: Request, res: Response) => {
  try {
    const userId = req.supabaseUserId!
    const { source } = req.body as { source?: string }

    if (!source?.trim()) {
      res.status(400).json({ error: "source is required" })
      return
    }

    console.log(`🗑  Delete request — user: ${userId}  source: ${source}`)

    // ── 1. Collect matching Pinecone vector IDs ──────────────────────────
    const queryRes = await index.query({
      vector:          new Array(1024).fill(0),   // zero vector — only care about metadata filter
      topK:            10000,
      includeMetadata: false,
      filter: {
        $and: [
          { userId: { $eq: userId } },
          { source: { $eq: source  } },
        ],
      },
    })

    const ids = (queryRes.matches ?? []).map(m => m.id)
    console.log(`  📋 Found ${ids.length} vectors to delete for source: ${source}`)

    // ── 2. Delete from Pinecone in batches ──────────────────────────────
    if (ids.length > 0) {
      const BATCH = 1000

      for (let i = 0; i < ids.length; i += BATCH) {
        const batch = ids.slice(i, i + BATCH)

        // ✅ CORRECT for serverless Pinecone — object with ids array
        // ❌ WRONG (PineconeBadRequestError) — index.deleteMany(batch)
        await index.deleteMany({ ids: batch })

        console.log(
          `  🗑  Deleted batch ${Math.floor(i / BATCH) + 1}` +
          `/${Math.ceil(ids.length / BATCH)} (${batch.length} vectors)`
        )
      }
    }

    console.log(`  ✅ Pinecone delete complete — ${ids.length} vectors removed`)

    // ── 3. Delete from Supabase ──────────────────────────────────────────
    const { error: supabaseError, count } = await supabase
      .from("documents")
      .delete({ count: "exact" })
      .eq("user_id", userId)
      .eq("source",  source)

    if (supabaseError) {
      // Pinecone already cleaned — partial success, don't 500
      console.error("  ❌ Supabase delete error:", supabaseError)
      res.status(207).json({
        success:              false,
        message:              "Deleted from Pinecone but Supabase deletion failed",
        supabaseError:        supabaseError.message,
        pineconeDeletedCount: ids.length,
      })
      return
    }

    console.log(`  ✅ Supabase deleted ${count ?? "?"} rows for source: ${source}`)
    console.log(`  ✅ Delete complete for source: ${source}`)

    res.json({
      success:                true,
      source,
      supabaseRowsDeleted:    count ?? 0,
      pineconeVectorsDeleted: ids.length,
    })

  } catch (err) {
    console.error("DELETE /documents/delete error:", err)
    res.status(500).json({ error: "Failed to delete document" })
  }
})

export default router