// frontend/src/components/InputBar.tsx
import { motion, AnimatePresence } from "framer-motion";
import { useClerk } from "@clerk/react";

interface Document {
  source:     string;
  uploadedAt: number;
}

interface Props {
  message:        string;
  file:           File | null;
  fileName:       string;
  charCount:      number;
  chatId:         string | null;
  isStreaming:    boolean;
  focused:        boolean;
  signedIn:       boolean;
  inputRef:       React.RefObject<HTMLInputElement | null>;
  documents:      Document[];
  selectedSource: string;
  loadingDocs:    boolean;
  // Recording props ↓
  isRecording:    boolean;
  isTranscribing: boolean;
  recError:       string | null;
  onRecordStart:  () => void;
  onRecordStop:   () => void;
  // Existing callbacks
  onSourceChange: (val: string) => void;
  onChange:       (val: string) => void;
  onFocus:        () => void;
  onBlur:         () => void;
  onSend:         () => void;
  onStop:         () => void;
  onFileChange:   (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile:   () => void;
  historyLength:  number;
}

export const InputBar = ({
  message, file, fileName, charCount, chatId, isStreaming,
  focused, signedIn, inputRef, documents, selectedSource, loadingDocs,
  isRecording, isTranscribing, recError,
  onRecordStart, onRecordStop,
  onSourceChange, onChange, onFocus, onBlur, onSend, onStop,
  onFileChange, onRemoveFile, historyLength,
}: Props) => {
  const { openSignIn } = useClerk();
  const canChat     = signedIn && !isStreaming && !isRecording && !isTranscribing;
  const sendEnabled = signedIn && message.trim().length > 0 && !isStreaming && !isRecording && !isTranscribing;
  const hasDocs     = documents.length > 0;

  const promptSignIn = () => { void openSignIn(); };

  return (
    <motion.div
      style={s.inputSection}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Stats */}
      <div style={s.statsRow}>
        <span style={s.stat}>
          <span style={{ color: "#c9a84c" }}>{historyLength}</span> exchanges
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
          </span> chars
        </span>
        <span style={s.statDivider}>·</span>
        <span style={s.stat}>
          <span style={{ color: chatId ? "#c9a84c" : "#6b6b78" }}>
            {chatId ? "Chat active" : "New session"}
          </span>
        </span>
        {/* Recording / transcribing badge */}
        <AnimatePresence>
          {(isRecording || isTranscribing) && (
            <motion.span
              style={s.recBadge}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
            >
              {isRecording ? (
                <>
                  <motion.span
                    style={s.recDot}
                    animate={{ opacity: [1, 0.2, 1] }}
                    transition={{ repeat: Infinity, duration: 1 }}
                  />
                  recording…
                </>
              ) : (
                <>
                  <motion.span
                    style={{ ...s.recDot, background: "#c9a84c" }}
                    animate={{ opacity: [1, 0.2, 1] }}
                    transition={{ repeat: Infinity, duration: 0.8 }}
                  />
                  transcribing…
                </>
              )}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Error banner */}
      <AnimatePresence>
        {recError && (
          <motion.div
            style={s.errBanner}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
          >
            ⚠ {recError}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Document Selector ─────────────────────────────── */}
      <AnimatePresence>
        {signedIn && hasDocs && (
          <motion.div
            style={s.docSelectorRow}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
              stroke="#6b6b78" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            >
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>

            <span style={s.docLabel}>Search in:</span>
            {loadingDocs && (
              <span style={{ fontSize: "9px", color: "#3a3a48", fontFamily: "'DM Mono',monospace" }}>
                loading…
              </span>
            )}

            <motion.button
              type="button"
              onClick={() => onSourceChange("all")}
              style={{ ...s.docPill, ...(selectedSource === "all" ? s.docPillActive : {}) }}
              whileHover={{ borderColor: "#c9a84c66" }}
              whileTap={{ scale: 0.95 }}
            >
              All documents
            </motion.button>

            {documents.map((doc) => (
              <motion.button
                key={doc.source}
                type="button"
                onClick={() => onSourceChange(selectedSource === doc.source ? "all" : doc.source)}
                style={{ ...s.docPill, ...(selectedSource === doc.source ? s.docPillActive : {}) }}
                whileHover={{ borderColor: "#c9a84c66" }}
                whileTap={{ scale: 0.95 }}
                title={doc.source}
              >
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                >
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                {doc.source.length > 20 ? doc.source.slice(0, 17) + "..." : doc.source}
              </motion.button>
            ))}

            <AnimatePresence>
              {selectedSource !== "all" && (
                <motion.span
                  style={s.filterActive}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                >
                  ● filtered
                </motion.span>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input wrap */}
      <motion.div
        style={{
          ...s.inputWrap,
          position: "relative",
          opacity: signedIn ? 1 : 0.72,
          boxShadow: isRecording
            ? "0 0 0 1.5px #f8717166, 0 8px 48px #f8717114, inset 0 1px 0 #f8717111"
            : focused && signedIn
            ? "0 0 0 1.5px #c9a84c66, 0 8px 48px #c9a84c14, inset 0 1px 0 #c9a84c11"
            : "0 0 0 1px #222230, 0 4px 24px #00000070, inset 0 1px 0 #ffffff06",
        }}
        transition={{ duration: 0.2 }}
      >
        {/* PDF attach / chip */}
        <AnimatePresence mode="wait">
          {!file ? (
            <motion.label
              key="attach"
              style={{
                ...s.attachBtn,
                pointerEvents: signedIn ? "auto" : "none",
                opacity:       signedIn ? 1 : 0.45,
                cursor:        signedIn ? "pointer" : "not-allowed",
              }}
              whileHover={signedIn
                ? { borderColor: "#c9a84c99", color: "#c9a84c", background: "#c9a84c0a" }
                : {}
              }
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"
              >
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
              </svg>
              PDF
              {signedIn && (
                <input
                  type="file"
                  accept="application/pdf"
                  style={{ display: "none" }}
                  onChange={onFileChange}
                />
              )}
            </motion.label>
          ) : (
            <motion.div
              key="chip"
              style={s.fileChip}
              initial={{ opacity: 0, scale: 0.88 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round"
              >
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span style={s.chipName}>{fileName}</span>
              <button
                type="button"
                onClick={signedIn ? onRemoveFile : undefined}
                disabled={!signedIn}
                style={{
                  ...s.chipX,
                  opacity: signedIn ? 1 : 0.35,
                  cursor:  signedIn ? "pointer" : "not-allowed",
                }}
              >✕</button>
            </motion.div>
          )}
        </AnimatePresence>

        <div style={s.sep} />

        {/* ── Mic / Record button ──────────────────────────── */}
        <AnimatePresence mode="wait">
          {isTranscribing ? (
            // Spinner pill while AssemblyAI works
            <motion.div
              key="transcribing"
              style={s.transcribingPill}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
            >
              <motion.span
                style={{ ...s.recDot, background: "#c9a84c", marginRight: 5 }}
                animate={{ opacity: [1, 0.2, 1] }}
                transition={{ repeat: Infinity, duration: 0.7 }}
              />
              transcribing…
            </motion.div>
          ) : (
            <motion.button
              key="mic"
              type="button"
              onClick={
                !signedIn ? promptSignIn
                  : isRecording ? onRecordStop
                  : onRecordStart
              }
              disabled={isTranscribing}
              style={{
                ...s.micBtn,
                ...(isRecording ? s.micBtnActive : {}),
                opacity: signedIn ? 1 : 0.45,
                cursor:  signedIn ? "pointer" : "not-allowed",
              }}
              whileHover={signedIn && !isTranscribing
                ? { borderColor: isRecording ? "#f8717199" : "#c9a84c99", scale: 1.05 }
                : {}
              }
              whileTap={signedIn ? { scale: 0.92 } : {}}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              title={isRecording ? "Stop recording" : "Record voice message"}
            >
              {isRecording ? (
                // Pulsing red stop square
                <motion.span
                  style={s.stopSqRed}
                  animate={{ opacity: [1, 0.4, 1] }}
                  transition={{ repeat: Infinity, duration: 0.9 }}
                />
              ) : (
                // Mic icon
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"
                >
                  <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                  <path d="M19 10v2a7 7 0 01-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8"  y1="23" x2="16" y2="23" />
                </svg>
              )}
            </motion.button>
          )}
        </AnimatePresence>

        <div style={s.sep} />

        <input
          ref={inputRef}
          style={{ ...s.input, cursor: signedIn ? "text" : "not-allowed" }}
          type="text"
          placeholder={
            isTranscribing
              ? "Transcribing your voice…"
              : isRecording
              ? "Recording — click ■ to stop"
              : signedIn
              ? selectedSource !== "all"
                ? `Ask about ${selectedSource.slice(0, 25)}…`
                : "Ask anything… or click 🎙 to speak"
              : "Sign in to ask questions…"
          }
          value={message}
          disabled={!signedIn || isTranscribing}
          onChange={(e) => signedIn && onChange(e.target.value)}
          onFocus={() => signedIn && onFocus()}
          onBlur={onBlur}
          onKeyDown={(e) => e.key === "Enter" && canChat && onSend()}
        />

        {/* Send / Stop streaming */}
        <AnimatePresence mode="wait">
          {isStreaming ? (
            <motion.button
              key="stop"
              type="button"
              onClick={onStop}
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
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round"
              >
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
          <kbd style={s.kbd}>Enter</kbd> to send &nbsp;·&nbsp;
          <kbd style={s.kbd}>🎙</kbd> to speak &nbsp;·&nbsp;
          {selectedSource !== "all"
            ? <span style={{ color: "#c9a84c" }}> Searching: {selectedSource.slice(0, 20)}</span>
            : " Powered by RAG + Voyage + Groq"
          }
        </span>
      </div>
    </motion.div>
  );
};

/* ─────────────────────────────────────────────── styles ── */
const s: Record<string, React.CSSProperties> = {
  inputSection:   { flexShrink: 0, display: "flex", flexDirection: "column", gap: "8px" },
  statsRow:       { display: "flex", alignItems: "center", gap: "8px", padding: "0 6px", marginBottom: "2px", flexWrap: "wrap" },
  stat:           { fontSize: "10px", color: "#3a3a48", letterSpacing: "0.06em" },
  statDivider:    { color: "#2a2a38", fontSize: "10px" },

  // Recording badge in stats row
  recBadge: {
    display: "flex", alignItems: "center", gap: "5px",
    fontSize: "9px", color: "#f87171", fontFamily: "'DM Mono',monospace",
    letterSpacing: "0.06em", marginLeft: "auto",
  },
  recDot: {
    display: "inline-block", width: "6px", height: "6px",
    borderRadius: "50%", background: "#f87171", flexShrink: 0,
  },

  // Error banner
  errBanner: {
    fontSize: "10px", color: "#f87171", background: "#f871710d",
    border: "1px solid #f8717133", borderRadius: "8px",
    padding: "5px 10px", fontFamily: "'DM Mono',monospace", letterSpacing: "0.04em",
  },

  // Document selector
  docSelectorRow: {
    display: "flex", alignItems: "center", gap: "8px",
    padding: "6px 8px", borderRadius: "10px",
    background: "#0e0e14", border: "1px solid #1a1a24", flexWrap: "wrap",
  },
  docLabel: {
    fontSize: "9px", color: "#6b6b78", letterSpacing: "0.08em",
    fontFamily: "'DM Mono',monospace", textTransform: "uppercase", flexShrink: 0,
  },
  docPill: {
    display: "flex", alignItems: "center", gap: "4px",
    padding: "3px 9px", borderRadius: "6px", border: "1px solid #222230",
    background: "transparent", color: "#6b6b78", fontSize: "9px",
    fontFamily: "'DM Mono',monospace", cursor: "pointer",
    letterSpacing: "0.04em", transition: "all 0.15s", flexShrink: 0,
  },
  docPillActive:  { borderColor: "#c9a84c66", background: "#c9a84c11", color: "#c9a84c" },
  filterActive:   { fontSize: "9px", color: "#c9a84c88", fontFamily: "'DM Mono',monospace", letterSpacing: "0.06em", marginLeft: "auto" },

  // Input wrap
  inputWrap:  { display: "flex", alignItems: "center", gap: "10px", borderRadius: "16px", border: "1px solid #222230", background: "#0e0e14", padding: "10px 12px", transition: "box-shadow 0.2s" },
  signInGate: { position: "absolute", inset: 0, zIndex: 10, cursor: "pointer", border: "none", padding: 0, margin: 0, background: "transparent", borderRadius: "16px" },
  attachBtn:  { display: "flex", alignItems: "center", gap: "6px", padding: "7px 13px", borderRadius: "10px", border: "1px dashed #2a2a38", color: "#6b6b78", fontSize: "10px", letterSpacing: "0.1em", fontWeight: 500, cursor: "pointer", flexShrink: 0, fontFamily: "'DM Mono',monospace", userSelect: "none", transition: "all 0.2s" },
  fileChip:   { display: "flex", alignItems: "center", gap: "7px", padding: "6px 11px", borderRadius: "10px", border: "1px solid #4ade8033", background: "#4ade800d", flexShrink: 0 },
  chipName:   { fontSize: "10px", color: "#4ade80", maxWidth: "100px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  chipX:      { background: "none", border: "none", cursor: "pointer", color: "#6b6b78", fontSize: "10px", padding: "0 2px", lineHeight: 1 },
  sep:        { width: "1px", height: "22px", background: "#1e1e2a", flexShrink: 0 },
  input:      { flex: 1, background: "transparent", border: "none", outline: "none", color: "#e0e0ec", fontSize: "14px", fontFamily: "'DM Sans','Segoe UI',sans-serif", letterSpacing: "0.01em", lineHeight: "1.5" },

  // Mic button
  micBtn: {
    display: "flex", alignItems: "center", justifyContent: "center",
    width: "32px", height: "32px", borderRadius: "10px",
    border: "1px dashed #2a2a38", background: "transparent",
    color: "#6b6b78", cursor: "pointer", flexShrink: 0, transition: "all 0.2s",
  },
  micBtnActive: {
    borderColor: "#f8717166", background: "#f871710d", color: "#f87171",
  },
  stopSqRed: {
    display: "block", width: "10px", height: "10px",
    borderRadius: "2px", background: "#f87171",
  },

  // Transcribing pill
  transcribingPill: {
    display: "flex", alignItems: "center",
    padding: "5px 10px", borderRadius: "10px",
    border: "1px solid #c9a84c33", background: "#c9a84c0a",
    color: "#c9a84c", fontSize: "10px", fontFamily: "'DM Mono',monospace",
    letterSpacing: "0.06em", flexShrink: 0, whiteSpace: "nowrap",
  },

  // Send / stop
  sendBtn:    { display: "flex", alignItems: "center", justifyContent: "center", width: "38px", height: "38px", borderRadius: "12px", border: "none", background: "linear-gradient(135deg, #c9a84c 0%, #9a7228 100%)", color: "#08080a", cursor: "pointer", flexShrink: 0, boxShadow: "0 2px 16px #c9a84c44" },
  sendOff:    { opacity: 0.25, cursor: "not-allowed", boxShadow: "none" },
  stopBtn:    { display: "flex", alignItems: "center", justifyContent: "center", width: "38px", height: "38px", borderRadius: "12px", border: "1px solid #c9a84c44", background: "#c9a84c0a", cursor: "pointer", flexShrink: 0, transition: "background 0.2s" },
  stopSq:     { display: "block", width: "12px", height: "12px", borderRadius: "3px", background: "#c9a84c" },
  footer:     { display: "flex", justifyContent: "center" },
  footerText: { fontSize: "10px", color: "#2e2e3c", letterSpacing: "0.05em", fontFamily: "'DM Mono',monospace" },
  kbd:        { padding: "1px 5px", borderRadius: "4px", border: "1px solid #222230", background: "#111118", color: "#4a4a58", fontSize: "9px" },
};