import { Router } from "express"
import { Pinecone } from "@pinecone-database/pinecone"
import { requireClerkSession } from "../middleware/requireClerk.js"

const router  = Router()
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! })
const index   = pinecone.index("rag-index")

router.use(requireClerkSession)

// GET /documents/list
router.get("/list", async (req, res) => {
  try {
    const userId = req.supabaseUserId!

    // Dummy zero vector query — we don't care about similarity
    // We just want metadata back for this user's vectors
    const results = await index.query({
      vector:          new Array(1024).fill(0),
      topK:            100,
      includeMetadata: true,
      filter:          { userId: { $eq: userId } },
    })

    // Extract unique filenames + their upload timestamps
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
      .sort((a, b) => b.uploadedAt - a.uploadedAt)  // newest first

    console.log(`✅ Documents list: ${documents.length} unique files for user`)

    res.json({ documents })

  } catch (err) {
    console.error("Failed to list documents:", err)
    res.status(500).json({ error: "Failed to fetch documents" })
  }
})

export default router