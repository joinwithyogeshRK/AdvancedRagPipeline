import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useClerk } from "@clerk/react"
import { RepoInput } from "./RepoInput"

interface Document {
  source:     string
  uploadedAt: number
}

interface Props {
  message:        string
  file:           File | null
  fileName:       string
  charCount:      number
  chatId:         string | null
  isStreaming:    boolean
  focused:        boolean
  signedIn:       boolean
  inputRef:       React.RefObject<HTMLInputElement | null>
  documents:      Document[]
  selectedSource: string
  loadingDocs:    boolean
  isRecording:    boolean
  isTranscribing: boolean
  recError:       string | null
  isIndexing:     boolean
  onRecordStart:  () => void
  onRecordStop:   () => void
  onSourceChange: (val: string) => void
  onChange:       (val: string) => void
  onFocus:        () => void
  onBlur:         () => void
  onSend:         () => void
  onStop:         () => void
  onFileChange:   (e: React.ChangeEvent<HTMLInputElement>) => void
  onRemoveFile:   () => void
  onIndexRepo:    (url: string) => void
  onDeleteSource: (source: string) => Promise<void>
  historyLength:  number
}

// ── Delete confirmation modal ──────────────────────────────────────────────
const DeleteModal = ({
  source, onConfirm, onCancel, deleting,
}: {
  source: string; onConfirm: () => void; onCancel: () => void; deleting: boolean
}) => {
  const isRepo    = source.startsWith("github:")
  const label     = isRepo ? source.replace("github:", "") : source
  const typeLabel = isRepo ? "repository" : "document"

  return (
    <motion.div style={s.modalOverlay}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onCancel}
    >
      <motion.div style={s.modal}
        initial={{ opacity: 0, scale: 0.92, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 12 }}
        transition={{ duration: 0.18 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={s.modalIcon}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <div style={s.modalTitle}>Delete {typeLabel}?</div>
        <div style={s.modalSource}>{label}</div>
        <div style={s.modalWarning}>
          All embeddings for this {typeLabel} will be permanently removed
          from Pinecone and Supabase. This cannot be undone.
        </div>
        <div style={s.modalActions}>
          <motion.button type="button" onClick={onCancel} style={s.modalCancel}
            whileHover={{ borderColor: "#3a3a50" }} whileTap={{ scale: 0.96 }} disabled={deleting}>
            Cancel
          </motion.button>
          <motion.button type="button" onClick={onConfirm}
            style={{ ...s.modalDelete, ...(deleting ? { opacity: 0.5, cursor: "not-allowed" } : {}) }}
            whileHover={!deleting ? { background: "#ef444433" } : {}}
            whileTap={!deleting ? { scale: 0.96 } : {}} disabled={deleting}>
            {deleting ? (
              <motion.span animate={{ opacity: [1, 0.4, 1] }} transition={{ repeat: Infinity, duration: 0.8 }}>
                Deleting…
              </motion.span>
            ) : (
              <>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14H6L5 6"/>
                  <path d="M10 11v6M14 11v6"/>
                  <path d="M9 6V4h6v2"/>
                </svg>
                Delete permanently
              </>
            )}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Tooltip wrapper ────────────────────────────────────────────────────────
const Tooltip = ({ text, children }: { text: string; children: React.ReactNode }) => {
  const [show, setShow] = useState(false)
  return (
    <div style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      <AnimatePresence>
        {show && (
          <motion.div style={s.tooltip}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
          >
            {text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Source pill ────────────────────────────────────────────────────────────
const SourcePill = ({
  source, isActive, onSelect, onDelete, nudge,
}: {
  source: string; isActive: boolean; onSelect: () => void; onDelete: () => void; nudge?: boolean
}) => {
  const isRepo = source.startsWith("github:")
  const label  = isRepo
    ? source.replace("github:", "").slice(0, 18)
    : source.length > 18 ? source.slice(0, 15) + "…" : source

  return (
    <Tooltip text={isRepo
      ? `Filter to repo: ${source.replace("github:", "")}`
      : `Filter to doc: ${source}`
    }>
      <motion.div
        style={{ ...s.sourcePill, ...(isActive ? s.sourcePillActive : {}), ...(nudge && !isActive ? s.sourcePillNudge : {}) }}
        layout
        animate={nudge && !isActive ? {
          boxShadow: [
            "0 0 0px #c9a84c00",
            "0 0 8px #c9a84c66",
            "0 0 0px #c9a84c00",
          ],
        } : {}}
        transition={nudge && !isActive ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : {}}
      >
        <button type="button" onClick={onSelect}
          style={{ ...s.pillLabel, color: isActive ? "#c9a84c" : nudge ? "#c9a84c99" : "#5a5a72" }}
        >
          {isRepo ? (
            <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>
          ) : (
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
          )}
          {label}
        </button>
        <Tooltip text="Remove from index">
          <motion.button type="button"
            onClick={e => { e.stopPropagation(); onDelete() }}
            style={s.pillDelete}
            whileHover={{ color: "#f87171", background: "#f871710d" }}
            whileTap={{ scale: 0.85 }}
          >
            <svg width="6" height="6" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </motion.button>
        </Tooltip>
      </motion.div>
    </Tooltip>
  )
}

// ── Hallucination warning banner ───────────────────────────────────────────
const HallucinationWarning = ({
  documents,
  selectedSource,
  onSourceChange,
}: {
  documents: Document[]
  selectedSource: string
  onSourceChange: (val: string) => void
}) => {
  const firstDoc = documents[0]
  if (!firstDoc) return null

  const isRepo  = firstDoc.source.startsWith("github:")
  const label   = isRepo
    ? firstDoc.source.replace("github:", "")
    : firstDoc.source.length > 22
    ? firstDoc.source.slice(0, 20) + "…"
    : firstDoc.source

  return (
    <motion.div
      style={s.hallucinationBanner}
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.97 }}
      transition={{ duration: 0.22 }}
    >
      {/* Left: icon + text */}
      <div style={s.hallucinationLeft}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
          stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <span style={s.hallucinationText}>
          Searching <span style={{ color: "#f59e0b" }}>all sources</span> — AI may hallucinate.
          Pin a source for precise answers.
        </span>
      </div>

      {/* Right: quick-select the first doc as a shortcut */}
      <motion.button
        type="button"
        style={s.hallucinationBtn}
        onClick={() => onSourceChange(firstDoc.source)}
        whileHover={{ background: "#c9a84c22", borderColor: "#c9a84c88", color: "#c9a84c" }}
        whileTap={{ scale: 0.95 }}
      >
        {isRepo ? (
          <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
          </svg>
        ) : (
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
        )}
        Use "{label}"
      </motion.button>
    </motion.div>
  )
}

// ── Main InputBar ──────────────────────────────────────────────────────────
export const InputBar = ({
  message, file, fileName, charCount, chatId, isStreaming,
  focused, signedIn, inputRef, documents, selectedSource, loadingDocs,
  isRecording, isTranscribing, recError, isIndexing,
  onRecordStart, onRecordStop, onSourceChange, onChange,
  onFocus, onBlur, onSend, onStop, onFileChange, onRemoveFile,
  onIndexRepo, onDeleteSource, historyLength,
}: Props) => {
  const { openSignIn }                    = useClerk()
  const [showRepo,     setShowRepo]       = useState(false)
  const [deleteTarget, setDeleteTarget]   = useState<string | null>(null)
  const [deleting,     setDeleting]       = useState(false)
  const scrollRef                         = useRef<HTMLDivElement>(null)

  // Track whether user has typed without picking a source — show warning after a brief delay
  const [showHallucinationWarn, setShowHallucinationWarn] = useState(false)
  const warnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hasDocs     = documents.length > 0
  const isUnpinned  = hasDocs && selectedSource === "all"

  // Show hallucination warning after user has typed 10+ chars without pinning a source
  useEffect(() => {
    if (isUnpinned && message.trim().length >= 10) {
      warnTimerRef.current = setTimeout(() => setShowHallucinationWarn(true), 400)
    } else {
      setShowHallucinationWarn(false)
      if (warnTimerRef.current) clearTimeout(warnTimerRef.current)
    }
    return () => { if (warnTimerRef.current) clearTimeout(warnTimerRef.current) }
  }, [isUnpinned, message])

  // Hide warning as soon as they pick a source
  useEffect(() => {
    if (selectedSource !== "all") setShowHallucinationWarn(false)
  }, [selectedSource])

  const canChat     = signedIn && !isStreaming && !isRecording && !isTranscribing
  const sendEnabled = signedIn && message.trim().length > 0 && !isStreaming && !isRecording && !isTranscribing
  const promptSignIn = () => { void openSignIn() }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await onDeleteSource(deleteTarget)
      if (selectedSource === deleteTarget) onSourceChange("all")
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  // Placeholder adapts to guide user
  const placeholder = (() => {
    if (isIndexing)     return "Indexing repository…"
    if (isTranscribing) return "Transcribing your voice…"
    if (isRecording)    return "Recording — click ■ to stop"
    if (!signedIn)      return "Sign in to ask questions…"
    if (isUnpinned && hasDocs)
      return "Tip: pin a source above for accurate answers, or ask anything…"
    if (selectedSource !== "all")
      return `Ask about ${selectedSource.replace("github:", "").slice(0, 28)}…`
    return "Ask anything…"
  })()

  return (
    <motion.div style={s.inputSection}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Delete modal */}
      <AnimatePresence>
        {deleteTarget && (
          <DeleteModal
            source={deleteTarget}
            onConfirm={handleDeleteConfirm}
            onCancel={() => !deleting && setDeleteTarget(null)}
            deleting={deleting}
          />
        )}
      </AnimatePresence>

      {/* Stats row */}
      <div style={s.statsRow}>
        <span style={s.stat}><span style={{ color: "#c9a84c" }}>{historyLength}</span> exchanges</span>
        <span style={s.statDivider}>·</span>
        <span style={s.stat}><span style={{ color: file ? "#4ade80" : "#6b6b78" }}>{file ? "PDF attached" : "No document"}</span></span>
        <span style={s.statDivider}>·</span>
        <span style={s.stat}><span style={{ color: charCount > 200 ? "#f87171" : "#6b6b78" }}>{charCount}</span> chars</span>
        <span style={s.statDivider}>·</span>
        <span style={s.stat}><span style={{ color: chatId ? "#c9a84c" : "#6b6b78" }}>{chatId ? "Chat active" : "New session"}</span></span>

        <AnimatePresence>
          {(isRecording || isTranscribing) && (
            <motion.span style={s.recBadge}
              initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>
              {isRecording
                ? <><motion.span style={s.recDot} animate={{ opacity: [1, 0.2, 1] }} transition={{ repeat: Infinity, duration: 1 }}/>recording…</>
                : <><motion.span style={{ ...s.recDot, background: "#c9a84c" }} animate={{ opacity: [1, 0.2, 1] }} transition={{ repeat: Infinity, duration: 0.8 }}/>transcribing…</>
              }
            </motion.span>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isIndexing && (
            <motion.span style={s.indexingBadge}
              initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>
              <motion.span style={{ ...s.recDot, background: "#818cf8" }}
                animate={{ opacity: [1, 0.2, 1] }} transition={{ repeat: Infinity, duration: 0.9 }}/>
              indexing repo…
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Error banner */}
      <AnimatePresence>
        {recError && (
          <motion.div style={s.errBanner}
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
            ⚠ {recError}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Repo input panel */}
      <AnimatePresence>
        {showRepo && (
          <RepoInput
            signedIn={signedIn}
            isIndexing={isIndexing}
            onIndex={url => { onIndexRepo(url) }}
            onClose={() => setShowRepo(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Hallucination warning — appears below input when user types without pinning ── */}
      <AnimatePresence>
        {showHallucinationWarn && (
          <HallucinationWarning
            documents={documents}
            selectedSource={selectedSource}
            onSourceChange={onSourceChange}
          />
        )}
      </AnimatePresence>

      {/* ── MAIN INPUT BAR ──────────────────────────────────── */}
      <motion.div
        style={{
          ...s.inputWrap,
          position: "relative",
          opacity: signedIn ? 1 : 0.72,
          boxShadow: isRecording
            ? "0 0 0 1.5px #f8717166, 0 8px 48px #f8717114, inset 0 1px 0 #f8717111"
            : isIndexing
            ? "0 0 0 1.5px #818cf866, 0 8px 48px #818cf814, inset 0 1px 0 #818cf811"
            : showHallucinationWarn
            ? "0 0 0 1.5px #f59e0b55, 0 8px 48px #f59e0b0e, inset 0 1px 0 #f59e0b0a"
            : focused && signedIn
            ? "0 0 0 1.5px #c9a84c66, 0 8px 48px #c9a84c14, inset 0 1px 0 #c9a84c11"
            : "0 0 0 1px #222230, 0 4px 24px #00000070, inset 0 1px 0 #ffffff06",
        }}
        transition={{ duration: 0.2 }}
      >
        {/* PDF attach */}
        <AnimatePresence mode="wait">
          {!file ? (
            <Tooltip text="Upload a PDF to ask questions about it">
              <motion.label key="attach"
                style={{
                  ...s.attachBtn,
                  pointerEvents: signedIn ? "auto" : "none",
                  opacity:       signedIn ? 1 : 0.45,
                  cursor:        signedIn ? "pointer" : "not-allowed",
                }}
                whileHover={signedIn ? { borderColor: "#c9a84c99", color: "#c9a84c", background: "#c9a84c0a" } : {}}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
                </svg>
                PDF
                {signedIn && <input type="file" accept="application/pdf" style={{ display: "none" }} onChange={onFileChange}/>}
              </motion.label>
            </Tooltip>
          ) : (
            <motion.div key="chip" style={s.fileChip}
              initial={{ opacity: 0, scale: 0.88 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <span style={s.chipName}>{fileName}</span>
              <button type="button"
                onClick={signedIn ? onRemoveFile : undefined} disabled={!signedIn}
                style={{ ...s.chipX, opacity: signedIn ? 1 : 0.35, cursor: signedIn ? "pointer" : "not-allowed" }}>✕</button>
            </motion.div>
          )}
        </AnimatePresence>

        <div style={s.sep}/>

        {/* GitHub button */}
        <Tooltip text="Index a GitHub repo to explore its codebase">
          <motion.button type="button"
            onClick={signedIn ? () => setShowRepo(v => !v) : promptSignIn}
            style={{
              ...s.githubBtn,
              ...(showRepo ? s.githubBtnActive : {}),
              opacity: signedIn ? 1 : 0.45,
              cursor:  signedIn ? "pointer" : "not-allowed",
            }}
            whileHover={signedIn ? { borderColor: "#818cf866", color: "#818cf8" } : {}}
            whileTap={signedIn ? { scale: 0.95 } : {}}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            Repo
          </motion.button>
        </Tooltip>

        <div style={s.sep}/>

        {/* ── Source filter pills ── */}
        {signedIn && hasDocs && (
          <Tooltip text="Filter search to a specific document or repo. Click a pill to activate, × to delete from index.">
            <div style={s.filterIcon}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none"
                stroke={selectedSource !== "all" ? "#c9a84c" : isUnpinned && showHallucinationWarn ? "#f59e0b" : "#3a3a50"}
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
              </svg>
            </div>
          </Tooltip>
        )}

        {signedIn && hasDocs && (
          <div ref={scrollRef} style={{
            ...s.pillsScroll,
            // subtle amber glow on the pills row when warning is active
            ...(showHallucinationWarn ? { borderRadius: "6px", outline: "1px solid #f59e0b22" } : {})
          }}>
            {/* All pill */}
            <Tooltip text="Search across all your documents and repos">
              <motion.button type="button"
                onClick={() => onSourceChange("all")}
                style={{ ...s.allPill, ...(selectedSource === "all" ? s.allPillActive : {}) }}
                whileHover={{ borderColor: "#c9a84c55" }}
                whileTap={{ scale: 0.95 }}
              >
                All
              </motion.button>
            </Tooltip>

            {/* Source pills — nudge animation when warning is active */}
            {documents.map(doc => (
              <SourcePill
                key={doc.source}
                source={doc.source}
                isActive={selectedSource === doc.source}
                onSelect={() => onSourceChange(selectedSource === doc.source ? "all" : doc.source)}
                onDelete={() => setDeleteTarget(doc.source)}
                nudge={showHallucinationWarn}
              />
            ))}

            {loadingDocs && (
              <span style={s.loadingText}>loading…</span>
            )}
          </div>
        )}

        {signedIn && hasDocs && <div style={s.sep}/>}

        {/* Mic */}
        <AnimatePresence mode="wait">
          {isTranscribing ? (
            <motion.div key="transcribing" style={s.transcribingPill}
              initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }}>
              <motion.span style={{ ...s.recDot, background: "#c9a84c", marginRight: 5 }}
                animate={{ opacity: [1, 0.2, 1] }} transition={{ repeat: Infinity, duration: 0.7 }}/>
              transcribing…
            </motion.div>
          ) : (
            <Tooltip text={isRecording ? "Stop recording" : "Record a voice message"}>
              <motion.button key="mic" type="button"
                onClick={!signedIn ? promptSignIn : isRecording ? onRecordStop : onRecordStart}
                disabled={isTranscribing}
                style={{
                  ...s.micBtn,
                  ...(isRecording ? s.micBtnActive : {}),
                  opacity: signedIn ? 1 : 0.45,
                  cursor:  signedIn ? "pointer" : "not-allowed",
                }}
                whileHover={signedIn && !isTranscribing ? { borderColor: isRecording ? "#f8717199" : "#c9a84c99", scale: 1.05 } : {}}
                whileTap={signedIn ? { scale: 0.92 } : {}}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              >
                {isRecording ? (
                  <motion.span style={s.stopSqRed}
                    animate={{ opacity: [1, 0.4, 1] }} transition={{ repeat: Infinity, duration: 0.9 }}/>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
                    <path d="M19 10v2a7 7 0 01-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                    <line x1="8" y1="23" x2="16" y2="23"/>
                  </svg>
                )}
              </motion.button>
            </Tooltip>
          )}
        </AnimatePresence>

        <div style={s.sep}/>

        {/* Text input */}
        <input
          ref={inputRef}
          style={{ ...s.input, cursor: signedIn ? "text" : "not-allowed" }}
          type="text"
          placeholder={placeholder}
          value={message}
          disabled={!signedIn || isTranscribing || isIndexing}
          onChange={e => signedIn && onChange(e.target.value)}
          onFocus={() => signedIn && onFocus()}
          onBlur={onBlur}
          onKeyDown={e => e.key === "Enter" && canChat && onSend()}
        />

        {/* Send / Stop */}
        <AnimatePresence mode="wait">
          {isStreaming ? (
            <motion.button key="stop" type="button" onClick={onStop} style={s.stopBtn}
              whileHover={{ scale: 1.08, background: "#c9a84c22" }} whileTap={{ scale: 0.92 }}
              initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>
              <span style={s.stopSq}/>
            </motion.button>
          ) : (
            <motion.button key="send" type="button" onClick={onSend} disabled={!sendEnabled}
              style={{ ...s.sendBtn, ...(!sendEnabled ? s.sendOff : {}) }}
              whileHover={sendEnabled ? { scale: 1.07 } : {}} whileTap={sendEnabled ? { scale: 0.91 } : {}}
              initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </motion.button>
          )}
        </AnimatePresence>

        {!signedIn && (
          <button type="button" aria-label="Sign in to use chat"
            onClick={promptSignIn} style={s.signInGate}/>
        )}
      </motion.div>

      {/* Footer */}
      <div style={s.footer}>
        <span style={s.footerText}>
          <kbd style={s.kbd}>Enter</kbd> to send &nbsp;·&nbsp;
          <kbd style={s.kbd}>🎙</kbd> to speak &nbsp;·&nbsp;
          {selectedSource !== "all"
            ? <span style={{ color: "#c9a84c" }}>
                Filtering: {selectedSource.replace("github:", "").slice(0, 24)}
              </span>
            : "Powered by RAG + Voyage + Groq"
          }
        </span>
      </div>
    </motion.div>
  )
}

const s: Record<string, React.CSSProperties> = {
  inputSection:   { flexShrink: 0, display: "flex", flexDirection: "column", gap: "8px" },
  statsRow:       { display: "flex", alignItems: "center", gap: "8px", padding: "0 6px", marginBottom: "2px", flexWrap: "wrap" },
  stat:           { fontSize: "10px", color: "#3a3a48", letterSpacing: "0.06em" },
  statDivider:    { color: "#2a2a38", fontSize: "10px" },
  recBadge:       { display: "flex", alignItems: "center", gap: "5px", fontSize: "9px", color: "#f87171", fontFamily: "'DM Mono',monospace", letterSpacing: "0.06em", marginLeft: "auto" },
  indexingBadge:  { display: "flex", alignItems: "center", gap: "5px", fontSize: "9px", color: "#818cf8", fontFamily: "'DM Mono',monospace", letterSpacing: "0.06em" },
  recDot:         { display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", background: "#f87171", flexShrink: 0 },
  errBanner:      { fontSize: "10px", color: "#f87171", background: "#f871710d", border: "1px solid #f8717133", borderRadius: "8px", padding: "5px 10px", fontFamily: "'DM Mono',monospace" },

  // Hallucination warning
  hallucinationBanner: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    gap: "10px", padding: "8px 12px", borderRadius: "10px",
    border: "1px solid #f59e0b33", background: "#f59e0b08",
    fontFamily: "'DM Mono',monospace",
  },
  hallucinationLeft: { display: "flex", alignItems: "center", gap: "8px", minWidth: 0 },
  hallucinationText: { fontSize: "10px", color: "#a08050", letterSpacing: "0.04em", lineHeight: "1.5" },
  hallucinationBtn:  {
    display: "flex", alignItems: "center", gap: "5px", flexShrink: 0,
    padding: "4px 10px", borderRadius: "7px",
    border: "1px solid #c9a84c44", background: "#c9a84c0a",
    color: "#c9a84c99", fontSize: "9px", fontFamily: "'DM Mono',monospace",
    cursor: "pointer", letterSpacing: "0.05em", whiteSpace: "nowrap",
    transition: "all 0.15s",
  },

  // Input wrap
  inputWrap:      { display: "flex", alignItems: "center", gap: "8px", borderRadius: "16px", border: "1px solid #222230", background: "#0e0e14", padding: "8px 12px", transition: "box-shadow 0.2s", minHeight: "56px" },
  signInGate:     { position: "absolute", inset: 0, zIndex: 10, cursor: "pointer", border: "none", padding: 0, margin: 0, background: "transparent", borderRadius: "16px" },

  // PDF / attach
  attachBtn:      { display: "flex", alignItems: "center", gap: "6px", padding: "6px 11px", borderRadius: "10px", border: "1px dashed #2a2a38", color: "#6b6b78", fontSize: "10px", letterSpacing: "0.08em", fontWeight: 500, cursor: "pointer", flexShrink: 0, fontFamily: "'DM Mono',monospace", userSelect: "none" as const, transition: "all 0.2s" },
  fileChip:       { display: "flex", alignItems: "center", gap: "6px", padding: "5px 10px", borderRadius: "10px", border: "1px solid #4ade8033", background: "#4ade800d", flexShrink: 0 },
  chipName:       { fontSize: "9px", color: "#4ade80", maxWidth: "80px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
  chipX:          { background: "none", border: "none", cursor: "pointer", color: "#6b6b78", fontSize: "10px", padding: "0 2px", lineHeight: 1 },

  // GitHub
  githubBtn:      { display: "flex", alignItems: "center", gap: "6px", padding: "6px 11px", borderRadius: "10px", border: "1px dashed #2a2a38", color: "#6b6b78", fontSize: "10px", letterSpacing: "0.08em", fontWeight: 500, cursor: "pointer", flexShrink: 0, fontFamily: "'DM Mono',monospace", background: "transparent", userSelect: "none" as const, transition: "all 0.2s" },
  githubBtnActive: { borderColor: "#818cf866", color: "#818cf8", background: "#818cf80a" },

  // Filter icon
  filterIcon:     { display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: "0 2px", cursor: "default" },

  // Pills horizontal scroll
  pillsScroll:    { display: "flex", alignItems: "center", gap: "4px", overflowX: "auto", overflowY: "hidden", flex: 1, minWidth: 0, scrollbarWidth: "none" as const, padding: "1px 0", transition: "outline 0.2s" },

  // All pill
  allPill:        { display: "flex", alignItems: "center", padding: "3px 9px", borderRadius: "6px", border: "1px solid #222230", background: "transparent", color: "#5a5a72", fontSize: "9px", fontFamily: "'DM Mono',monospace", cursor: "pointer", letterSpacing: "0.05em", flexShrink: 0, transition: "all 0.15s", whiteSpace: "nowrap" as const },
  allPillActive:  { borderColor: "#c9a84c66", background: "#c9a84c11", color: "#c9a84c" },
  loadingText:    { fontSize: "9px", color: "#3a3a48", fontFamily: "'DM Mono',monospace", flexShrink: 0 },

  // Source pill
  sourcePill:       { display: "inline-flex", alignItems: "stretch", borderRadius: "7px", border: "1px solid #1e1e2c", background: "transparent", flexShrink: 0, transition: "border-color 0.15s", overflow: "hidden" },
  sourcePillActive: { borderColor: "#c9a84c55", background: "#c9a84c08" },
  sourcePillNudge:  { borderColor: "#c9a84c44", background: "#c9a84c06" },

  // Sep
  sep:            { width: "1px", height: "20px", background: "#1e1e2a", flexShrink: 0 },

  // Mic
  micBtn:           { display: "flex", alignItems: "center", justifyContent: "center", width: "30px", height: "30px", borderRadius: "10px", border: "1px dashed #2a2a38", background: "transparent", color: "#6b6b78", cursor: "pointer", flexShrink: 0, transition: "all 0.2s" },
  micBtnActive:     { borderColor: "#f8717166", background: "#f871710d", color: "#f87171" },
  stopSqRed:        { display: "block", width: "9px", height: "9px", borderRadius: "2px", background: "#f87171" },
  transcribingPill: { display: "flex", alignItems: "center", padding: "4px 9px", borderRadius: "10px", border: "1px solid #c9a84c33", background: "#c9a84c0a", color: "#c9a84c", fontSize: "9px", fontFamily: "'DM Mono',monospace", flexShrink: 0, whiteSpace: "nowrap" as const },

  // Text input
  input:          { flex: 1, background: "transparent", border: "none", outline: "none", color: "#e0e0ec", fontSize: "13px", fontFamily: "'DM Sans','Segoe UI',sans-serif", letterSpacing: "0.01em", lineHeight: "1.5", minWidth: "80px" },

  // Send / stop
  sendBtn:        { display: "flex", alignItems: "center", justifyContent: "center", width: "36px", height: "36px", borderRadius: "11px", border: "none", background: "linear-gradient(135deg, #c9a84c 0%, #9a7228 100%)", color: "#08080a", cursor: "pointer", flexShrink: 0, boxShadow: "0 2px 16px #c9a84c44" },
  sendOff:        { opacity: 0.25, cursor: "not-allowed", boxShadow: "none" },
  stopBtn:        { display: "flex", alignItems: "center", justifyContent: "center", width: "36px", height: "36px", borderRadius: "11px", border: "1px solid #c9a84c44", background: "#c9a84c0a", cursor: "pointer", flexShrink: 0, transition: "background 0.2s" },
  stopSq:         { display: "block", width: "11px", height: "11px", borderRadius: "3px", background: "#c9a84c" },

  // Footer
  footer:         { display: "flex", justifyContent: "center" },
  footerText:     { fontSize: "10px", color: "#2e2e3c", letterSpacing: "0.05em", fontFamily: "'DM Mono',monospace" },
  kbd:            { padding: "1px 5px", borderRadius: "4px", border: "1px solid #222230", background: "#111118", color: "#4a4a58", fontSize: "9px" },

  // Tooltip
  tooltip: {
    position:      "absolute",
    bottom:        "calc(100% + 8px)",
    left:          "50%",
    transform:     "translateX(-50%)",
    background:    "#1a1a26",
    border:        "1px solid #2a2a38",
    borderRadius:  "8px",
    padding:       "5px 10px",
    fontSize:      "10px",
    color:         "#9a9ab0",
    fontFamily:    "'DM Mono',monospace",
    whiteSpace:    "nowrap" as const,
    zIndex:        100,
    letterSpacing: "0.03em",
    pointerEvents: "none" as const,
    boxShadow:     "0 4px 20px #00000066",
  },

  // Delete modal
  modalOverlay: { position: "fixed", inset: 0, background: "#000000aa", backdropFilter: "blur(5px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" },
  modal:        { background: "#0d0d14", border: "1px solid #2a2a3c", borderRadius: "20px", padding: "28px 26px 24px", maxWidth: "360px", width: "90vw", display: "flex", flexDirection: "column", alignItems: "center", gap: "14px", boxShadow: "0 32px 96px #000000dd" },
  modalIcon:    { width: "52px", height: "52px", borderRadius: "16px", background: "#f871710a", border: "1px solid #f8717130", display: "flex", alignItems: "center", justifyContent: "center" },
  modalTitle:   { fontSize: "16px", fontWeight: 600, color: "#e0e0ec", fontFamily: "'DM Sans',sans-serif" },
  modalSource:  { fontSize: "11px", color: "#c9a84c", fontFamily: "'DM Mono',monospace", background: "#c9a84c0a", border: "1px solid #c9a84c20", borderRadius: "8px", padding: "4px 14px", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
  modalWarning: { fontSize: "12px", color: "#5a5a70", fontFamily: "'DM Sans',sans-serif", lineHeight: "1.65", textAlign: "center" as const },
  modalActions: { display: "flex", gap: "10px", width: "100%", marginTop: "2px" },
  modalCancel:  { flex: 1, padding: "10px", borderRadius: "10px", border: "1px solid #222230", background: "transparent", color: "#6b6b78", fontSize: "12px", fontFamily: "'DM Mono',monospace", cursor: "pointer", letterSpacing: "0.04em", transition: "border-color 0.15s" },
  modalDelete:  { flex: 1, padding: "10px", borderRadius: "10px", border: "none", background: "#f8717118", color: "#f87171", fontSize: "12px", fontFamily: "'DM Mono',monospace", cursor: "pointer", letterSpacing: "0.04em", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px", transition: "background 0.2s" },
}