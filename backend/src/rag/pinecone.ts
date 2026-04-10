import "dotenv/config"
import { Pinecone } from "@pinecone-database/pinecone"

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!
})

const index = pinecone.index("rag-index")

// store chunks + vectors in pinecone
export const storeInPinecone = async (
  embeddedChunks: { text: string; vector: number[] }[]
) => {

  const vectors = embeddedChunks.map((chunk, i) => ({
    id      : `chunk-${Date.now()}-${i}`,
    values  : chunk.vector,
    metadata: { text: chunk.text }
  }))

  await index.upsert({records: vectors })

  console.log(`✅ Stored ${vectors.length} vectors in Pinecone`)
}

// search pinecone with query vector
export const searchPinecone = async (
  queryVector: number[],
  topK: number = 5,
  includeMetadata: true,
) => {
  const results = await index.query({
    vector: queryVector,
    topK: topK,
    includeMetadata: true,
  });
  // Only use chunks with high relevance score (above 0.75)
  const relevant =
    results.matches?.filter((m) => m.score && m.score > 0.75) ?? [];

  console.log(
    `✅ Found ${relevant.length} relevant chunks (filtered from ${results.matches?.length ?? 0})`,
  );
  const chunks = relevant.map((match) => match.metadata?.text as string);

  console.log(`✅ Found ${chunks.length} relevant chunks`);
  return chunks;
};;