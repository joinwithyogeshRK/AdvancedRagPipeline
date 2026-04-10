import type { Request, Response } from "express";
import PDFParser from "pdf2json";
import { chunkText } from "../rag/chunker.js";
import { embedChunks, embedQuery } from "../rag/embedder.js";
import { storeInPinecone, searchPinecone } from "../rag/pinecone.js";
import { askGroq } from "../rag/groq.js";
import {
  upsertUser,
  createChat,
  saveMessage,
  getChatMessages,
} from "../services/historyService.js";

const pdf = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const query = req.body.query;
    const userId = req.body.userId;
    let chatId = req.body.chatId;

    if (!query) {
      return res.status(400).json({ error: "No query provided." });
    }

    // If a PDF is uploaded — run full RAG pipeline
    if (file && file.buffer) {
      const pdfParser = new PDFParser();
      const text = await new Promise<string>((resolve, reject) => {
        pdfParser.on("pdfParser_dataReady", (data) => {
          const rawText = data.Pages.map((page: any) =>
            page.Texts.map((t: any) =>
              decodeURIComponent(t.R.map((r: any) => r.T).join("")),
            ).join(" "),
          ).join("\n");
          resolve(rawText);
        });
        pdfParser.on("pdfParser_dataError", reject);
        pdfParser.parseBuffer(file.buffer);
      });
      console.log("✅ Step 1 — PDF parsed");

      const chunks = await chunkText(text);
      console.log(`✅ Step 2 — ${chunks.length} chunks created`);

      const embeddedChunks = await embedChunks(chunks);
      console.log("✅ Step 3 — Chunks embedded");

      await storeInPinecone(embeddedChunks);
      console.log("✅ Step 4 — Stored in Pinecone");
    }

    // Always embed query and search Pinecone
    const queryVector = await embedQuery(query);

    console.log("✅ Step 5 — Query embedded");

  const relevantChunks = await searchPinecone(queryVector);
    console.log(`✅ Step 6 — ${relevantChunks.length} relevant chunks found`);

    if (relevantChunks.length === 0) {
      console.log(
        "⚠️  No chunks found — falling back to Groq general knowledge",
      );
    }

    // Fetch conversation history from Supabase if chatId exists
    let conversationHistory: { role: "user" | "assistant"; content: string }[] =
      [];
    if (chatId) {
      const previousMessages = await getChatMessages(chatId);
      conversationHistory = previousMessages.flatMap((m: any) => [
        { role: "user" as const, content: m.query },
        { role: "assistant" as const, content: m.answer },
      ]);
      console.log(
        `✅ Step 7 — Loaded ${previousMessages.length} previous messages`,
      );
    }

    const answer = await askGroq(query, relevantChunks, conversationHistory);
    console.log("✅ Step 8 — Answer generated");

    if (userId) {
      await upsertUser(userId);
      console.log("✅ Step 9 — User upserted");

      if (!chatId) {
        const newChat = await createChat(userId, query);
        chatId = newChat.id;
        console.log("✅ Step 10 — New chat created:", chatId);
      }

      await saveMessage(chatId, userId, query, answer, !!(file && file.buffer));
      console.log("✅ Step 11 — Message saved to Supabase");
    }

    res.json({ text: answer, chatId: chatId ?? null });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Failed to process request" });
  }
};

export default pdf;
