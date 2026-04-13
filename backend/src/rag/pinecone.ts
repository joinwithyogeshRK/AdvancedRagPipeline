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

// ─────────────────────────────────────────────────────────────
// STORE
// ─────────────────────────────────────────────────────────────

// CHANGE this in pinecone.ts storeInPinecone:

export const storeInPinecone = async (
  embeddedChunks: { text: string; vector: number[] }[],
  userId: string,
  ts: number = Date.now(),   // ← accept ts from outside so IDs match BM25
) => {
  const vectors = embeddedChunks.map((chunk, i) => ({
    id:       `${userId}-${ts}-${i}`,   // same formula as bm25Chunks
    values:   chunk.vector,
    metadata: { text: chunk.text, userId },
  }));

  await index.upsert({ records: vectors });
  console.log(`✅ Stored ${vectors.length} vectors in Pinecone (user-scoped)`);
};

// ─────────────────────────────────────────────────────────────
// SEARCH — now returns PineconeResult[] instead of string[]
// ─────────────────────────────────────────────────────────────

export const searchPinecone = async (
  queryVector: number[],
  userId: string,
  topK: number = 5,
): Promise<PineconeResult[]> => {
  const results = await index.query({
    vector: queryVector,
    topK,
    includeMetadata: true,
    filter: { userId: { $eq: userId } },
  });

  results.matches?.forEach((m) => {
    console.log(
      `  Score: ${m.score?.toFixed(4)} — "${(m.metadata?.text as string)?.slice(0, 60)}..."`,
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