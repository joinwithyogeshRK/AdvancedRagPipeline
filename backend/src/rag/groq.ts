import "dotenv/config";
import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export const askGroq = async (
  question: string,
  relevantChunks: string[],
  conversationHistory: { role: "user" | "assistant"; content: string }[] = [],
): Promise<string> => {
  const hasPDF = relevantChunks.length > 0;

  const context = hasPDF
    ? relevantChunks.map((chunk, i) => `Chunk ${i + 1}:\n${chunk}`).join("\n\n")
    : null;

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: hasPDF
          ? `You are a helpful assistant that answers questions 
based ONLY on the provided context from a PDF document.
If the answer is not in the context, say "I could not find 
the answer in the provided document."
Be concise and accurate.`
          : `You are a helpful assistant. 
Answer the user's question using your general knowledge.
Be concise and accurate.`,
      },
      // Previous messages for conversation memory
      ...conversationHistory,
      {
        role: "user",
        content: hasPDF
          ? `Context:\n${context}\n\nQuestion: ${question}`
          : question,
      },
    ],
  });

  const answer = response.choices[0]?.message.content ?? "No answer generated";
  console.log("✅ Groq answered", response.choices[0]?.message);
  return answer;
};
