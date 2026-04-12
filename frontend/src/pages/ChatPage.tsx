import { useState, useRef, useEffect } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { Background } from "../components/Background";
import { Header } from "../components/Header";
import { Sidebar } from "../components/Sidebar";
import { MessageList } from "../components/MessageList";
import { InputBar } from "../components/InputBar";

const API = "http://localhost:3009";

const getOrCreateUserId = () => {
  let id = localStorage.getItem("oracle_user_id");
  if (!id) { id = crypto.randomUUID(); localStorage.setItem("oracle_user_id", id); }
  return id;
};
const USER_ID = getOrCreateUserId();

interface HistoryItem { q: string; a: string }
interface Chat { id: string; title: string; created_at: string }

const ChatPage = () => {
  // ── State ──
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [response, setResponse] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [focused, setFocused] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [currentQ, setCurrentQ] = useState("");
  const [chatId, setChatId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // ── Refs ──
  const currentResponseRef = useRef("");
  const streamRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // ── Auto scroll ──
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [response, history, isStreaming]);

  // ── Fetch chats when sidebar opens ──
  useEffect(() => { if (sidebarOpen) fetchChats(); }, [sidebarOpen]);

  // ── API calls ──
  const fetchChats = async () => {
    setLoadingChats(true);
    try {
      const res = await axios.get(`${API}/history/chats/${USER_ID}`);
      setChats(res.data.chats ?? []);
    } catch { setChats([]); }
    finally { setLoadingChats(false); }
  };

  const loadChat = async (selectedChatId: string) => {
    if (isStreaming) stopStreaming();
    setLoadingMessages(true);
    try {
      const res = await axios.get(`${API}/history/messages/${selectedChatId}`);
      setHistory((res.data.messages ?? []).map((m: { query: string; answer: string }) => ({ q: m.query, a: m.answer })));
      setChatId(selectedChatId);
      setFile(null); setFileName(""); setMessage(""); setCharCount(0);
      setSidebarOpen(false);
    } catch {}
    finally { setLoadingMessages(false); }
  };

  const deleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await axios.delete(`${API}/history/chats/${id}`);
      setChats((prev) => prev.filter((c) => c.id !== id));
      if (chatId === id) handleNewChat();
    } catch {}
  };

  // ── Streaming ──
  const stopStreaming = () => {
    if (streamRef.current) clearTimeout(streamRef.current);
    if (currentResponseRef.current && currentQ)
      setHistory((h) => [...h, { q: currentQ, a: currentResponseRef.current + " [stopped]" }]);
    setIsStreaming(false); setResponse(""); currentResponseRef.current = ""; setCurrentQ("");
  };

  const typewriterStream = (text: string, question: string) => {
    setIsStreaming(true); setResponse(""); currentResponseRef.current = ""; setCurrentQ(question);
    let i = 0;
    const type = () => {
      if (i < text.length) {
        const partial = text.slice(0, i + 1);
        setResponse(partial); currentResponseRef.current = partial;
        const delay = text[i] === "\n" ? 18 : text[i] === "." ? 22 : 4;
        i++; streamRef.current = setTimeout(type, delay);
      } else {
        setIsStreaming(false);
        setHistory((h) => [...h, { q: question, a: text }]);
        setResponse(""); currentResponseRef.current = ""; setCurrentQ("");
      }
    };
    type();
  };

  // ── Handlers ──
  const handleNewChat = () => {
    if (isStreaming) stopStreaming();
    setChatId(null); setHistory([]); setMessage(""); setCharCount(0);
    setFile(null); setFileName(""); setResponse("");
    currentResponseRef.current = ""; setCurrentQ("");
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type !== "application/pdf") { alert("Only PDF files are allowed"); return; }
    setFile(f); setFileName(f.name);
  };

  const handleSend = async () => {
    if (!message.trim() || isStreaming) return;
    const q = message.trim();
    const fd = new FormData();
    if (file) fd.append("File", file);
    fd.append("query", q);
    fd.append("userId", USER_ID);
    if (chatId) fd.append("chatId", chatId);
    setMessage(""); setCharCount(0); setFile(null); setFileName("");
    setIsStreaming(true);
    try {
      const res = await axios.post(`${API}/query`, fd);
      const text = res.data?.text ?? JSON.stringify(res.data);
      if (res.data?.chatId && !chatId) { setChatId(res.data.chatId); if (sidebarOpen) fetchChats(); }
      typewriterStream(text, q);
    } catch (err: unknown) {
      const errorMsg = axios.isAxiosError(err) ? (err.response?.data?.error ?? "Something went wrong. Please try again.") : "Something went wrong. Please try again.";
      setIsStreaming(false);
      typewriterStream(errorMsg, q);
    }
  };

  return (
    <div style={s.root}>
      <Background />

      <Sidebar
        open={sidebarOpen}
        chats={chats}
        activeChatId={chatId}
        loading={loadingChats}
        onClose={() => setSidebarOpen(false)}
        onNewChat={handleNewChat}
        onSelectChat={loadChat}
        onDeleteChat={deleteChat}
      />

      <div style={s.shell}>
        <Header
          chatId={chatId}
          file={file}
          fileName={fileName}
          onRemoveFile={() => { setFile(null); setFileName(""); }}
          onNewChat={handleNewChat}
          onOpenSidebar={() => setSidebarOpen(true)}
        />

        <AnimatePresence>
          {loadingMessages && (
            <motion.div style={s.loadingBar} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div style={s.loadingBarFill} animate={{ x: ["-100%", "100%"] }} transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }} />
            </motion.div>
          )}
        </AnimatePresence>

        <MessageList
          history={history}
          isStreaming={isStreaming}
          response={response}
          currentQ={currentQ}
          scrollRef={scrollRef}
        />

        <InputBar
          message={message}
          file={file}
          fileName={fileName}
          charCount={charCount}
          chatId={chatId}
          isStreaming={isStreaming}
          focused={focused}
          inputRef={inputRef}
          historyLength={history.length}
          onChange={(val) => { setMessage(val); setCharCount(val.length); }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSend={handleSend}
          onStop={stopStreaming}
          onFileChange={handleFileChange}
          onRemoveFile={() => { setFile(null); setFileName(""); }}
        />
      </div>
    </div>
  );
};

const s: Record<string, React.CSSProperties> = {
  root: { width: "100vw", height: "100vh", background: "#08080a", overflow: "hidden", fontFamily: "'DM Mono','Fira Mono','Courier New',monospace", color: "#e2e2ec", position: "relative", display: "flex" },
  shell: { position: "relative", zIndex: 1, display: "flex", flexDirection: "column", width: "100%", height: "100%", maxWidth: "900px", margin: "0 auto", padding: "24px 20px 20px", boxSizing: "border-box" },
  loadingBar: { height: "2px", background: "#1a1a24", overflow: "hidden", flexShrink: 0, position: "relative" },
  loadingBarFill: { position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent, #c9a84c, transparent)", width: "40%" },
};

export default ChatPage;