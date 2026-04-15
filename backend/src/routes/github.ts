import { Router, type Request, type Response } from 'express'
import { requireClerkSession } from '../middleware/requireClerk.js'
import { indexGithubRepo, parseGithubUrl } from '../rag/githubIndexer.js'
import { saveRepoTree, getRepoTrees, deleteRepoTree } from '../services/repoTreeService.js'

const router = Router()
router.use(requireClerkSession)

// ─────────────────────────────────────────────────────────────
// POST /github/index
// Validate + index a GitHub repo
// ─────────────────────────────────────────────────────────────

router.post('/index', async (req: Request, res: Response) => {
  const { repoUrl } = req.body as { repoUrl?: string }
  const userId      = req.supabaseUserId!

  // Validate URL on backend too (never trust frontend)
  if (!repoUrl?.trim()) {
    return res.status(400).json({ error: 'No repository URL provided' })
  }

  const parsed = parseGithubUrl(repoUrl)
  if (!parsed) {
    return res.status(400).json({
      error: 'Invalid GitHub URL. Format: https://github.com/owner/repo'
    })
  }

  try {
    console.log(`\n🐙 Index request: ${repoUrl} by user ${userId}`)

    const result = await indexGithubRepo(repoUrl, userId)

    // Save tree to Supabase
    await saveRepoTree(
      userId,
      repoUrl,
      result.repoName,
      result.tree,
      result.fileCount,
    )

    return res.json({
      success:      true,
      repoName:     result.repoName,
      fileCount:    result.fileCount,
      chunkCount:   result.chunkCount,
      skippedCount: result.skippedCount,
      tree:         result.tree,
    })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to index repository'
    console.error('GitHub indexing error:', err)

    // Return appropriate status codes for known errors
    if (msg.includes('not found or is private')) {
      return res.status(404).json({ error: msg })
    }
    if (msg.includes('rate limit')) {
      return res.status(429).json({ error: msg })
    }
    if (msg.includes('No indexable files') || msg.includes('No content')) {
      return res.status(422).json({ error: msg })
    }

    return res.status(500).json({ error: msg })
  }
})

// ─────────────────────────────────────────────────────────────
// GET /github/repos
// List all indexed repos for this user
// ─────────────────────────────────────────────────────────────

router.get('/repos', async (req: Request, res: Response) => {
  try {
    const repos = await getRepoTrees(req.supabaseUserId!)
    return res.json({ repos })
  } catch (err) {
    console.error('Failed to fetch repos:', err)
    return res.status(500).json({ error: 'Failed to fetch repositories' })
  }
})

// ─────────────────────────────────────────────────────────────
// DELETE /github/repos/:repoUrl
// Remove an indexed repo
// ─────────────────────────────────────────────────────────────

router.delete('/repos', async (req: Request, res: Response) => {
  const { repoUrl } = req.body as { repoUrl?: string }

  if (!repoUrl) {
    return res.status(400).json({ error: 'No repo URL provided' })
  }

  try {
    await deleteRepoTree(req.supabaseUserId!, repoUrl)
    return res.json({ success: true })
  } catch (err) {
    console.error('Failed to delete repo:', err)
    return res.status(500).json({ error: 'Failed to delete repository' })
  }
})

export default router