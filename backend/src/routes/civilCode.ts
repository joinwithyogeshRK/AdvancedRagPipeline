// Civil-code library HTTP routes.
//
//   POST /ingest/is-code        admin-only; ingests a PDF into the shared library
//   GET  /civil/codes           any authenticated user; lists available codes
//
// Mount in server.ts via:
//   import civilCodeRouter from "./routes/civilCode.js"
//   router1.use("/civil",       requireClerkSession, civilCodeRouter)
//   router1.use("/ingest",      requireClerkSession, civilCodeRouter)
//
// (Both prefixes share the same router; admin gate is applied per-route below.)

import { Router, type Request, type Response } from "express";
import multer from "multer";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { ingestIsCodePdf } from "../rag/civilCode/isCodeIngest.js";
import { listIsCodes } from "../services/civilCodeService.js";

const router = Router();

// 25 MB upload limit — IS codes are typically under 20 MB scanned.
const upload = multer({
  limits: { fileSize: 25 * 1024 * 1024 },
}).single("file");

// ---------- POST /ingest/is-code (admin) ----------

router.post(
  "/is-code",
  requireAdmin,
  (req: Request, res: Response, next) => {
    upload(req, res, (err: unknown) => {
      if (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return res.status(400).json({ error: `Upload failed: ${msg}` });
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    const file = req.file;
    if (!file || !file.buffer) {
      return res.status(400).json({ error: "No file uploaded (field name: 'file')." });
    }

    const docId = req.body.doc_id ?? req.body.docId;
    const title = req.body.title;
    const versionLabel = req.body.version_label ?? req.body.versionLabel;
    const yearRaw = req.body.year;

    if (!docId || !title || !versionLabel || !yearRaw) {
      return res.status(400).json({
        error:
          "Missing required fields. Provide doc_id, title, version_label, year as form fields.",
      });
    }
    const year = Number(yearRaw);
    if (!Number.isInteger(year)) {
      return res.status(400).json({ error: "year must be an integer (e.g. 2000)." });
    }

    try {
      const targetPages = req.body.target_pages as string | undefined;
      const result = await ingestIsCodePdf({
        pdfBuffer: file.buffer,
        docId,
        title,
        versionLabel,
        year,
        ...(req.supabaseUserId ? { uploadedBy: req.supabaseUserId } : {}),
        ...(targetPages
          ? { parseOptions: { targetPages } }
          : {}),
      });
      return res.json(result);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[civilCode] ingest failed:", msg);
      // Don't leak env-var-bearing error messages.
      const safe = !/_KEY|SECRET|TOKEN|password/i.test(msg);
      return res.status(500).json({
        error: safe ? msg : "Ingest failed. Check server logs.",
      });
    }
  },
);

// ---------- GET /civil/codes (any authenticated user) ----------

router.get("/codes", async (_req: Request, res: Response) => {
  try {
    const codes = await listIsCodes();
    return res.json({ codes });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[civilCode] list failed:", msg);
    return res.status(500).json({ error: "Failed to list civil codes." });
  }
});

export default router;
