import { TokenTextSplitter } from "@langchain/textsplitters";


const chunkText = async (document: string) => {
    const splitter = new TokenTextSplitter({
      encodingName: "cl100k_base",
      chunkSize: 1000,
      chunkOverlap: 100,
    });

    const texts = splitter.splitText(document);
     const cleanChunks = (await texts).filter((chunk) => chunk.trim().length > 0);
    return cleanChunks;
};
export { chunkText };
