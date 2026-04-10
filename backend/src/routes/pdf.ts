import type { Request, Response } from "express";
import PDFParser from "pdf2json";
import { chunkText } from "../rag/chunker.js";
import { embedChunks, embedQuery } from "../rag/embedder.js";
import { storeInPinecone, searchPinecone } from "../rag/pinecone.js";
import { askGroq } from "../rag/groq.js";

const pdf = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const query = req.body.query;

    if (!query) {
      return res.status(400).json({ error: "No query provided." });
    }

    // If a PDF is uploaded — run full RAG pipeline
    if (file && file.buffer) {
      const pdfParser = new PDFParser();
      const text = await new Promise<string>((resolve, reject) => {
        pdfParser.on("pdfParser_dataReady", (data) => {
          const rawText = data.Pages.map((page: any) =>
            page.Texts.map((t: any) =>
              decodeURIComponent(t.R.map((r: any) => r.T).join("")),
            ).join(" "),
          ).join("\n");
          resolve(rawText);
        });
        pdfParser.on("pdfParser_dataError", reject);
        pdfParser.parseBuffer(file.buffer);
      });
      console.log("✅ Step 1 — PDF parsed");

      const chunks = await chunkText(text);
      console.log(`✅ Step 2 — ${chunks.length} chunks created`);

      const embeddedChunks = await embedChunks(chunks);
      console.log("✅ Step 3 — Chunks embedded");

      await storeInPinecone(embeddedChunks);
      console.log("✅ Step 4 — Stored in Pinecone");
    }

    // Always embed the query and search Pinecone
    // (whether a new PDF was just uploaded or user is querying existing data)
    const queryVector = await embedQuery(query);
    console.log("✅ Step 5 — Query embedded");

    const relevantChunks = await searchPinecone(queryVector);
    console.log(`✅ Step 6 — ${relevantChunks.length} relevant chunks found`);

    // If Pinecone returned nothing — fall back to Groq general knowledge
    if (relevantChunks.length === 0) {
      console.log(
        "⚠️  No chunks found in Pinecone — falling back to Groq general knowledge",
      );
    }

    const answer = await askGroq(query, relevantChunks);
    console.log("✅ Step 7 — Answer generated");

    res.json({ text: answer });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Failed to process request" });
  }
};

export default pdf;
