// backend/src/rag/chunker.ts

import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const chunkText = async (document: string) => {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize:    600,   // ← was 100. Enough for 3-4 table rows together
    chunkOverlap: 80,    // ← was 20. More overlap = context preserved at boundaries
    separators: [
      "\n\n",   // paragraph breaks first (highest priority)
      "\n",     // then line breaks — critical for tables
      ". ",     // then sentence endings
      ", ",     // then clause breaks
      " ",      // then word breaks
      "",       // last resort — character split
    ],
  });

  const texts = await splitter.splitText(document);
  console.log("chunks:", texts.length);

  const cleanChunks = texts.filter((chunk) => chunk.trim().length > 20);
  console.log("cleanChunks:", cleanChunks);

  return cleanChunks;
};

export { chunkText };