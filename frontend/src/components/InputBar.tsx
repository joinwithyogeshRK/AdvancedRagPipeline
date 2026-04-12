import { motion, AnimatePresence } from "framer-motion";
import { useClerk } from "@clerk/react";

interface Props {
  message: string;
  file: File | null;
  fileName: string;
  charCount: number;
  chatId: string | null;
  isStreaming: boolean;
  focused: boolean;
  signedIn: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (val: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onSend: () => void;
  onStop: () => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: () => void;
  historyLength: number;
}

export const InputBar = ({
  message, file, fileName, charCount, chatId, isStreaming,
  focused, signedIn, inputRef, onChange, onFocus, onBlur, onSend, onStop,
  onFileChange, onRemoveFile, historyLength,
}: Props) => {
  const { openSignIn } = useClerk();
  const canChat = signedIn && !isStreaming;
  const sendEnabled = signedIn && message.trim().length > 0 && !isStreaming;

  const promptSignIn = () => {
    void openSignIn();
  };

  return (
  <motion.div style={s.inputSection} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}>

    {/* Stats */}
    <div style={s.statsRow}>
      <span style={s.stat}><span style={{ color: "#c9a84c" }}>{historyLength}</span> exchanges</span>
      <span style={s.statDivider}>·</span>
      <span style={s.stat}><span style={{ color: file ? "#4ade80" : "#6b6b78" }}>{file ? "PDF attached" : "No document"}</span></span>
      <span style={s.statDivider}>·</span>
      <span style={s.stat}><span style={{ color: charCount > 200 ? "#f87171" : "#6b6b78" }}>{charCount}</span> chars</span>
      <span style={s.statDivider}>·</span>
      <span style={s.stat}><span style={{ color: chatId ? "#c9a84c" : "#6b6b78" }}>{chatId ? "Chat active" : "New session"}</span></span>
    </div>

    {/* Input wrap */}
    <motion.div
      style={{
        ...s.inputWrap,
        position: "relative",
        opacity: signedIn ? 1 : 0.72,
        boxShadow: focused && signedIn ? "0 0 0 1.5px #c9a84c66, 0 8px 48px #c9a84c14, inset 0 1px 0 #c9a84c11" : "0 0 0 1px #222230, 0 4px 24px #00000070, inset 0 1px 0 #ffffff06",
      }}
      transition={{ duration: 0.2 }}
    >
      {/* File attach / chip */}
      <AnimatePresence mode="wait">
        {!file ? (
          <motion.label
            key="attach"
            style={{
              ...s.attachBtn,
              pointerEvents: signedIn ? "auto" : "none",
              opacity: signedIn ? 1 : 0.45,
              cursor: signedIn ? "pointer" : "not-allowed",
            }}
            whileHover={signedIn ? { borderColor: "#c9a84c99", color: "#c9a84c", background: "#c9a84c0a" } : {}}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
            </svg>
            PDF
            {signedIn && <input type="file" accept="application/pdf" style={{ display: "none" }} onChange={onFileChange} />}
          </motion.label>
        ) : (
          <motion.div key="chip" style={s.fileChip} initial={{ opacity: 0, scale: 0.88 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <span style={s.chipName}>{fileName}</span>
            <button type="button" onClick={signedIn ? onRemoveFile : undefined} disabled={!signedIn} style={{ ...s.chipX, opacity: signedIn ? 1 : 0.35, cursor: signedIn ? "pointer" : "not-allowed" }}>✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      <div style={s.sep} />

      <input
        ref={inputRef}
        style={{ ...s.input, cursor: signedIn ? "text" : "not-allowed" }}
        type="text"
        placeholder={signedIn ? "Ask anything… (attach a PDF for document Q&A)" : "Sign in to ask questions…"}
        value={message}
        disabled={!signedIn}
        onChange={(e) => signedIn && onChange(e.target.value)}
        onFocus={() => signedIn && onFocus()}
        onBlur={onBlur}
        onKeyDown={(e) => e.key === "Enter" && canChat && onSend()}
      />

      {/* Send / Stop */}
      <AnimatePresence mode="wait">
        {isStreaming ? (
          <motion.button key="stop" type="button" onClick={onStop} style={s.stopBtn} whileHover={{ scale: 1.08, background: "#c9a84c22" }} whileTap={{ scale: 0.92 }} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>
            <span style={s.stopSq} />
          </motion.button>
        ) : (
          <motion.button
            key="send"
            type="button"
            onClick={onSend}
            disabled={!sendEnabled}
            style={{ ...s.sendBtn, ...(!sendEnabled ? s.sendOff : {}) }}
            whileHover={sendEnabled ? { scale: 1.07 } : {}}
            whileTap={sendEnabled ? { scale: 0.91 } : {}}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </motion.button>
        )}
      </AnimatePresence>

      {!signedIn && (
        <button
          type="button"
          aria-label="Sign in to use chat"
          onClick={promptSignIn}
          style={s.signInGate}
        />
      )}
    </motion.div>

    <div style={s.footer}>
      <span style={s.footerText}>
        <kbd style={s.kbd}>Enter</kbd> to send &nbsp;·&nbsp; PDF optional &nbsp;·&nbsp; Powered by RAG + Voyage + Groq
      </span>
    </div>
  </motion.div>
  );
};

const s: Record<string, React.CSSProperties> = {
  inputSection: { flexShrink: 0, display: "flex", flexDirection: "column", gap: "8px" },
  statsRow: { display: "flex", alignItems: "center", gap: "8px", padding: "0 6px", marginBottom: "2px" },
  stat: { fontSize: "10px", color: "#3a3a48", letterSpacing: "0.06em" },
  statDivider: { color: "#2a2a38", fontSize: "10px" },
  inputWrap: { display: "flex", alignItems: "center", gap: "10px", borderRadius: "16px", border: "1px solid #222230", background: "#0e0e14", padding: "10px 12px", transition: "box-shadow 0.2s" },
  signInGate: { position: "absolute", inset: 0, zIndex: 10, cursor: "pointer", border: "none", padding: 0, margin: 0, background: "transparent", borderRadius: "16px" },
  attachBtn: { display: "flex", alignItems: "center", gap: "6px", padding: "7px 13px", borderRadius: "10px", border: "1px dashed #2a2a38", color: "#6b6b78", fontSize: "10px", letterSpacing: "0.1em", fontWeight: 500, cursor: "pointer", flexShrink: 0, fontFamily: "'DM Mono',monospace", userSelect: "none", transition: "all 0.2s" },
  fileChip: { display: "flex", alignItems: "center", gap: "7px", padding: "6px 11px", borderRadius: "10px", border: "1px solid #4ade8033", background: "#4ade800d", flexShrink: 0 },
  chipName: { fontSize: "10px", color: "#4ade80", maxWidth: "100px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  chipX: { background: "none", border: "none", cursor: "pointer", color: "#6b6b78", fontSize: "10px", padding: "0 2px", lineHeight: 1 },
  sep: { width: "1px", height: "22px", background: "#1e1e2a", flexShrink: 0 },
  input: { flex: 1, background: "transparent", border: "none", outline: "none", color: "#e0e0ec", fontSize: "14px", fontFamily: "'DM Sans','Segoe UI',sans-serif", letterSpacing: "0.01em", lineHeight: "1.5" },
  sendBtn: { display: "flex", alignItems: "center", justifyContent: "center", width: "38px", height: "38px", borderRadius: "12px", border: "none", background: "linear-gradient(135deg, #c9a84c 0%, #9a7228 100%)", color: "#08080a", cursor: "pointer", flexShrink: 0, boxShadow: "0 2px 16px #c9a84c44" },
  sendOff: { opacity: 0.25, cursor: "not-allowed", boxShadow: "none" },
  stopBtn: { display: "flex", alignItems: "center", justifyContent: "center", width: "38px", height: "38px", borderRadius: "12px", border: "1px solid #c9a84c44", background: "#c9a84c0a", cursor: "pointer", flexShrink: 0, transition: "background 0.2s" },
  stopSq: { display: "block", width: "12px", height: "12px", borderRadius: "3px", background: "#c9a84c" },
  footer: { display: "flex", justifyContent: "center" },
  footerText: { fontSize: "10px", color: "#2e2e3c", letterSpacing: "0.05em", fontFamily: "'DM Mono',monospace" },
  kbd: { padding: "1px 5px", borderRadius: "4px", border: "1px solid #222230", background: "#111118", color: "#4a4a58", fontSize: "9px" },
};