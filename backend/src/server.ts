import "dotenv/config";
import express from "express";
import cors from "cors";
import { Router } from "express";
import multer from "multer";
import test from "./routes/pdf.js";
import historyRouter from "./routes/history.js";
import { requireClerkSession } from "./middleware/requireClerk.js";

const defaultOrigins = [
  "https://advanced-rag-pipeline.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];
const origins =
  process.env.FRONTEND_ORIGINS?.split(",")
    .map((o) => o.trim())
    .filter(Boolean) ?? defaultOrigins;

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: origins,
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

const PORT = process.env.PORT || 3009;
const data = multer().single("File");

const router1 = Router();
app.use(router1);

router1.post("/query", requireClerkSession, data, test);
router1.use("/history", historyRouter);

app.listen(PORT, function (err: unknown) {
  if (err) console.log(err);
  console.log("Server listening on PORT", PORT);
});
