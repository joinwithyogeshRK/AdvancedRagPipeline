// Wraps the LlamaCloud Parse REST API directly. We bypass the official SDK
// because its workflow-based handler chain has a parameter-passing quirk that
// makes `upload()` throw immediately. The REST API is well-documented and
// stable, and gives us tighter control over progress/polling.
//
// Endpoints used:
//   POST /api/v1/parsing/upload                       — submit file
//   GET  /api/v1/parsing/job/{job_id}                 — poll status
//   GET  /api/v1/parsing/job/{job_id}/result/markdown — fetch markdown
//
// Defaults tuned for IS-code documents:
//   preset:                "auto"   (Cost Optimizer; stretches free credits)
//   output_tables_as_HTML: true     (preserve merged headers)
//   annotate_links:        true     (preserve cross-references)
//   page_suffix:           <<<PAGE:{page_number}>>>   (downstream page split)

import "dotenv/config";
import axios, { AxiosError } from "axios";
import FormData from "form-data";

const LLAMA_CLOUD_API_KEY = process.env.LLAMA_CLOUD_API_KEY;
const BASE_URL = process.env.LLAMA_CLOUD_BASE_URL ?? "https://api.cloud.llamaindex.ai";

// Sentinel emitted between pages so downstream parsing can recover page nums.
export const PAGE_SEPARATOR_REGEX = /<<<PAGE:(\d+)>>>/g;

export type ParseOptions = {
  /** Override the preset. Use "premium" for max accuracy on dense tables. */
  preset?: "fast" | "balanced" | "premium" | "auto" | "structured";
  /** Restrict parsing to specific pages (e.g. "1-30") — useful for dev. */
  targetPages?: string;
  /** Override API key (otherwise reads from env). */
  apiKey?: string;
  /** Override base URL (e.g. EU region). */
  baseUrl?: string;
};

export type ParsedDoc = {
  markdown: string;
  pageCount: number;
};

type JobStatus =
  | "PENDING"
  | "PROCESSING"
  | "SUCCESS"
  | "ERROR"
  | "PARTIAL_SUCCESS"
  | "CANCELLED";

type JobResponse = {
  id: string;
  status: JobStatus;
  error_code?: string;
  error_message?: string;
};

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes — IS codes can be 100+ pages

export const parsePdfToMarkdown = async (
  fileBuffer: Buffer,
  options: ParseOptions = {},
): Promise<ParsedDoc> => {
  const apiKey = options.apiKey ?? LLAMA_CLOUD_API_KEY;
  if (!apiKey) {
    throw new Error(
      "LLAMA_CLOUD_API_KEY is not set. Add it to backend/.env to use the civil-code ingestion pipeline.",
    );
  }
  const baseUrl = options.baseUrl ?? BASE_URL;

  // ---- 1. Upload
  const form = new FormData();
  form.append("file", fileBuffer, {
    filename: "document.pdf",
    contentType: "application/pdf",
  });
  form.append("preset", options.preset ?? "auto");
  form.append("page_suffix", "\n\n<<<PAGE:{page_number}>>>\n\n");
  form.append("output_tables_as_HTML", "true");
  form.append("annotate_links", "true");
  if (options.targetPages !== undefined) {
    form.append("target_pages", options.targetPages);
  }

  console.log(
    `[llamaParse] uploading PDF (${fileBuffer.byteLength} bytes, preset=${
      options.preset ?? "auto"
    }${options.targetPages ? `, pages=${options.targetPages}` : ""})`,
  );

  let jobId: string;
  try {
    const uploadRes = await axios.post<JobResponse>(
      `${baseUrl}/api/v1/parsing/upload`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${apiKey}`,
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      },
    );
    jobId = uploadRes.data.id;
  } catch (e: unknown) {
    throw wrapAxiosError(e, "LlamaParse upload failed");
  }

  console.log(`[llamaParse] job ${jobId} submitted, polling...`);

  // ---- 2. Poll
  const startedAt = Date.now();
  let status: JobStatus = "PENDING";
  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    await sleep(POLL_INTERVAL_MS);
    try {
      const res = await axios.get<JobResponse>(
        `${baseUrl}/api/v1/parsing/job/${jobId}`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      status = res.data.status;
      if (status === "SUCCESS" || status === "PARTIAL_SUCCESS") break;
      if (status === "ERROR" || status === "CANCELLED") {
        throw new Error(
          `LlamaParse job ${jobId} ${status}: ${res.data.error_message ?? res.data.error_code ?? "unknown"}`,
        );
      }
      process.stdout.write(".");
    } catch (e: unknown) {
      if (e instanceof Error && e.message.startsWith("LlamaParse job ")) throw e;
      throw wrapAxiosError(e, `LlamaParse poll failed for job ${jobId}`);
    }
  }
  process.stdout.write("\n");
  if (status !== "SUCCESS" && status !== "PARTIAL_SUCCESS") {
    throw new Error(
      `LlamaParse job ${jobId} timed out after ${POLL_TIMEOUT_MS / 1000}s (last status: ${status})`,
    );
  }
  console.log(`[llamaParse] job ${jobId} ${status}, fetching markdown...`);

  // ---- 3. Fetch markdown
  let markdown: string;
  try {
    const res = await axios.get<{ markdown?: string } | string>(
      `${baseUrl}/api/v1/parsing/job/${jobId}/result/markdown`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    // The endpoint returns { markdown: "..." } in newer API versions; older
    // versions returned a plain string. Handle both.
    if (typeof res.data === "string") {
      markdown = res.data;
    } else if (res.data && typeof res.data === "object" && "markdown" in res.data) {
      markdown = (res.data as { markdown: string }).markdown;
    } else {
      markdown = JSON.stringify(res.data);
    }
  } catch (e: unknown) {
    throw wrapAxiosError(e, `LlamaParse markdown fetch failed for job ${jobId}`);
  }

  const pageCount = (markdown.match(PAGE_SEPARATOR_REGEX) ?? []).length;
  console.log(
    `[llamaParse] job ${jobId} done: ${markdown.length} chars, ${pageCount} pages`,
  );

  return { markdown, pageCount };
};

// ---------- helpers ----------

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const wrapAxiosError = (e: unknown, prefix: string): Error => {
  if (e instanceof AxiosError) {
    const status = e.response?.status;
    const body = e.response?.data;
    const bodyText =
      typeof body === "string"
        ? body.slice(0, 300)
        : body
          ? JSON.stringify(body).slice(0, 300)
          : "";
    return new Error(`${prefix} — HTTP ${status ?? "?"}: ${bodyText || e.message}`);
  }
  if (e instanceof Error) return new Error(`${prefix} — ${e.message}`);
  return new Error(`${prefix} — ${String(e)}`);
};
