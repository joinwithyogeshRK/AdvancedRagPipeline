import "dotenv/config";
import { Pinecone } from "@pinecone-database/pinecone";

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

const index = pinecone.index("rag-index");

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export interface PineconeResult {
  id: string
  text: string
  metadata?: Record<string, any>
}

export interface MetadataFilter {
  source?:     string
  uploadedAt?: {
    after?:  number
    before?: number
  }
}

// ─────────────────────────────────────────────────────────────
// STORE — now accepts rich metadata
// ─────────────────────────────────────────────────────────────

export const storeInPinecone = async (
  embeddedChunks: { text: string; vector: number[] }[],
  userId:         string,
  ts:             number = Date.now(),
  source:         string = 'unknown',   // ← filename
) => {
  const vectors = embeddedChunks.map((chunk, i) => ({
    id:     `${userId}-${ts}-${i}`,
    values: chunk.vector,
    metadata: {
      text:        chunk.text,
      userId,
      source,                           // ← filename stored here
      uploadedAt:  ts,                  // ← timestamp stored here
      chunkIndex:  i,                   // ← position in document
      totalChunks: embeddedChunks.length,
    },
  }));

  await index.upsert({ records: vectors });
  console.log(`✅ Stored ${vectors.length} vectors | source: ${source}`);
};

// ─────────────────────────────────────────────────────────────
// BUILD PINECONE FILTER — translates our MetadataFilter to
// Pinecone's filter syntax
// ─────────────────────────────────────────────────────────────

function buildFilter(userId: string, filter?: MetadataFilter) {
  const must: Record<string, any>[] = [
    { userId: { $eq: userId } }         // always filter by user
  ]

  if (filter?.source) {
    must.push({ source: { $eq: filter.source } })
  }

  if (filter?.uploadedAt?.after) {
    must.push({ uploadedAt: { $gte: filter.uploadedAt.after } })
  }

  if (filter?.uploadedAt?.before) {
    must.push({ uploadedAt: { $lte: filter.uploadedAt.before } })
  }

  // If only userId filter → return simple object (your current behavior)
  if (must.length === 1) {
    return { userId: { $eq: userId } }
  }

  // Multiple filters → use $and
  return { $and: must }
}

// ─────────────────────────────────────────────────────────────
// SEARCH — now accepts optional metadata filter
// ─────────────────────────────────────────────────────────────

export const searchPinecone = async (
  queryVector: number[],
  userId:      string,
  topK:        number = 5,
  filter?:     MetadataFilter,        // ← optional, backward compatible
): Promise<PineconeResult[]> => {

  const pineconeFilter = buildFilter(userId, filter)

  console.log('🔎 Pinecone filter:', JSON.stringify(pineconeFilter))

  const results = await index.query({
    vector:          queryVector,
    topK,
    includeMetadata: true,
    filter:          pineconeFilter,
  });

  results.matches?.forEach((m) => {
    console.log(
      `  Score: ${m.score?.toFixed(4)} | source: ${m.metadata?.source} — "${(m.metadata?.text as string)?.slice(0, 50)}..."`,
    );
  });

  const chunks: PineconeResult[] =
    results.matches
      ?.filter((m) => m.metadata?.text)
      .map((m) => ({
        id:       m.id,
        text:     m.metadata!.text as string,
        metadata: m.metadata as Record<string, any>,
      })) ?? [];

  console.log(`✅ Found ${chunks.length} chunks`);
  return chunks;
};

// ─────────────────────────────────────────────────────────────
// CIVIL CODE PATH — shared library, deterministic IDs, no userId
// scoping. Used by the civilCode/* pipeline.
// ─────────────────────────────────────────────────────────────

export type CivilVectorRecord = {
  id:       string                          // deterministic, e.g. "civil:IS_456_2000:clause:8.2.2.4"
  vector:   number[]
  text:     string
  metadata: Record<string, any>             // civilCode/types.ts CivilCodeMetadata
}

export const upsertCivilVectors = async (records: CivilVectorRecord[]) => {
  // Pinecone supports up to 100 vectors per upsert call.
  const BATCH = 100
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH).map(r => ({
      id:     r.id,
      values: r.vector,
      metadata: { ...r.metadata, text: r.text },
    }))
    await index.upsert({ records: batch })
    console.log(`✅ Upserted civil batch ${Math.floor(i / BATCH) + 1} (${batch.length} vectors)`)
  }
}

// Filter shape for civil-code retrieval. All fields optional; any present
// fields are AND-combined.
export interface CivilSearchFilter {
  doc_id?:        string
  content_type?:  string | string[]
  clause_number?: string
  table_number?:  string
  symbols_used?:  string   // matches if vector's symbols_used array contains this value
}

const buildCivilFilter = (f?: CivilSearchFilter): Record<string, any> | undefined => {
  if (!f) return undefined
  const must: Record<string, any>[] = []
  if (f.doc_id)        must.push({ doc_id:        { $eq: f.doc_id } })
  if (f.clause_number) must.push({ clause_number: { $eq: f.clause_number } })
  if (f.table_number)  must.push({ table_number:  { $eq: f.table_number } })
  if (f.symbols_used)  must.push({ symbols_used:  { $in: [f.symbols_used] } })
  if (f.content_type) {
    must.push(Array.isArray(f.content_type)
      ? { content_type: { $in: f.content_type } }
      : { content_type: { $eq: f.content_type } })
  }
  if (must.length === 0) return undefined
  if (must.length === 1) return must[0]
  return { $and: must }
}

export const searchCivilPinecone = async (
  queryVector: number[],
  topK:        number = 5,
  filter?:     CivilSearchFilter,
): Promise<PineconeResult[]> => {
  const pf = buildCivilFilter(filter)
  console.log('🔎 Civil Pinecone filter:', pf ? JSON.stringify(pf) : '(none)')

  const queryOpts: Parameters<typeof index.query>[0] = {
    vector:          queryVector,
    topK,
    includeMetadata: true,
  }
  if (pf !== undefined) queryOpts.filter = pf
  const results = await index.query(queryOpts);

  const chunks: PineconeResult[] =
    results.matches
      ?.filter((m) => m.metadata?.text)
      .map((m) => ({
        id:       m.id,
        text:     m.metadata!.text as string,
        metadata: m.metadata as Record<string, any>,
      })) ?? []

  console.log(`✅ Civil search found ${chunks.length} chunks`)
  return chunks
}

// Delete all civil vectors for a given doc_id (used when re-ingesting a code).
export const deleteCivilVectorsForDoc = async (docId: string) => {
  // Pinecone metadata-based delete; supported on serverless indexes.
  await index.deleteMany({ filter: { doc_id: { $eq: docId } } as any })
  console.log(`🗑  Deleted civil vectors for doc_id=${docId}`)
}