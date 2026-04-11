import "dotenv/config";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export const askGroq = async (
  question: string,
  relevantChunks: string[],
  conversationHistory: { role: "user" | "assistant"; content: string }[] = [],
): Promise<string> => {
  const hasChunks = relevantChunks.length > 0;
  const hasHistory = conversationHistory.length > 0;

  const context = hasChunks
    ? relevantChunks.map((chunk, i) => `Chunk ${i + 1}:\n${chunk}`).join("\n\n")
    : null;

  console.log(`📦 Chunks received: ${relevantChunks.length}`);
  console.log(`💬 History messages: ${conversationHistory.length}`);
  if (context) console.log(`📄 Context preview: ${context.slice(0, 200)}...`);

  const systemPrompt = hasChunks
    ? `You are a helpful assistant called Oracle.
You have been given document context to answer the user's question.
Use the document context as your primary source of truth.
If the user asks a follow-up or conversational question (like "explain more", "what do you mean", "i don't understand"), 
use the conversation history to give a natural helpful response.
If the answer is genuinely not in the context or history, say "I could not find that in the provided document."
Be concise, clear, and friendly.`
    : `You are a helpful assistant called Oracle.
Answer the user's question using the conversation history and your general knowledge.
Be concise, clear, and friendly.`;

  const userMessage = hasChunks
    ? `Document Context:\n${context}\n\nQuestion: ${question}`
    : question;

  const messages: { role: "system" | "user" | "assistant"; content: string }[] =
    [
      { role: "system", content: systemPrompt },
      ...conversationHistory,
      { role: "user", content: userMessage },
    ];

  console.log(`📨 Sending ${messages.length} messages to Groq`);

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 1024,
    temperature: 0.3, // lower = more factual, less hallucination
    messages,
  });

  const answer =
    response.choices[0]?.message.content?.trim() ||
    "I could not generate an answer. Please try again.";

  console.log("✅ Groq answered:", answer.slice(0, 100));

  return answer;
};
