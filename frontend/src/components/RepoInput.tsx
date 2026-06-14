import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "lucide-react"
import { GithubIcon } from "./icons/GithubIcon"
import { cn } from "@/lib/utils"

interface Props {
  signedIn: boolean
  isIndexing: boolean
  onIndex: (url: string) => void
  onClose: () => void
  className?: string
}

function validateGithubUrl(url: string): string | null {
  if (!url.trim()) return "Please enter a GitHub URL"
  if (!url.includes("github.com")) return "Must be a GitHub URL"
  const match = url.match(/github\.com\/([^/]+)\/([^/\s]+)/)
  if (!match) return "Format: https://github.com/owner/repo"
  return null
}

export const RepoInput = ({ isIndexing, onIndex, onClose, className }: Props) => {
  const [url, setUrl] = useState("")
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = () => {
    const validationError = validateGithubUrl(url)
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)
    onIndex(url.trim())
  }

  return (
    <motion.div
      className={cn(
        "glass-panel flex flex-col gap-2.5 rounded-xl border border-border p-3.5",
        className
      )}
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={{ duration: 0.18 }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <GithubIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-mono text-[11px] tracking-wide text-muted-foreground">
            Index repository
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex gap-2">
        <input
          className={cn(
            "min-w-0 flex-1 rounded-lg border bg-white/60 px-3 py-2 font-mono text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-accent/50 focus:ring-1 focus:ring-accent/30 dark:bg-muted/50",
            error ? "border-destructive/60" : "border-input"
          )}
          type="text"
          placeholder="https://github.com/owner/repo"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value)
            setError(null)
          }}
          onKeyDown={(e) => e.key === "Enter" && !isIndexing && handleSubmit()}
          disabled={isIndexing}
          autoFocus
        />
        <motion.button
          type="button"
          onClick={handleSubmit}
          disabled={isIndexing || !url.trim()}
          className={cn(
            "shrink-0 rounded-lg bg-[linear-gradient(135deg,var(--accent),var(--brand-secondary))] px-4 py-2 font-mono text-[11px] font-semibold text-accent-foreground shadow-sm transition-opacity",
            (isIndexing || !url.trim()) && "cursor-not-allowed opacity-40"
          )}
          whileHover={!isIndexing && url.trim() ? { scale: 1.03 } : {}}
          whileTap={!isIndexing && url.trim() ? { scale: 0.97 } : {}}
        >
          {isIndexing ? (
            <motion.span
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ repeat: Infinity, duration: 0.8 }}
            >
              indexing…
            </motion.span>
          ) : (
            "Index"
          )}
        </motion.button>
      </div>

      <AnimatePresence>
        {error && (
          <motion.p
            className="font-mono text-[10px] text-destructive"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      {!error && (
        <p className="font-mono text-[9px] leading-relaxed text-muted-foreground/70">
          Public repos only · node_modules, dist and binaries are skipped
        </p>
      )}

      <AnimatePresence>
        {isIndexing && (
          <motion.div
            className="space-y-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="relative h-0.5 overflow-hidden rounded-full bg-muted">
              <motion.div
                className="absolute inset-y-0 w-2/5 bg-gradient-to-r from-transparent via-accent to-transparent"
                animate={{ x: ["-100%", "250%"] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>
            <p className="font-mono text-[9px] text-muted-foreground">
              Fetching files, chunking and embedding — this may take a minute…
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
