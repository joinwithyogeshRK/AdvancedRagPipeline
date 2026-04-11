import { TokenTextSplitter } from "@langchain/textsplitters";


const chunkText = async (document: string) => {
    const splitter = new TokenTextSplitter({
      encodingName: "cl100k_base",
      chunkSize: 500,
      chunkOverlap: 50,
    });

    const texts = splitter.splitText(document);
    console.log("chunks:", texts);
     const cleanChunks = (await texts).filter((chunk) => chunk.trim().length > 0);
     console.log("cleanChunks:", cleanChunks);
    return cleanChunks;
};
export { chunkText };
