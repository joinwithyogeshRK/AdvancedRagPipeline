import type { Request, Response } from "express";
import { extractTextFromPDF } from "../services/ocrService.js";
import { chunkText } from "../rag/chunker.js";
import { embedChunks, embedQuery } from "../rag/embedder.js";
import { storeInPinecone } from "../rag/pinecone.js";
import { hybridSearch } from "../rag/hybridSearch.js";
import { rerankChunks } from "../rag/reranker.js";
import type { BM25Chunk } from "../rag/bm25.js";
import { askGroq } from "../rag/groq.js";
import {
  createChat,
  saveMessage,
  getChatMessagesForUser,
} from "../services/historyService.js";

const pdf = async (req: Request, res: Response) => {
  try {
    const file   = req.file;
    const query  = req.body.query;
    const userId = req.supabaseUserId!;
    let   chatId = req.body.chatId;

    if (!query || !query.trim()) {
      return res.status(400).json({ error: "No query provided." });
    }

    let bm25Chunks: BM25Chunk[] = []

    // ── Process PDF if uploaded ─────────────────────────────
    if (file && file.buffer) {
      let text: string;

      try {
        const result = await extractTextFromPDF(file.buffer, file.originalname);
        text = result.text;
        console.log(`✅ Step 1 — Text extracted via ${result.method} (${text.length} chars)`);
      } catch (extractionError: unknown) {
        console.error("PDF extraction failed:", extractionError);
        const msg  = extractionError instanceof Error ? extractionError.message : "";
        const safe = msg && !/_KEY|SECRET|TOKEN|password|environment variable/i.test(msg);
        return res.status(422).json({
          error: safe
            ? msg
            : "We couldn't process this PDF. Try a different file or a smaller PDF.",
        });
      }

      // Step 2 — Chunk
      const chunks = await chunkText(text);
      console.log(`✅ Step 2 — ${chunks.length} chunks created`);

      // Build BM25 chunks with same IDs as Pinecone
      const ts = Date.now()
      bm25Chunks = chunks.map((chunkText, i) => ({
        id:   `${userId}-${ts}-${i}`,
        text: chunkText,
      }))

      // Step 3 — Embed
      const embeddedChunks = await embedChunks(chunks);
      console.log("✅ Step 3 — Chunks embedded");

      // Step 4 — Store
      await storeInPinecone(embeddedChunks, userId, ts);
      console.log("✅ Step 4 — Stored in Pinecone");
    }

    // Step 5 — Embed query
    const queryVector = await embedQuery(query);
    console.log("✅ Step 5 — Query embedded");

    // Step 6 — Hybrid Search → Rerank
    const hybridChunks   = await hybridSearch(queryVector, query, bm25Chunks, userId)
    const reranked       = await rerankChunks(query, hybridChunks.map(c => c.text))
    const relevantChunks = reranked.map(c => c.text)
    console.log(`✅ Step 6 — ${relevantChunks.length} chunks reranked and ready`);

    if (relevantChunks.length === 0) {
      console.log("⚠️  No chunks found — falling back to Groq general knowledge");
    }

    // Step 7 — Conversation history
    let conversationHistory: { role: "user" | "assistant"; content: string }[] = [];
    if (chatId) {
      const previousMessages = await getChatMessagesForUser(chatId, userId);
      if (!previousMessages) {
        return res.status(403).json({ error: "This chat does not belong to your account." });
      }
      conversationHistory = previousMessages.flatMap((m: { query: string; answer: string }) => [
        { role: "user"      as const, content: m.query  },
        { role: "assistant" as const, content: m.answer },
      ]);
      console.log(`✅ Step 7 — Loaded ${previousMessages.length} previous messages`);
    }

    // Step 8 — Ask Groq
    const answer = await askGroq(query, relevantChunks, conversationHistory);
    console.log("✅ Step 8 — Answer generated");

    // Step 9 — Save
    if (!chatId) {
      const newChat = await createChat(userId, query);
      chatId = newChat.id;
      console.log("✅ Step 9 — New chat created:", chatId);
    }

    await saveMessage(chatId, userId, query, answer, !!(file && file.buffer));
    console.log("✅ Step 10 — Message saved to Supabase");

    res.json({ text: answer, chatId: chatId ?? null });

  } catch (error: any) {
    console.error("Unhandled error:", error);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
};

export default pdf;