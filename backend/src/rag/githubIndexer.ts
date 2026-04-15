import { embedChunks } from './embedder.js'
import { storeInPinecone } from './pinecone.js'
import { chunkCodeContent } from './codeChunker.js'

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export interface RepoFile {
  path: string
  type: 'blob' | 'tree'
  size?: number
}

export interface IndexResult {
  repoName:    string
  fileCount:   number
  chunkCount:  number
  skippedCount: number
  tree:        RepoFile[]
}

// ─────────────────────────────────────────────────────────────
// FILTER RULES
// ─────────────────────────────────────────────────────────────

const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', '.next', '.git',
  'coverage', '.cache', 'out', '__pycache__', '.pytest_cache',
  '.turbo', '.vercel', '.output', 'vendor', 'target',
  'bin', 'obj', '.gradle', '.idea', '.vscode',
])

const SKIP_EXTENSIONS = new Set([
  // Images
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.bmp', '.tiff',
  // Binary
  '.exe', '.dll', '.so', '.dylib', '.bin', '.wasm',
  // Archives
  '.zip', '.tar', '.gz', '.rar', '.7z',
  // Media
  '.mp4', '.mp3', '.wav', '.avi', '.mov', '.pdf',
  // Data
  '.csv', '.parquet', '.sqlite', '.db',
  // Compiled/minified
  '.min.js', '.min.css', '.map',
  // Fonts
  '.ttf', '.woff', '.woff2', '.eot',
])

const SKIP_FILENAMES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'composer.lock', 'Gemfile.lock', 'poetry.lock',
  '.DS_Store', 'Thumbs.db', '.gitkeep',
])

const KEEP_EXTENSIONS = new Set([
  // Code
  '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs',
  '.java', '.cpp', '.c', '.cs', '.rb', '.php', '.swift',
  '.kt', '.scala', '.vue', '.svelte',
  // Config
  '.json', '.yaml', '.yml', '.toml', '.env.example',
  // Docs
  '.md', '.mdx', '.txt', '.rst',
  // Web
  '.html', '.css', '.scss', '.sass',
])

const MAX_FILE_SIZE = 500_000  // 500KB — skip files larger than this

function shouldSkipPath(filePath: string): boolean {
  const parts = filePath.split('/')

  // Skip if any directory in path is in SKIP_DIRS
  for (const part of parts.slice(0, -1)) {
    if (SKIP_DIRS.has(part)) return true
    // Skip hidden dirs (except .github)
    if (part.startsWith('.') && part !== '.github') return true
  }

  const fileName = parts[parts.length - 1] ?? ''
  const ext      = '.' + fileName.split('.').pop()?.toLowerCase()

  // Skip specific filenames
  if (SKIP_FILENAMES.has(fileName)) return true

  // Skip binary/media extensions
  if (SKIP_EXTENSIONS.has(ext)) return true

  // Only keep known useful extensions
  if (!KEEP_EXTENSIONS.has(ext)) return true

  return false
}

// ─────────────────────────────────────────────────────────────
// PARSE & VALIDATE GITHUB URL
// ─────────────────────────────────────────────────────────────

export function parseGithubUrl(url: string): { owner: string; repo: string } | null {
  try {
    const cleaned = url.trim().replace(/\/$/, '').replace(/\.git$/, '')
    const match   = cleaned.match(
      /^https?:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/
    )
    if (!match) return null
    return { owner: match[1]!, repo: match[2]! }
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────
// FETCH REPO TREE
// Uses GitHub API — no auth needed for public repos
// ─────────────────────────────────────────────────────────────

async function fetchRepoTree(
  owner: string,
  repo:  string
): Promise<RepoFile[]> {

  const url      = `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`
  const headers: Record<string, string> = {
    'Accept':     'application/vnd.github.v3+json',
    'User-Agent': 'AdvancedRAG/1.0',
  }

  // Use token if available (raises rate limit from 60 to 5000/hr)
  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`
  }

  const res = await fetch(url, { headers })

  if (res.status === 404) {
    throw new Error('Repository not found or is private')
  }
  if (res.status === 403) {
    throw new Error('GitHub API rate limit exceeded. Try again in an hour.')
  }
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status}`)
  }

  const data = await res.json() as {
    tree:     { path: string; type: string; size?: number }[]
    truncated: boolean
  }

  if (data.truncated) {
    console.warn('⚠️  Repo tree was truncated by GitHub (too many files)')
  }

  return data.tree
    .filter(item => item.type === 'blob')
    .map(item => ({
      path: item.path,
      type: 'blob' as const,
      size: item.size ?? 0,
    }))
}

// ─────────────────────────────────────────────────────────────
// FETCH FILE CONTENT
// ─────────────────────────────────────────────────────────────

async function fetchFileContent(
  owner:    string,
  repo:     string,
  filePath: string
): Promise<string | null> {

  const url     = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`
  const headers: Record<string, string> = {
    'Accept':     'application/vnd.github.v3+json',
    'User-Agent': 'AdvancedRAG/1.0',
  }

  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`
  }

  const res = await fetch(url, { headers })

  if (!res.ok) {
    console.warn(`  ⚠️  Could not fetch ${filePath}: ${res.status}`)
    return null
  }

  const data = await res.json() as { content?: string; encoding?: string }

  if (!data.content || data.encoding !== 'base64') return null

  // Decode base64 content
  const decoded = Buffer.from(data.content, 'base64').toString('utf-8')

  // Final check — skip if content looks binary
  if (decoded.includes('\x00')) return null

  return decoded
}

// ─────────────────────────────────────────────────────────────
// BATCH FETCH — fetch files in parallel batches
// ─────────────────────────────────────────────────────────────

async function fetchFilesInBatches(
  owner:    string,
  repo:     string,
  files:    RepoFile[],
  batchSize: number = 5
): Promise<{ file: RepoFile; content: string }[]> {

  const results: { file: RepoFile; content: string }[] = []

  for (let i = 0; i < files.length; i += batchSize) {
    const batch   = files.slice(i, i + batchSize)
    const fetched = await Promise.all(
      batch.map(async (file) => {
        const content = await fetchFileContent(owner, repo, file.path)
        return content ? { file, content } : null
      })
    )

    fetched.forEach(r => { if (r) results.push(r) })

    console.log(`  📥 Fetched batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(files.length / batchSize)}`)

    // Small delay between batches to respect rate limits
    if (i + batchSize < files.length) {
      await new Promise(r => setTimeout(r, 300))
    }
  }

  return results
}

// ─────────────────────────────────────────────────────────────
// MAIN — INDEX A REPO
// ─────────────────────────────────────────────────────────────

export async function indexGithubRepo(
  repoUrl: string,
  userId:  string
): Promise<IndexResult> {

  // 1. Parse URL
  const parsed = parseGithubUrl(repoUrl)
  if (!parsed) throw new Error('Invalid GitHub URL')

  const { owner, repo } = parsed
  const repoName        = `${owner}/${repo}`

  console.log(`\n🐙 Indexing GitHub repo: ${repoName}`)

  // 2. Fetch tree
  console.log('  📁 Fetching repo tree...')
  const allFiles = await fetchRepoTree(owner, repo)
  console.log(`  📁 Total files in repo: ${allFiles.length}`)

  // 3. Filter files
  const validFiles  = allFiles.filter(f => {
    if (shouldSkipPath(f.path))          return false
    if ((f.size ?? 0) > MAX_FILE_SIZE)   return false
    return true
  })

  const skippedCount = allFiles.length - validFiles.length
  console.log(`  ✅ Files to index: ${validFiles.length} (skipped ${skippedCount})`)

  if (validFiles.length === 0) {
    throw new Error('No indexable files found in this repository')
  }

  // 4. Fetch file contents in batches
  console.log('  📥 Fetching file contents...')
  const fileContents = await fetchFilesInBatches(owner, repo, validFiles)

  // 5. Chunk all files
  console.log('  ✂️  Chunking files...')
  const allChunks: { text: string; filePath: string }[] = []

  for (const { file, content } of fileContents) {
    const ext    = '.' + file.path.split('.').pop()?.toLowerCase()
    const chunks = chunkCodeContent(content, file.path, ext)
    chunks.forEach(text => allChunks.push({ text, filePath: file.path }))
  }

  console.log(`  ✂️  Total chunks: ${allChunks.length}`)

  if (allChunks.length === 0) {
    throw new Error('No content could be extracted from this repository')
  }

  // 6. Embed + store in Pinecone
  console.log('  🔢 Embedding chunks...')
  const ts         = Date.now()
  const source     = `github:${repoName}`
  const texts      = allChunks.map(c => c.text)
  const embedded   = await embedChunks(texts)

  // Add filePath to each embedded chunk metadata
  const embeddedWithMeta = embedded.map((e, i) => ({
    ...e,
    filePath: allChunks[i]?.filePath ?? '',
  }))

  // Store with rich metadata
  await storeRepoInPinecone(embeddedWithMeta, userId, ts, source, repoName)

  console.log(`  ✅ Indexed ${allChunks.length} chunks from ${fileContents.length} files`)

  return {
    repoName,
    fileCount:    fileContents.length,
    chunkCount:   allChunks.length,
    skippedCount,
    tree:         validFiles,
  }
}

// ─────────────────────────────────────────────────────────────
// STORE REPO CHUNKS IN PINECONE
// Same as storeInPinecone but with extra filePath metadata
// ─────────────────────────────────────────────────────────────

async function storeRepoInPinecone(
  embeddedChunks: { text: string; vector: number[]; filePath: string }[],
  userId:         string,
  ts:             number,
  source:         string,
  repoName:       string,
) {
  const { Pinecone } = await import('@pinecone-database/pinecone')
  const pinecone     = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! })
  const index        = pinecone.index('rag-index')

  // Store in batches of 100 (Pinecone upsert limit)
  const BATCH = 100

  for (let i = 0; i < embeddedChunks.length; i += BATCH) {
    const batch   = embeddedChunks.slice(i, i + BATCH)
    const vectors = batch.map((chunk, j) => ({
      id:     `${userId}-${ts}-${i + j}`,
      values: chunk.vector,
      metadata: {
        text:        chunk.text,
        userId,
        source,
        filePath:    chunk.filePath,
        repoName,
        uploadedAt:  ts,
        chunkIndex:  i + j,
        totalChunks: embeddedChunks.length,
      },
    }))

    await index.upsert({ records: vectors })
    console.log(`  📌 Stored batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(embeddedChunks.length / BATCH)}`)
  }
}