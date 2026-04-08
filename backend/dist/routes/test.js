import PDFParser from "pdf2json";
const test = async (req, res) => {
    try {
        const file = req.file;
        if (!file || !file.buffer) {
            return res.status(400).json({ error: "No file received." });
        }
        const pdfParser = new PDFParser();
        const text = await new Promise((resolve, reject) => {
            pdfParser.on("pdfParser_dataReady", (data) => {
                // extract raw text from all pages
                const rawText = data.Pages.map((page) => page.Texts.map((t) => decodeURIComponent(t.R.map((r) => r.T).join(""))).join(" ")).join("\n");
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
    }
    catch (error) {
        console.error("Parsing error:", error);
        res.status(500).json({ error: "Failed to parse PDF" });
    }
};
export default test;
//# sourceMappingURL=test.js.map