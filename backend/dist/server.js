import "dotenv/config";
import express from "express";
import cors from "cors";
import { Router } from "express";
import multer from "multer";
import test from "./routes/pdf.js";
import historyRouter from "./routes/history.js";
import githubAuthRouter from "./routes/githubAuth.js";
import { requireClerkSession } from "./middleware/requireClerk.js";
import documentRouter from "./routes/document.js";
const defaultOrigins = [
    "https://advanced-rag-pipeline.vercel.app",
    "https://advanced-rag-pipeline-git-test-joinwithyogesh17-9788s-projects.vercel.app"
];
const origins = process.env.FRONTEND_ORIGINS?.split(",")
    .map((o) => o.trim())
    .filter(Boolean) ?? defaultOrigins;
const app = express();
app.use(express.json());
app.use("/documents", documentRouter);
app.use(cors({
    origin: origins,
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
}));
const PORT = process.env.PORT || 3009;
const data = multer().single("File");
const router1 = Router();
app.use(router1);
router1.post("/query", requireClerkSession, data, test);
router1.use("/history", historyRouter);
router1.use("/auth/github", githubAuthRouter);
app.listen(PORT, function (err) {
    if (err)
        console.log(err);
    console.log("Server listening on PORT", PORT);
});
//# sourceMappingURL=server.js.map