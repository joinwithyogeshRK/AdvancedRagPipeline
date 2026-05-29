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
import {
  calculateMixDesign,
  type MixDesignInputs,
  type ExposureCondition,
  type CementType,
  type ConcreteType,
  type FineAggregateZone,
} from "../services/mixDesignService.js";

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

// ---------- POST /civil/mix-design (any authenticated user) ----------
//
// Deterministic IS 10262:2019 concrete mix-design calculation. The math runs
// in code (mixDesignService); each step carries an IS-code reference so the
// result is verifiable against the standard.

const EXPOSURES: ExposureCondition[] = ["Mild", "Moderate", "Severe", "Very Severe", "Extreme"];
const CEMENTS: CementType[] = ["OPC 33", "OPC 43", "OPC 53", "PPC", "PSC", "SRC"];
const CONCRETE_TYPES: ConcreteType[] = ["Plain", "Reinforced"];
const ZONES: FineAggregateZone[] = ["I", "II", "III", "IV"];
const AGG_SIZES = [10, 20, 40];
const AGG_TYPES = ["Crushed", "Natural (Uncrushed)"];

router.post("/mix-design", async (req: Request, res: Response) => {
  const b = req.body ?? {};
  const errors: string[] = [];

  const grade = Number(b.grade);
  if (!Number.isFinite(grade) || grade < 10 || grade > 100) {
    errors.push("grade must be a number between 10 and 100 (e.g. 30 for M30).");
  }
  if (!CEMENTS.includes(b.cementType)) {
    errors.push(`cementType must be one of: ${CEMENTS.join(", ")}.`);
  }
  const maxAggregateSize = Number(b.maxAggregateSize);
  if (!AGG_SIZES.includes(maxAggregateSize)) {
    errors.push("maxAggregateSize must be 10, 20, or 40 (mm).");
  }
  const workabilitySlump = Number(b.workabilitySlump);
  if (!Number.isFinite(workabilitySlump) || workabilitySlump < 0 || workabilitySlump > 250) {
    errors.push("workabilitySlump must be a number between 0 and 250 (mm).");
  }
  if (!EXPOSURES.includes(b.exposureCondition)) {
    errors.push(`exposureCondition must be one of: ${EXPOSURES.join(", ")}.`);
  }
  if (!CONCRETE_TYPES.includes(b.concreteType)) {
    errors.push(`concreteType must be one of: ${CONCRETE_TYPES.join(", ")}.`);
  }
  if (!AGG_TYPES.includes(b.aggregateType)) {
    errors.push(`aggregateType must be one of: ${AGG_TYPES.join(", ")}.`);
  }
  if (!ZONES.includes(b.fineAggregateZone)) {
    errors.push(`fineAggregateZone must be one of: ${ZONES.join(", ")}.`);
  }
  if (typeof b.useChemicalAdmixture !== "boolean") {
    errors.push("useChemicalAdmixture must be a boolean.");
  }

  if (errors.length > 0) {
    return res.status(400).json({ error: "Invalid mix-design inputs.", details: errors });
  }

  // Only forward optional numeric fields that were actually provided, so the
  // service applies its own IS-code defaults for the rest.
  const optionalNumeric = [
    "admixtureDosagePercent",
    "waterReductionPercent",
    "cementSpecificGravity",
    "coarseAggregateSpecificGravity",
    "fineAggregateSpecificGravity",
    "admixtureSpecificGravity",
    "coarseAggregateAbsorption",
    "fineAggregateAbsorption",
    "coarseAggregateMoisture",
    "fineAggregateMoisture",
  ] as const;

  const inputs: MixDesignInputs = {
    grade,
    cementType: b.cementType,
    maxAggregateSize: maxAggregateSize as 10 | 20 | 40,
    workabilitySlump,
    exposureCondition: b.exposureCondition,
    concreteType: b.concreteType,
    aggregateType: b.aggregateType,
    fineAggregateZone: b.fineAggregateZone,
    useChemicalAdmixture: b.useChemicalAdmixture,
  };
  for (const key of optionalNumeric) {
    const v = Number(b[key]);
    if (b[key] !== undefined && b[key] !== null && b[key] !== "" && Number.isFinite(v)) {
      (inputs as Record<string, unknown>)[key] = v;
    }
  }

  try {
    const result = calculateMixDesign(inputs);
    return res.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[civilCode] mix-design failed:", msg);
    return res.status(500).json({ error: "Mix-design calculation failed." });
  }
});

export default router;
