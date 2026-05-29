// AWS Bedrock client for Anthropic Claude models (Messages API).
//
// Used by the civil-code answer path where verbatim clause citations matter
// more than raw throughput. Default model: Claude Haiku 4.5
// (anthropic.claude-haiku-4-5-20251001-v1:0) — cheap, fast, and accurate
// enough for IS-code QA.
//
// Auth: the AWS SDK reads credentials from the standard chain — env vars
// (AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY), shared credentials file
// (~/.aws/credentials), or IAM role. We only set the region explicitly.
//
// IMPORTANT: the chosen model must be ENABLED in the AWS account for the
// chosen region. Do this once via the Bedrock console → "Model access".
// If the model id requires an inference profile (most Claude models from
// 3.5 onward do), set AWS_BEDROCK_MODEL_ID to the profile id, e.g.
// "us.anthropic.claude-haiku-4-5-20251001-v1:0".

import "dotenv/config";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

const REGION =
  process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";
const MODEL_ID =
  process.env.AWS_BEDROCK_MODEL_ID ??
  "us.anthropic.claude-haiku-4-5-20251001-v1:0";

// Single client per process. Bedrock keepalive is handled internally.
const client = new BedrockRuntimeClient({ region: REGION });

export type BedrockMessage = { role: "user" | "assistant"; content: string };

export type BedrockOptions = {
  temperature?: number;
  maxTokens?: number;
};

// Bedrock Claude wire format (Messages API on Bedrock).
type BedrockResponse = {
  id: string;
  type: "message";
  role: "assistant";
  model: string;
  content: Array<{ type: "text"; text: string }>;
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
};

export const askBedrock = async (
  systemPrompt: string,
  messages: BedrockMessage[],
  opts: BedrockOptions = {},
): Promise<string> => {
  // Bedrock Claude requires messages to start with role="user" and alternate.
  // Coalesce / fix common patterns to avoid 400s.
  const normalized = normalizeMessages(messages);

  const body = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? 0.15,
    system: systemPrompt,
    messages: normalized,
  };

  console.log(
    `[bedrock] invoking ${MODEL_ID} (region=${REGION}, msgs=${normalized.length}, temp=${body.temperature})`,
  );

  const cmd = new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: new TextEncoder().encode(JSON.stringify(body)),
  });

  const res = await client.send(cmd);
  if (!res.body) {
    throw new Error("Bedrock returned an empty body");
  }
  const decoded = new TextDecoder().decode(res.body);
  let parsed: BedrockResponse;
  try {
    parsed = JSON.parse(decoded) as BedrockResponse;
  } catch (e: unknown) {
    throw new Error(
      `Bedrock returned non-JSON body: ${decoded.slice(0, 200)}`,
    );
  }

  const text = parsed.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("");

  console.log(
    `[bedrock] ok (in=${parsed.usage.input_tokens}, out=${parsed.usage.output_tokens}, stop=${parsed.stop_reason})`,
  );
  return text.trim();
};

// ---------- internals ----------

const normalizeMessages = (messages: BedrockMessage[]): BedrockMessage[] => {
  if (messages.length === 0) {
    // Bedrock requires at least one user message. Return a minimal one.
    return [{ role: "user", content: "(empty query)" }];
  }
  // Coalesce consecutive same-role messages by joining their content with
  // a double newline. This handles cases where conversation history
  // accidentally produces two user turns in a row.
  const out: BedrockMessage[] = [];
  for (const m of messages) {
    const prev = out[out.length - 1];
    if (prev && prev.role === m.role) {
      prev.content = `${prev.content}\n\n${m.content}`;
    } else {
      out.push({ ...m });
    }
  }
  // Bedrock Claude requires the first message to be from the user. If somehow
  // the first is assistant, prepend a placeholder user turn.
  if (out[0]?.role !== "user") {
    out.unshift({ role: "user", content: "(continuing)" });
  }
  return out;
};
