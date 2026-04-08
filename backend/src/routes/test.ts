import type { Request, Response } from "express";
import PDFParser from "pdf2json";

const test = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file || !file.buffer) {
      return res.status(400).json({ error: "No file received." });
    }

    const pdfParser = new PDFParser();

    const text = await new Promise<string>((resolve, reject) => {
      pdfParser.on("pdfParser_dataReady", (data) => {
        // extract raw text from all pages
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

    console.log("Extracted text:", text.slice(0, 200));

    res.json({
      message: "PDF parsed successfully",
      text,
    });
  } catch (error) {
    console.error("Parsing error:", error);
    res.status(500).json({ error: "Failed to parse PDF" });
  }
};

export default test;
