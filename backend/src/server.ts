import express from "express";
import cors from "cors";
import { Router } from "express";
import pdfText from "./routes/pdf.js";
import multer from "multer";
import { chunkText } from "./rag/chunker.js";
import "dotenv/config";


const app = express();
app.use(express.json());

app.use(cors());
const PORT = 3009;

const data = multer().single("File");

const router1 = Router();
app.use(router1);

router1.post("/query", data, pdfText);



app.listen(PORT, function (err: any) {
  if (err) console.log(err);
  console.log("Server listening on PORT", PORT);
});
