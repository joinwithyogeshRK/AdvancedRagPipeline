import type { Request, Response } from "express";
import PDFParser from "pdf2json";
import { chunkText } from "../rag/chunker.js";


const pdf = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const query = req.body.query; // ← get query from request

    if (!file || !file.buffer) {
      return res.status(400).json({ error: "No file received." });
    }

    // Step 1 — Parse PDF
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

    console.log("✅ PDF parsed");

    // Step 2 — Chunk Text
    const chunks = await chunkText(text);
    console.log("Total chunks:", chunks.length);
    console.log("First chunk:", chunks[0]);

    res.json({
      message: "PDF parsed and chunked successfully",
      totalChunks: chunks.length,
      firstChunk: chunks[0],
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Failed to process PDF" });
  }
};

export default pdf;
