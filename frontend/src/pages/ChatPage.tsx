import { useState, useRef, useEffect } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";

const getOrCreateUserId = () => {
  let id = localStorage.getItem("oracle_user_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("oracle_user_id", id);
  }
  return id;
};

const USER_ID = getOrCreateUserId();

interface HistoryItem {
  q: string;
  a: string;
}
interface Chat {
  id: string;
  title: string;
  created_at: string;
}

const ChatPage = () => {
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
  const currentResponseRef = useRef("");
  const streamRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [response, history, isStreaming]);

  // Fetch all chats when sidebar opens
  useEffect(() => {
    if (sidebarOpen) fetchChats();
  }, [sidebarOpen]);

  const fetchChats = async () => {
    setLoadingChats(true);
    try {
      const res = await axios.get(
        `http://localhost:3009/history/chats/${USER_ID}`,
      );
      setChats(res.data.chats ?? []);
    } catch {
      setChats([]);
    } finally {
      setLoadingChats(false);
    }
  };

  // Load a previous chat's messages
  const loadChat = async (selectedChatId: string, title: string) => {
    if (isStreaming) stopStreaming();
    setLoadingMessages(true);
    try {
      const res = await axios.get(
        `http://localhost:3009/history/messages/${selectedChatId}`,
      );
      const messages = res.data.messages ?? [];
      const loaded: HistoryItem[] = messages.map((m: any) => ({
        q: m.query,
        a: m.answer,
      }));
      setHistory(loaded);
      setChatId(selectedChatId);
      setFile(null);
      setFileName("");
      setMessage("");
      setCharCount(0);
      setSidebarOpen(false);
    } catch {
      // fail silently
    } finally {
      setLoadingMessages(false);
    }
  };

  const deleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await axios.delete(`http://localhost:3009/history/chats/${id}`);
      setChats((prev) => prev.filter((c) => c.id !== id));
      if (chatId === id) handleNewChat();
    } catch {}
  };

  const stopStreaming = () => {
    if (streamRef.current) clearTimeout(streamRef.current);
    const partial = currentResponseRef.current;
    if (partial && currentQ) {
      setHistory((h) => [...h, { q: currentQ, a: partial + " [stopped]" }]);
    }
    setIsStreaming(false);
    setResponse("");
    currentResponseRef.current = "";
    setCurrentQ("");
  };

  const typewriterStream = (text: string, question: string) => {
    setIsStreaming(true);
    setResponse("");
    currentResponseRef.current = "";
    setCurrentQ(question);
    let i = 0;
    const type = () => {
      if (i < text.length) {
        const partial = text.slice(0, i + 1);
        setResponse(partial);
        currentResponseRef.current = partial;
        const delay = text[i] === "\n" ? 18 : text[i] === "." ? 22 : 4;
        i++;
        streamRef.current = setTimeout(type, delay);
      } else {
        setIsStreaming(false);
        setHistory((h) => [...h, { q: question, a: text }]);
        setResponse("");
        currentResponseRef.current = "";
        setCurrentQ("");
      }
    };
    type();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type !== "application/pdf") {
      alert("Only PDF files are allowed");
      return;
    }
    setFile(f);
    setFileName(f.name);
  };

  const removeFile = () => {
    setFile(null);
    setFileName("");
  };

  const handleNewChat = () => {
    if (isStreaming) stopStreaming();
    setChatId(null);
    setHistory([]);
    setMessage("");
    setCharCount(0);
    setFile(null);
    setFileName("");
    setResponse("");
    currentResponseRef.current = "";
    setCurrentQ("");
    setTimeout(() => inputRef.current?.focus(), 100);
  };

 const handleSend = async () => {
   if (!message.trim() || isStreaming) return;
   const q = message.trim();
   const fd = new FormData();
   if (file) fd.append("File", file);
   fd.append("query", q);
   fd.append("userId", USER_ID);
   if (chatId) fd.append("chatId", chatId);
   setMessage("");
   setCharCount(0);
   setIsStreaming(true);
   try {
     const res = await axios.post("http://localhost:3009/query", fd);
     const text = res.data?.text ?? JSON.stringify(res.data);
     if (res.data?.chatId && !chatId) {
       setChatId(res.data.chatId);
       if (sidebarOpen) fetchChats();
     }
     typewriterStream(text, q);
   } catch (err: any) {
     const errorMsg =
       err.response?.data?.error ?? "Something went wrong. Please try again.";
     setIsStreaming(false);
     typewriterStream(errorMsg, q);
   }
 };

  const isEmpty = history.length === 0 && !isStreaming && !response;

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div style={s.root}>
      <div style={s.grain} />
      <div style={s.orbA} />
      <div style={s.orbB} />
      <div style={s.orbC} />
      <svg
        style={s.gridSvg}
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="grid"
            width="52"
            height="52"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 52 0 L 0 0 0 52"
              fill="none"
              stroke="#c9a84c"
              strokeWidth="0.3"
              strokeOpacity="0.07"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* ── Sidebar Overlay ── */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              style={s.sidebarOverlay}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
            />
            <motion.div
              style={s.sidebar}
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
            >
              {/* Sidebar Header */}
              <div style={s.sidebarHeader}>
                <span style={s.sidebarTitle}>CHAT HISTORY</span>
                <button
                  onClick={() => setSidebarOpen(false)}
                  style={s.sidebarClose}
                >
                  ✕
                </button>
              </div>

              {/* New Chat Button */}
              <button
                onClick={() => {
                  handleNewChat();
                  setSidebarOpen(false);
                }}
                style={s.sidebarNewBtn}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                NEW CHAT
              </button>

              <div style={s.sidebarDivider} />

              {/* Chat List */}
              <div style={s.sidebarList}>
                {loadingChats ? (
                  <div style={s.sidebarLoading}>
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        style={s.sidebarSkeleton}
                        animate={{ opacity: [0.3, 0.7, 0.3] }}
                        transition={{
                          duration: 1.2,
                          repeat: Infinity,
                          delay: i * 0.2,
                        }}
                      />
                    ))}
                  </div>
                ) : chats.length === 0 ? (
                  <div style={s.sidebarEmpty}>No previous chats</div>
                ) : (
                  chats.map((chat) => (
                    <motion.div
                      key={chat.id}
                      style={{
                        ...s.sidebarItem,
                        ...(chatId === chat.id ? s.sidebarItemActive : {}),
                      }}
                      onClick={() => loadChat(chat.id, chat.title)}
                      whileHover={{ background: "#16161f" }}
                    >
                      <div style={s.sidebarItemInner}>
                        <div style={s.sidebarItemIcon}>
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                          >
                            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                          </svg>
                        </div>
                        <div style={s.sidebarItemContent}>
                          <span style={s.sidebarItemTitle}>{chat.title}</span>
                          <span style={s.sidebarItemDate}>
                            {formatDate(chat.created_at)}
                          </span>
                        </div>
                        <button
                          onClick={(e) => deleteChat(chat.id, e)}
                          style={s.sidebarItemDelete}
                          title="Delete"
                        >
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                          >
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14H6L5 6" />
                            <path d="M10 11v6M14 11v6" />
                            <path d="M9 6V4h6v2" />
                          </svg>
                        </button>
                      </div>
                      {chatId === chat.id && (
                        <div style={s.sidebarItemActiveBar} />
                      )}
                    </motion.div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div style={s.shell}>
        {/* ── Header ── */}
        <motion.header
          style={s.header}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            {/* Sidebar toggle */}
            <motion.button
              onClick={() => setSidebarOpen(true)}
              style={s.sidebarToggle}
              whileHover={{ borderColor: "#c9a84c99", color: "#c9a84c" }}
              whileTap={{ scale: 0.95 }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </motion.button>

            <div style={s.brand}>
              <div style={s.brandIcon}>
                <motion.div
                  style={s.brandRing}
                  animate={{ rotate: 360 }}
                  transition={{
                    duration: 12,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                />
                <div style={s.brandCore} />
              </div>
              <div>
                <div style={s.brandName}>ORACLE</div>
                <div style={s.brandSub}>RAG Intelligence Engine</div>
              </div>
            </div>
          </div>

          <div style={s.headerRight}>
            {chatId && (
              <motion.div
                style={s.chatIdPill}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <span style={s.chatIdText}>#{chatId.slice(0, 8)}</span>
              </motion.div>
            )}
            {file && (
              <motion.div
                style={s.headerFilePill}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#c9a84c"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span style={s.headerFileText}>{fileName}</span>
                <button onClick={removeFile} style={s.headerFileX}>
                  ✕
                </button>
              </motion.div>
            )}
            <motion.button
              onClick={handleNewChat}
              style={s.newChatBtn}
              whileHover={{ borderColor: "#c9a84c99", color: "#c9a84c" }}
              whileTap={{ scale: 0.95 }}
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              NEW CHAT
            </motion.button>
            <div style={s.livePill}>
              <motion.span
                style={s.liveDot}
                animate={{ opacity: [1, 0.3, 1], scale: [1, 0.8, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <span style={s.liveLabel}>LIVE</span>
            </div>
          </div>
        </motion.header>

        {/* ── Loading messages indicator ── */}
        <AnimatePresence>
          {loadingMessages && (
            <motion.div
              style={s.loadingBar}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                style={s.loadingBarFill}
                animate={{ x: ["-100%", "100%"] }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Conversation Body ── */}
        <div style={s.body} ref={scrollRef}>
          <AnimatePresence>
            {isEmpty && (
              <motion.div
                style={s.emptyState}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.6 }}
              >
                <div style={s.emptyOrb}>
                  <motion.div
                    style={s.emptyOrbRing}
                    animate={{ rotate: 360 }}
                    transition={{
                      duration: 10,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                  />
                  <motion.div
                    style={s.emptyOrbRing2}
                    animate={{ rotate: -360 }}
                    transition={{
                      duration: 15,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                  />
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#c9a84c"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </div>
                <div style={s.emptyTitle}>Begin your inquiry</div>
                <div style={s.emptyDesc}>
                  Ask any question directly, or attach a PDF for
                  <br />
                  document-aware retrieval and precise answers.
                </div>
                <div style={s.emptyTags}>
                  {[
                    "Document Analysis",
                    "Semantic Search",
                    "RAG Pipeline",
                    "Knowledge Retrieval",
                  ].map((t) => (
                    <span key={t} style={s.emptyTag}>
                      {t}
                    </span>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {history.map((item, i) => (
            <motion.div
              key={i}
              style={s.turn}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              <div style={s.questionRow}>
                <div style={s.questionBubble}>
                  <span style={s.questionLabel}>YOU</span>
                  <p style={s.questionText}>{item.q}</p>
                </div>
              </div>
              <div style={s.answerRow}>
                <div style={s.answerAvatar}>
                  <div style={s.avatarInner}>O</div>
                </div>
                <div style={s.answerCard}>
                  <div style={s.answerBar} />
                  <span style={s.answerLabel}>ORACLE</span>
                  <p style={s.answerText}>{item.a}</p>
                </div>
              </div>
            </motion.div>
          ))}

          <AnimatePresence>
            {isStreaming && (
              <motion.div
                style={s.turn}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                {currentQ && (
                  <div style={s.questionRow}>
                    <div style={s.questionBubble}>
                      <span style={s.questionLabel}>YOU</span>
                      <p style={s.questionText}>{currentQ}</p>
                    </div>
                  </div>
                )}
                <div style={s.answerRow}>
                  <div style={s.answerAvatar}>
                    <motion.div
                      style={s.avatarInner}
                      animate={{
                        boxShadow: [
                          "0 0 0px #c9a84c00",
                          "0 0 16px #c9a84c88",
                          "0 0 0px #c9a84c00",
                        ],
                      }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      O
                    </motion.div>
                  </div>
                  <div style={s.answerCard}>
                    <div style={s.answerBar} />
                    <div style={s.answerHeaderRow}>
                      <span style={s.answerLabel}>ORACLE</span>
                      <div style={s.generatingBadge}>
                        <motion.span
                          style={s.genDot}
                          animate={{ opacity: [1, 0.2, 1] }}
                          transition={{ duration: 0.9, repeat: Infinity }}
                        />
                        <span style={s.genLabel}>GENERATING</span>
                      </div>
                    </div>
                    {response === "" ? (
                      <div style={s.thinkRow}>
                        {[0, 1, 2].map((i) => (
                          <motion.span
                            key={i}
                            style={s.thinkDot}
                            animate={{ y: [0, -7, 0], opacity: [0.3, 1, 0.3] }}
                            transition={{
                              duration: 0.85,
                              repeat: Infinity,
                              delay: i * 0.16,
                              ease: "easeInOut",
                            }}
                          />
                        ))}
                      </div>
                    ) : (
                      <p style={s.answerText}>
                        {response}
                        <motion.span
                          style={s.cursor}
                          animate={{ opacity: [1, 0] }}
                          transition={{ duration: 0.5, repeat: Infinity }}
                        />
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Input Bar ── */}
        <motion.div
          style={s.inputSection}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <div style={s.statsRow}>
            <span style={s.stat}>
              <span style={{ color: "#c9a84c" }}>{history.length}</span>{" "}
              exchanges
            </span>
            <span style={s.statDivider}>·</span>
            <span style={s.stat}>
              <span style={{ color: file ? "#4ade80" : "#6b6b78" }}>
                {file ? "PDF attached" : "No document"}
              </span>
            </span>
            <span style={s.statDivider}>·</span>
            <span style={s.stat}>
              <span style={{ color: charCount > 200 ? "#f87171" : "#6b6b78" }}>
                {charCount}
              </span>{" "}
              chars
            </span>
            <span style={s.statDivider}>·</span>
            <span style={s.stat}>
              <span style={{ color: chatId ? "#c9a84c" : "#6b6b78" }}>
                {chatId ? "Chat active" : "New session"}
              </span>
            </span>
          </div>

          <motion.div
            style={{
              ...s.inputWrap,
              boxShadow: focused
                ? "0 0 0 1.5px #c9a84c66, 0 8px 48px #c9a84c14, inset 0 1px 0 #c9a84c11"
                : "0 0 0 1px #222230, 0 4px 24px #00000070, inset 0 1px 0 #ffffff06",
            }}
            transition={{ duration: 0.2 }}
          >
            <AnimatePresence mode="wait">
              {!file ? (
                <motion.label
                  key="attach"
                  style={s.attachBtn}
                  whileHover={{
                    borderColor: "#c9a84c99",
                    color: "#c9a84c",
                    background: "#c9a84c0a",
                  }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                  </svg>
                  PDF
                  <input
                    type="file"
                    accept="application/pdf"
                    style={{ display: "none" }}
                    onChange={handleFileChange}
                  />
                </motion.label>
              ) : (
                <motion.div
                  key="chip"
                  style={s.fileChip}
                  initial={{ opacity: 0, scale: 0.88 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#4ade80"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  >
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span style={s.chipName}>{fileName}</span>
                  <button onClick={removeFile} style={s.chipX}>
                    ✕
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <div style={s.sep} />

            <input
              ref={inputRef}
              style={s.input}
              type="text"
              placeholder="Ask anything… (attach a PDF for document Q&A)"
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                setCharCount(e.target.value.length);
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) =>
                e.key === "Enter" && !isStreaming && handleSend()
              }
            />

            <AnimatePresence mode="wait">
              {isStreaming ? (
                <motion.button
                  key="stop"
                  onClick={stopStreaming}
                  style={s.stopBtn}
                  whileHover={{ scale: 1.08, background: "#c9a84c22" }}
                  whileTap={{ scale: 0.92 }}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                >
                  <span style={s.stopSq} />
                </motion.button>
              ) : (
                <motion.button
                  key="send"
                  onClick={handleSend}
                  disabled={!message.trim()}
                  style={{
                    ...s.sendBtn,
                    ...(!message.trim() ? s.sendOff : {}),
                  }}
                  whileHover={message.trim() ? { scale: 1.07 } : {}}
                  whileTap={message.trim() ? { scale: 0.91 } : {}}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>

          <div style={s.footer}>
            <span style={s.footerText}>
              <kbd style={s.kbd}>Enter</kbd> to send &nbsp;·&nbsp; PDF optional
              &nbsp;·&nbsp; Powered by RAG + Voyage + Groq
            </span>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   STYLES
───────────────────────────────────────────── */
const s: Record<string, React.CSSProperties> = {
  root: {
    width: "100vw",
    height: "100vh",
    background: "#08080a",
    overflow: "hidden",
    fontFamily: "'DM Mono','Fira Mono','Courier New',monospace",
    color: "#e2e2ec",
    position: "relative",
    display: "flex",
  },
  grain: {
    position: "absolute",
    inset: 0,
    zIndex: 0,
    opacity: 0.045,
    pointerEvents: "none",
    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
    backgroundSize: "200px",
  },
  orbA: {
    position: "absolute",
    top: "-220px",
    left: "-160px",
    width: "600px",
    height: "600px",
    borderRadius: "50%",
    background: "radial-gradient(circle, #c9a84c14 0%, transparent 65%)",
    zIndex: 0,
    pointerEvents: "none",
  },
  orbB: {
    position: "absolute",
    bottom: "-250px",
    right: "-200px",
    width: "700px",
    height: "700px",
    borderRadius: "50%",
    background: "radial-gradient(circle, #3a2a6014 0%, transparent 65%)",
    zIndex: 0,
    pointerEvents: "none",
  },
  orbC: {
    position: "absolute",
    top: "40%",
    left: "50%",
    transform: "translateX(-50%)",
    width: "800px",
    height: "300px",
    borderRadius: "50%",
    background: "radial-gradient(ellipse, #c9a84c06 0%, transparent 70%)",
    zIndex: 0,
    pointerEvents: "none",
  },
  gridSvg: { position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none" },

  // ── Sidebar ──
  sidebarOverlay: {
    position: "fixed",
    inset: 0,
    background: "#00000066",
    zIndex: 10,
    backdropFilter: "blur(2px)",
  },
  sidebar: {
    position: "fixed",
    top: 0,
    left: 0,
    bottom: 0,
    width: "300px",
    zIndex: 11,
    background: "#0a0a10",
    borderRight: "1px solid #1e1e2a",
    display: "flex",
    flexDirection: "column",
  },
  sidebarHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "20px 18px 16px",
    borderBottom: "1px solid #1a1a24",
  },
  sidebarTitle: {
    fontSize: "10px",
    letterSpacing: "0.25em",
    color: "#c9a84c",
    fontWeight: 600,
  },
  sidebarClose: {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#4a4a58",
    fontSize: "12px",
    padding: "2px 6px",
  },
  sidebarNewBtn: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    margin: "12px",
    padding: "10px 14px",
    borderRadius: "10px",
    border: "1px dashed #2a2a38",
    background: "transparent",
    color: "#6b6b78",
    fontSize: "10px",
    letterSpacing: "0.15em",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "'DM Mono',monospace",
    transition: "all 0.2s",
  },
  sidebarDivider: { height: "1px", background: "#1a1a24", margin: "0 12px" },
  sidebarList: {
    flex: 1,
    overflowY: "auto",
    padding: "8px 0",
    scrollbarWidth: "thin",
    scrollbarColor: "#222230 transparent",
  },
  sidebarLoading: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "12px",
  },
  sidebarSkeleton: {
    height: "56px",
    borderRadius: "10px",
    background: "#141420",
  },
  sidebarEmpty: {
    fontSize: "12px",
    color: "#3a3a48",
    textAlign: "center",
    padding: "32px 16px",
  },
  sidebarItem: {
    position: "relative",
    cursor: "pointer",
    borderRadius: "10px",
    margin: "2px 8px",
    padding: "10px 12px",
    transition: "background 0.15s",
  },
  sidebarItemActive: { background: "#141420" },
  sidebarItemActiveBar: {
    position: "absolute",
    left: 0,
    top: "20%",
    bottom: "20%",
    width: "2px",
    borderRadius: "0 2px 2px 0",
    background: "#c9a84c",
  },
  sidebarItemInner: { display: "flex", alignItems: "center", gap: "10px" },
  sidebarItemIcon: { color: "#3a3a50", flexShrink: 0 },
  sidebarItemContent: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: "3px",
  },
  sidebarItemTitle: {
    fontSize: "12px",
    color: "#b0b0c0",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    fontFamily: "'DM Sans',sans-serif",
  },
  sidebarItemDate: {
    fontSize: "10px",
    color: "#3a3a50",
    letterSpacing: "0.04em",
  },
  sidebarItemDelete: {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#3a3a50",
    padding: "4px",
    borderRadius: "6px",
    flexShrink: 0,
    transition: "color 0.15s",
  },

  // ── Loading bar ──
  loadingBar: {
    height: "2px",
    background: "#1a1a24",
    overflow: "hidden",
    flexShrink: 0,
    position: "relative",
  },
  loadingBarFill: {
    position: "absolute",
    inset: 0,
    background: "linear-gradient(90deg, transparent, #c9a84c, transparent)",
    width: "40%",
  },

  // ── Sidebar toggle ──
  sidebarToggle: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "36px",
    height: "36px",
    borderRadius: "10px",
    border: "1px solid #222230",
    background: "#111118",
    color: "#6b6b78",
    cursor: "pointer",
    flexShrink: 0,
    transition: "all 0.2s",
  },

  shell: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    maxWidth: "900px",
    margin: "0 auto",
    padding: "24px 20px 20px",
    boxSizing: "border-box",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "20px",
    flexShrink: 0,
    padding: "0 4px",
  },
  brand: { display: "flex", alignItems: "center", gap: "14px" },
  brandIcon: {
    width: "42px",
    height: "42px",
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  brandRing: {
    position: "absolute",
    inset: 0,
    borderRadius: "50%",
    border: "1.5px solid transparent",
    borderTopColor: "#c9a84c",
    borderRightColor: "#c9a84c44",
  },
  brandCore: {
    width: "18px",
    height: "18px",
    borderRadius: "50%",
    background: "radial-gradient(circle, #c9a84c 0%, #7a5820 100%)",
    boxShadow: "0 0 12px #c9a84c60",
  },
  brandName: {
    fontSize: "16px",
    fontWeight: 700,
    letterSpacing: "0.3em",
    color: "#c9a84c",
    lineHeight: 1,
  },
  brandSub: {
    fontSize: "9px",
    letterSpacing: "0.15em",
    color: "#6b6b78",
    marginTop: "4px",
    fontWeight: 400,
  },
  headerRight: { display: "flex", alignItems: "center", gap: "10px" },
  chatIdPill: {
    display: "flex",
    alignItems: "center",
    padding: "5px 11px",
    borderRadius: "999px",
    border: "1px solid #c9a84c33",
    background: "#c9a84c0a",
  },
  chatIdText: { fontSize: "10px", color: "#c9a84c88", letterSpacing: "0.1em" },
  newChatBtn: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "6px 14px",
    borderRadius: "999px",
    border: "1px solid #222230",
    background: "#111118",
    color: "#6b6b78",
    fontSize: "9px",
    letterSpacing: "0.15em",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "'DM Mono',monospace",
    transition: "all 0.2s",
  },
  headerFilePill: {
    display: "flex",
    alignItems: "center",
    gap: "7px",
    padding: "5px 11px",
    borderRadius: "999px",
    border: "1px solid #4ade8033",
    background: "#4ade800d",
  },
  headerFileText: {
    fontSize: "10px",
    color: "#4ade80",
    maxWidth: "100px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  headerFileX: {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#6b6b78",
    fontSize: "10px",
    padding: 0,
    lineHeight: 1,
  },
  livePill: {
    display: "flex",
    alignItems: "center",
    gap: "7px",
    padding: "6px 14px",
    borderRadius: "999px",
    border: "1px solid #222230",
    background: "#111118",
  },
  liveDot: {
    display: "inline-block",
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    background: "#4ade80",
    boxShadow: "0 0 8px #4ade8088",
  },
  liveLabel: {
    fontSize: "9px",
    letterSpacing: "0.2em",
    color: "#6b6b78",
    fontWeight: 600,
  },
  body: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    overflowX: "hidden",
    padding: "8px 4px 16px",
    scrollbarWidth: "thin",
    scrollbarColor: "#222230 transparent",
    display: "flex",
    flexDirection: "column",
    gap: "32px",
  },
  emptyState: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "60px 20px",
    gap: "20px",
    textAlign: "center",
  },
  emptyOrb: {
    width: "80px",
    height: "80px",
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyOrbRing: {
    position: "absolute",
    inset: 0,
    borderRadius: "50%",
    border: "1.5px solid transparent",
    borderTopColor: "#c9a84c66",
    borderRightColor: "#c9a84c22",
  },
  emptyOrbRing2: {
    position: "absolute",
    inset: "8px",
    borderRadius: "50%",
    border: "1px solid transparent",
    borderBottomColor: "#c9a84c44",
    borderLeftColor: "#c9a84c11",
  },
  emptyTitle: {
    fontSize: "20px",
    fontWeight: 600,
    letterSpacing: "0.05em",
    color: "#c8c8d8",
    fontFamily: "'DM Sans','Segoe UI',sans-serif",
  },
  emptyDesc: {
    fontSize: "13px",
    color: "#4a4a5a",
    lineHeight: "1.8",
    fontFamily: "'DM Sans','Segoe UI',sans-serif",
    maxWidth: "360px",
  },
  emptyTags: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    justifyContent: "center",
    marginTop: "8px",
  },
  emptyTag: {
    fontSize: "10px",
    letterSpacing: "0.12em",
    padding: "5px 12px",
    borderRadius: "999px",
    border: "1px solid #222230",
    color: "#4a4a58",
    background: "#111118",
  },
  turn: { display: "flex", flexDirection: "column", gap: "16px" },
  questionRow: { display: "flex", justifyContent: "flex-end" },
  questionBubble: {
    maxWidth: "70%",
    background: "#141420",
    border: "1px solid #252535",
    borderRadius: "16px 16px 4px 16px",
    padding: "14px 18px",
  },
  questionLabel: {
    fontSize: "9px",
    letterSpacing: "0.2em",
    color: "#6b6b78",
    display: "block",
    marginBottom: "6px",
  },
  questionText: {
    margin: 0,
    fontSize: "14px",
    lineHeight: "1.7",
    color: "#c8c8d8",
    fontFamily: "'DM Sans','Segoe UI',sans-serif",
    fontWeight: 400,
  },
  answerRow: { display: "flex", gap: "14px", alignItems: "flex-start" },
  answerAvatar: {
    width: "38px",
    height: "38px",
    flexShrink: 0,
    borderRadius: "50%",
    border: "1.5px solid #c9a84c44",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#111118",
  },
  avatarInner: {
    fontSize: "14px",
    fontWeight: 700,
    color: "#c9a84c",
    letterSpacing: "0.05em",
  },
  answerCard: {
    flex: 1,
    background: "#0e0e14",
    border: "1px solid #1e1e2a",
    borderRadius: "4px 16px 16px 16px",
    padding: "16px 18px",
    position: "relative",
    overflow: "hidden",
  },
  answerBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "2px",
    background:
      "linear-gradient(90deg, #c9a84c 0%, #c9a84c55 60%, transparent 100%)",
  },
  answerHeaderRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginBottom: "10px",
  },
  answerLabel: {
    fontSize: "9px",
    letterSpacing: "0.2em",
    color: "#c9a84c88",
    display: "block",
  },
  answerText: {
    margin: 0,
    fontSize: "14px",
    lineHeight: "1.85",
    color: "#d0d0e0",
    fontFamily: "'DM Sans','Segoe UI',sans-serif",
    whiteSpace: "pre-wrap",
    fontWeight: 400,
  },
  generatingBadge: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    padding: "2px 9px",
    borderRadius: "999px",
    border: "1px solid #c9a84c33",
    background: "#c9a84c0a",
  },
  genDot: {
    display: "inline-block",
    width: "5px",
    height: "5px",
    borderRadius: "50%",
    background: "#c9a84c",
  },
  genLabel: {
    fontSize: "8px",
    letterSpacing: "0.2em",
    color: "#c9a84c88",
    fontWeight: 600,
  },
  thinkRow: {
    display: "flex",
    gap: "7px",
    alignItems: "center",
    padding: "6px 0",
  },
  thinkDot: {
    display: "inline-block",
    width: "7px",
    height: "7px",
    borderRadius: "50%",
    background: "#c9a84c",
  },
  cursor: {
    display: "inline-block",
    width: "2px",
    height: "14px",
    background: "#c9a84c",
    borderRadius: "1px",
    marginLeft: "2px",
    verticalAlign: "text-bottom",
  },
  inputSection: {
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  statsRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "0 6px",
    marginBottom: "2px",
  },
  stat: { fontSize: "10px", color: "#3a3a48", letterSpacing: "0.06em" },
  statDivider: { color: "#2a2a38", fontSize: "10px" },
  inputWrap: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    borderRadius: "16px",
    border: "1px solid #222230",
    background: "#0e0e14",
    padding: "10px 12px",
    transition: "box-shadow 0.2s",
  },
  attachBtn: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "7px 13px",
    borderRadius: "10px",
    border: "1px dashed #2a2a38",
    color: "#6b6b78",
    fontSize: "10px",
    letterSpacing: "0.1em",
    fontWeight: 500,
    cursor: "pointer",
    flexShrink: 0,
    fontFamily: "'DM Mono',monospace",
    userSelect: "none",
    transition: "all 0.2s",
  },
  fileChip: {
    display: "flex",
    alignItems: "center",
    gap: "7px",
    padding: "6px 11px",
    borderRadius: "10px",
    border: "1px solid #4ade8033",
    background: "#4ade800d",
    flexShrink: 0,
  },
  chipName: {
    fontSize: "10px",
    color: "#4ade80",
    maxWidth: "100px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  chipX: {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#6b6b78",
    fontSize: "10px",
    padding: "0 2px",
    lineHeight: 1,
  },
  sep: { width: "1px", height: "22px", background: "#1e1e2a", flexShrink: 0 },
  input: {
    flex: 1,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "#e0e0ec",
    fontSize: "14px",
    fontFamily: "'DM Sans','Segoe UI',sans-serif",
    letterSpacing: "0.01em",
    lineHeight: "1.5",
  },
  sendBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "38px",
    height: "38px",
    borderRadius: "12px",
    border: "none",
    background: "linear-gradient(135deg, #c9a84c 0%, #9a7228 100%)",
    color: "#08080a",
    cursor: "pointer",
    flexShrink: 0,
    boxShadow: "0 2px 16px #c9a84c44",
  },
  sendOff: { opacity: 0.25, cursor: "not-allowed", boxShadow: "none" },
  stopBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "38px",
    height: "38px",
    borderRadius: "12px",
    border: "1px solid #c9a84c44",
    background: "#c9a84c0a",
    cursor: "pointer",
    flexShrink: 0,
    transition: "background 0.2s",
  },
  stopSq: {
    display: "block",
    width: "12px",
    height: "12px",
    borderRadius: "3px",
    background: "#c9a84c",
  },
  footer: { display: "flex", justifyContent: "center" },
  footerText: {
    fontSize: "10px",
    color: "#2e2e3c",
    letterSpacing: "0.05em",
    fontFamily: "'DM Mono',monospace",
  },
  kbd: {
    padding: "1px 5px",
    borderRadius: "4px",
    border: "1px solid #222230",
    background: "#111118",
    color: "#4a4a58",
    fontSize: "9px",
  },
};

export default ChatPage;
