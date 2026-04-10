import "dotenv/config";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export const askGroq = async (
  question: string,
  relevantChunks: string[],
  conversationHistory: { role: "user" | "assistant"; content: string }[] = [],
): Promise<string> => {
  const hasPDF = relevantChunks.length > 0;
  const hasHistory = conversationHistory.length > 0;

  const context = hasPDF
    ? relevantChunks.map((chunk, i) => `Chunk ${i + 1}:\n${chunk}`).join("\n\n")
    : null;

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `You are a helpful conversational assistant called Oracle.

${
  hasPDF
    ? `You have access to relevant document context to help answer questions.
Use the document context when the question is about the document.
If the question is conversational or a follow-up (like "explain more", "i don't understand", "what do you mean", "tell me more"), 
answer naturally based on the conversation history — do NOT say you cannot find it in the document.`
    : `Answer the user's question using your general knowledge and the conversation history.`
}

Always be helpful, friendly, and conversational.
If the user seems confused, explain your previous answer more simply.
Never ask the user to rephrase unless absolutely necessary.`,
      },
      // Full conversation history for memory
      ...conversationHistory,
      {
        role: "user",
        content: hasPDF
          ? `Document context:\n${context}\n\nQuestion: ${question}`
          : question,
      },
    ],
  });

  const answer = response.choices[0]?.message.content ?? "No answer generated";
  console.log("✅ Groq answered", response.choices[0]?.message);
  return answer;
};
