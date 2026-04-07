import type { Request, Response } from "express";
import { PDFParse } from "pdf-parse";
const test = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file || !file.buffer) {
      return res.status(400).json({ error: "No file buffer received." });
    }

    // 1. Initialize the parser with the buffer
    const parser = new PDFParse({ data: file.buffer });

    // 2. Extract the text
    const result = await parser.getText();

    // 3. (Optional) Get metadata like your example
    const info = await parser.getInfo();

    // 4. Clean up memory
    await parser.destroy();


console.log("Metadata:", info);
console.log("Actual Data:", result.text);        
    res.json({
      message: "PDF parsed successfully",
      text: result.text, // The actual decoded text
      pages: info.total,
      metadata: info.info,
    });
  } catch (error) {
    console.error("Parsing error:", error);
    res.status(500).json({ error: "Failed to parse PDF" });
  }
};

export default test;
