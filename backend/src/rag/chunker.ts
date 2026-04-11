import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const chunkText = async (document: string) => {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 100, // optimal for Voyage free tier (1024 token limit per chunk)
    chunkOverlap: 20, // 20% overlap — preserves context across chunk boundaries
    separators: ["\n\n", "\n", ".", "!", "?", ",", " ", ""], // tries to split naturally
  });

  const texts = await splitter.splitText(document);
  console.log("chunks:", texts.length);

  const cleanChunks = texts.filter((chunk) => chunk.trim().length > 20);
  console.log("cleanChunks:", cleanChunks);

  return cleanChunks;
};

export { chunkText };
