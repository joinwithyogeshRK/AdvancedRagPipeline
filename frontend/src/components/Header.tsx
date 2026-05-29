import { motion } from "framer-motion"
import { Menu, Plus, Calculator } from "lucide-react"
import { Link } from "react-router-dom"
import { Show, UserButton } from "@clerk/react"
import { AuthSection } from "./AuthSection"
import { GithubOAuth } from "./GithubOAuth"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { getClerkAppearance } from "@/lib/clerk-appearance"
import { useTheme } from "@/context/theme"

interface Props {
  chatId: string | null
  file: File | null
  fileName: string
  onRemoveFile: () => void
  onNewChat: () => void
  onOpenSidebar: () => void
}

const iconBtn =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card/80 text-muted-foreground shadow-sm transition-colors hover:border-accent/50 hover:bg-white hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 dark:hover:bg-muted sm:h-9 sm:w-9"

export const Header = ({
  chatId,
  file,
  fileName,
  onRemoveFile,
  onNewChat,
  onOpenSidebar,
}: Props) => {
  const { theme } = useTheme()
  const clerkAppearance = getClerkAppearance(theme)

  return (
    <motion.header
      className="mb-1.5 flex shrink-0 flex-col gap-2 px-1 py-1.5 sm:mb-3 sm:gap-3 sm:px-2 sm:py-2.5 lg:mb-4 lg:px-3 lg:py-3"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <motion.button
            type="button"
            onClick={onOpenSidebar}
            className={iconBtn}
            whileTap={{ scale: 0.95 }}
            aria-label="Open chat history"
          >
            <Menu className="h-4 w-4" />
          </motion.button>

          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
            <div className="relative flex h-8 w-8 shrink-0 items-center justify-center sm:h-9 sm:w-9 lg:h-10 lg:w-10">
              <motion.div
                className="absolute inset-0 rounded-full border border-transparent border-t-accent border-r-[color:var(--brand-secondary)]/50"
                animate={{ rotate: 360 }}
                transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
              />
              <div className="h-3.5 w-3.5 rounded-full bg-[linear-gradient(135deg,var(--accent),var(--brand-secondary))] shadow-[0_0_18px_color-mix(in_srgb,var(--accent)_32%,transparent)] sm:h-4 sm:w-4 lg:h-[18px] lg:w-[18px]" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[11px] font-bold tracking-[0.2em] text-accent sm:text-xs sm:tracking-[0.24em] lg:text-sm lg:tracking-[0.28em]">
                ORACLE
              </div>
              <div className="hidden truncate text-[8px] tracking-[0.12em] text-muted-foreground sm:mt-0.5 md:block lg:text-[9px] lg:tracking-[0.14em]">
                RAG Intelligence Engine
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5 lg:gap-2">
          <motion.button
            type="button"
            onClick={onNewChat}
            className={iconBtn}
            whileTap={{ scale: 0.95 }}
            aria-label="New chat"
            title="New chat"
          >
            <Plus className="h-4 w-4" />
          </motion.button>

          <Link
            to="/"
            className={iconBtn}
            aria-label="Concrete mix design"
            title="Concrete mix design (IS 10262:2019)"
          >
            <Calculator className="h-4 w-4" />
          </Link>

          <ThemeToggle className="h-9 w-9" />

          <Show when="signed-in">
            <GithubOAuth />
            <UserButton
              appearance={{
                ...clerkAppearance,
                elements: {
                  ...clerkAppearance.elements,
                  userButtonAvatarBox: { width: 32, height: 32 },
                },
              }}
            />
          </Show>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {chatId && (
            <span className="rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 font-mono text-[9px] tracking-wider text-accent/80 shadow-sm sm:px-2.5 sm:py-1 sm:text-[10px]">
              #{chatId.slice(0, 8)}
            </span>
          )}
          {file && (
            <span className="flex max-w-[120px] items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 sm:max-w-[140px] sm:px-2.5 sm:py-1">
              <span className="truncate font-mono text-[9px] text-success sm:text-[10px]">
                {fileName}
              </span>
              <button
                type="button"
                onClick={onRemoveFile}
                className="shrink-0 text-muted-foreground hover:text-foreground"
                aria-label="Remove file"
              >
                ×
              </button>
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
          <AuthSection />
        </div>
      </div>
    </motion.header>
  )
}
