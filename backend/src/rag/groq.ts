import "dotenv/config";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export const askGroq = async (
  question: string,
  relevantChunks: string[],
  conversationHistory: { role: "user" | "assistant"; content: string }[] = [],
): Promise<string> => {
  const hasChunks = relevantChunks.length > 0;

  const context = hasChunks
    ? relevantChunks.map((chunk, i) => `Chunk ${i + 1}:\n${chunk}`).join("\n\n")
    : "";

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `
You are a strict RAG assistant.

RULES:
1. You MUST answer ONLY using the provided document context.
2. DO NOT use any external knowledge.
3. If the answer is not clearly present in the context, respond EXACTLY with:
   "I don’t know anything about this."
4. Do NOT guess, infer, or assume anything outside the context.
5. Keep answers concise and accurate.
`,
      },

      // optional history (keep if you want follow-ups but still grounded)
      ...conversationHistory,

      {
        role: "user",
        content: `
Document Context:
${context}

Question:
${question}
`,
      },
    ],
  });

  const answer =
    response.choices[0]?.message.content?.trim() ||
    "I don’t know anything about this.";

  console.log("✅ Groq answered:", answer);

  return answer;
};
