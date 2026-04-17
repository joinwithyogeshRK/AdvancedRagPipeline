import { Router } from "express"
import { Pinecone } from "@pinecone-database/pinecone"
import { requireClerkSession } from "../middleware/requireClerk.js"

const router   = Router()
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! })
const index    = pinecone.index("rag-index")

router.use(requireClerkSession)

// ─────────────────────────────────────────────────────────────
// GET /documents/list
// Queries Pinecone metadata to return every unique source the
// signed-in user has uploaded, newest first.
// ─────────────────────────────────────────────────────────────
router.get("/list", async (req, res) => {
  try {
    const userId = req.supabaseUserId!

    const results = await index.query({
      vector:          new Array(1024).fill(0),
      topK:            100,
      includeMetadata: true,
      filter:          { userId: { $eq: userId } },
    })

    const sourceMap = new Map<string, number>()

    results.matches?.forEach(m => {
      const source     = m.metadata?.source     as string | undefined
      const uploadedAt = m.metadata?.uploadedAt as number | undefined
      if (source && uploadedAt && !sourceMap.has(source)) {
        sourceMap.set(source, uploadedAt)
      }
    })

    const documents = Array.from(sourceMap.entries())
      .map(([source, uploadedAt]) => ({ source, uploadedAt }))
      .sort((a, b) => b.uploadedAt - a.uploadedAt)

    console.log(`✅ Documents list: ${documents.length} unique sources for user`)
    res.json({ documents })

  } catch (err) {
    console.error("Failed to list documents:", err)
    res.status(500).json({ error: "Failed to fetch documents" })
  }
})

// ─────────────────────────────────────────────────────────────
// DELETE /documents/delete
// Body: { source: string }
//
// Finds every Pinecone vector that matches (userId + source)
// and deletes them all.  No Supabase involvement — vectors are
// the single source of truth for document storage here.
//
// Strategy:
//   1. Query with a zero-vector + metadata filter to collect IDs
//      (topK 10 000 to grab as many as possible in one shot)
//   2. Delete those IDs in batches of 1 000 (Pinecone hard limit)
// ─────────────────────────────────────────────────────────────
router.delete("/delete", async (req, res) => {
  try {
    const userId = req.supabaseUserId!
    const { source } = req.body as { source?: string }

    if (!source?.trim()) {
      res.status(400).json({ error: "source is required" })
      return
    }

    console.log(`🗑  Delete request — user: ${userId}  source: ${source}`)

    // Step 1 — collect all matching vector IDs
    const queryRes = await index.query({
      vector:          new Array(1024).fill(0),
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

    if (ids.length === 0) {
      
      // Nothing to delete — still return success (idempotent)
      res.json({ success: true, source, deletedCount: 0 })
      return
    }

    // Step 2 — delete in batches of 1 000
    const BATCH = 1000
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH)
      await index.deleteMany(batch)
      console.log(
        `  🗑  Deleted batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(ids.length / BATCH)} (${batch.length} vectors)`
      )
    }

    console.log(`  ✅ Delete complete — ${ids.length} vectors removed for source: ${source}`)
    res.json({ success: true, source, deletedCount: ids.length })

  } catch (err) {
    console.error("Failed to delete document:", err)
    res.status(500).json({ error: "Failed to delete document" })
  }
})

export default router