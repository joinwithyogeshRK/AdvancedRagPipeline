import { Router } from "express";
import {
  getUserChats,
  getChatMessages,
  deleteChat,
} from "../services/historyService.js";

const router = Router();

router.get("/chats/:userId", async (req, res) => {
  try {
    const chats = await getUserChats(req.params.userId);
    res.json({ chats });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch chats" });
  }
});

router.get("/messages/:chatId", async (req, res) => {
  try {
    const messages = await getChatMessages(req.params.chatId);
    res.json({ messages });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

router.delete("/chats/:chatId", async (req, res) => {
  try {
    await deleteChat(req.params.chatId);
    res.json({ message: "Chat deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete chat" });
  }
});

export default router;
