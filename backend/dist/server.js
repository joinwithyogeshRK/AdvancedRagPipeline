import express from "express";
import cors from "cors";
import { Router } from "express";
import test from "./routes/pdf.js";
import historyRouter from "./routes/history.js";
import multer from "multer";
const app = express();
app.use(express.json());
app.use(cors({
    origin: "https://advanced-rag-pipeline.vercel.app",
    methods: ["GET", "POST"],
    credentials: true,
}));
const PORT = process.env.PORT || 3009;
const data = multer().single("File");
const router1 = Router();
app.use(router1);
router1.post("/query", data, test);
router1.use("/history", historyRouter);
app.listen(PORT, function (err) {
    if (err)
        console.log(err);
    console.log("Server listening on PORT", PORT);
});
//# sourceMappingURL=server.js.map