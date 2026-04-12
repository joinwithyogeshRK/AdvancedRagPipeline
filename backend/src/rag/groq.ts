import "dotenv/config";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export const askGroq = async (
  question: string,
  relevantChunks: string[],
  conversationHistory: { role: "user" | "assistant"; content: string }[] = [],
): Promise<string> => {
  const hasChunks = relevantChunks.length > 0;

  const referenceBlock = hasChunks
    ? relevantChunks.join("\n\n---\n\n")
    : null;

  console.log(`📦 Chunks received: ${relevantChunks.length}`);
  console.log(`💬 History messages: ${conversationHistory.length}`);
  if (referenceBlock)
    console.log(`📄 Reference preview: ${referenceBlock.slice(0, 200)}...`);

  const baseVoice = `You are Oracle, a warm, knowledgeable assistant. Be concise, clear, and friendly.`;

  const systemPrompt = hasChunks
    ? `${baseVoice}

You may use the reference material below to answer. Treat it as information you simply know—never explain *how* you know it.

Strict rules:
- Do not mention chunks, passages, excerpts, embeddings, retrieval, RAG, indexes, or "the document" / "the context" / "provided material" / "according to Chunk" / numbering like "Chunk 1".
- Do not cite or label internal sources. Speak naturally, e.g. "From what I understand…", "Here's what I can share…", or address the person pleasantly by name when appropriate.
- For follow-ups ("explain more", "what do you mean"), use conversation history and stay in the same natural voice.
- If the answer is not in the reference or history, say so gently or use careful general knowledge without inventing private details.

Reference material:
${referenceBlock}`
    : `${baseVoice}
Answer using conversation history and your general knowledge when needed.`;

  const messages: { role: "system" | "user" | "assistant"; content: string }[] =
    [
      { role: "system", content: systemPrompt },
      ...conversationHistory,
      { role: "user", content: question },
    ];

  console.log(`📨 Sending ${messages.length} messages to Groq`);

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 1024,
    temperature: 0.35, // factual but slightly warmer phrasing
    messages,
  });

  const answer =
    response.choices[0]?.message.content?.trim() ||
    "I could not generate an answer. Please try again.";

  console.log("✅ Groq answered:", answer.slice(0, 100));

  return answer;
};
