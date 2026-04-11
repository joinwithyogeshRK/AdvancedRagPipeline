import "dotenv/config";
import { Pinecone } from "@pinecone-database/pinecone";

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

const index = pinecone.index("rag-index");

export const storeInPinecone = async (
  embeddedChunks: { text: string; vector: number[] }[],
) => {
  const vectors = embeddedChunks.map((chunk, i) => ({
    id: `chunk-${Date.now()}-${i}`,
    values: chunk.vector,
    metadata: { text: chunk.text },
  }));

  await index.upsert({ records: vectors });
  console.log(`✅ Stored ${vectors.length} vectors in Pinecone`);
};

export const searchPinecone = async (
  queryVector: number[],
  topK: number = 5,
  minScore: number = 0.15,
): Promise<string[]> => {
  const results = await index.query({
    vector: queryVector,
    topK,
    includeMetadata: true,
  });

  results.matches?.forEach((m) => {
    console.log(
      `  Score: ${m.score?.toFixed(4)} — "${(m.metadata?.text as string)?.slice(0, 60)}..."`,
    );
  });

  const relevant =
    results.matches?.filter((m) => m.score && m.score > minScore) ?? [];

  console.log(
    `✅ Found ${relevant.length} relevant chunks (filtered from ${results.matches?.length ?? 0})`,
  );

  return relevant.map((m) => m.metadata?.text as string).filter(Boolean);
};
