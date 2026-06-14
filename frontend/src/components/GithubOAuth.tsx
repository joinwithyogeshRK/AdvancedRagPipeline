import { useCallback, useEffect, useState } from "react"
import { motion } from "framer-motion"
import { GithubIcon } from "./icons/GithubIcon"
import { useAuth } from "@clerk/react"
import { useSearchParams } from "react-router-dom"
import { cn } from "@/lib/utils"

const API = import.meta.env.VITE_API_URL ?? "http://localhost:3009"

export function GithubOAuth() {
  const { isSignedIn, getToken } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [connected, setConnected] = useState(false)
  const [githubLogin, setGithubLogin] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [statusLoading, setStatusLoading] = useState(true)
  const [banner, setBanner] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    if (!isSignedIn) {
      setStatusLoading(false)
      return
    }
    setStatusLoading(true)
    try {
      const token = await getToken()
      if (!token) {
        setConnected(false)
        setGithubLogin(null)
        return
      }
      const res = await fetch(`${API}/auth/github/status`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        setConnected(false)
        setGithubLogin(null)
        return
      }
      const data = (await res.json()) as {
        connected?: boolean
        githubLogin?: string | null
      }
      setConnected(Boolean(data.connected))
      setGithubLogin(data.githubLogin ?? null)
    } catch {
      setConnected(false)
      setGithubLogin(null)
    } finally {
      setStatusLoading(false)
    }
  }, [getToken, isSignedIn])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  useEffect(() => {
    const gh = searchParams.get("github")
    const ghErr = searchParams.get("github_error")
    if (gh === "connected") {
      setBanner("GitHub connected")
      void loadStatus()
    } else if (ghErr) {
      const labels: Record<string, string> = {
        access_denied: "GitHub authorization cancelled",
        invalid_state: "GitHub sign-in expired — try again",
        token_exchange_failed: "Could not complete GitHub sign-in",
        missing_code_or_state: "GitHub sign-in incomplete",
        oauth_error: "GitHub sign-in failed",
      }
      setBanner(labels[ghErr] ?? "GitHub sign-in failed")
    }
    if (gh || ghErr) {
      const next = new URLSearchParams(searchParams)
      next.delete("github")
      next.delete("github_error")
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams, loadStatus])

  useEffect(() => {
    if (!banner) return
    const t = window.setTimeout(() => setBanner(null), 5000)
    return () => window.clearTimeout(t)
  }, [banner])

  const startGithubAuth = async () => {
    if (!isSignedIn || busy) return
    setBusy(true)
    try {
      const token = await getToken()
      if (!token) {
        setBanner("Sign in required")
        setBusy(false)
        return
      }
      const res = await fetch(`${API}/auth/github/start`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = (await res.json().catch(() => ({}))) as {
        url?: string
        error?: string
      }
      if (!res.ok || !data.url) {
        setBanner(
          typeof data.error === "string" ? data.error : "GitHub is not configured"
        )
        setBusy(false)
        return
      }
      window.location.assign(data.url)
    } catch {
      setBanner("Could not start GitHub sign-in")
      setBusy(false)
    }
  }

  if (!isSignedIn) return null

  const title = connected
    ? githubLogin
      ? `GitHub connected as @${githubLogin} — click to reconnect`
      : "GitHub connected — click to reconnect"
    : "Connect GitHub"

  return (
    <div className="relative flex items-center">
      {banner && (
        <motion.div
          className="absolute right-0 top-full z-20 mt-1.5 whitespace-nowrap rounded-lg border border-accent/30 bg-card px-2.5 py-1.5 font-mono text-[10px] tracking-wide text-accent shadow-lg"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {banner}
        </motion.div>
      )}
      <motion.button
        type="button"
        className={cn(
          "relative flex h-9 w-9 items-center justify-center rounded-lg border bg-card transition-colors",
          connected
            ? "border-accent/40 text-accent shadow-sm hover:bg-white dark:hover:bg-muted"
            : "border-border text-muted-foreground shadow-sm hover:border-accent/50 hover:bg-white hover:text-accent dark:hover:bg-muted"
        )}
        onClick={() => void startGithubAuth()}
        disabled={busy || statusLoading}
        title={title}
        whileTap={{ scale: 0.95 }}
        aria-label={title}
      >
        {busy || statusLoading ? (
          <span className="text-xs text-muted-foreground">…</span>
        ) : (
          <GithubIcon className="h-4 w-4" />
        )}
        {connected && !busy && (
          <span
            className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_6px_color-mix(in_srgb,var(--success)_50%,transparent)]"
            aria-hidden
          />
        )}
      </motion.button>
    </div>
  )
}
