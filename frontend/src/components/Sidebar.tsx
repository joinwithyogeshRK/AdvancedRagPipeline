import { motion, AnimatePresence } from "framer-motion"
import { Check, MessageSquare, MoreHorizontal, PanelLeftClose, Pencil, Plus, Trash2, X } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"

interface Chat {
  id: string
  title: string
  created_at: string
}

interface Props {
  open: boolean
  mode?: "overlay" | "docked"
  chats: Chat[]
  activeChatId: string | null
  loading: boolean
  onClose: () => void
  onNewChat: () => void
  onSelectChat: (id: string) => void
  onDeleteChat: (id: string, e: React.MouseEvent) => void
  onRenameChat: (id: string, title: string) => Promise<void>
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

export const Sidebar = ({
  open,
  mode = "overlay",
  chats,
  activeChatId,
  loading,
  onClose,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  onRenameChat,
}: Props) => {
  const [editingChatId, setEditingChatId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState("")
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  const beginRename = (chat: Chat, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingChatId(chat.id)
    setDraftTitle(chat.title)
    setOpenMenuId(null)
  }

  const saveRename = async (chatId: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    const title = draftTitle.trim()
    if (!title) return
    await onRenameChat(chatId, title)
    setEditingChatId(null)
    setDraftTitle("")
  }

  const cancelRename = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    setEditingChatId(null)
    setDraftTitle("")
  }

  const aside = (
    <motion.aside
      className={cn(
        "glass-panel z-20 flex w-[min(320px,88vw)] shrink-0 flex-col border-r border-border",
        mode === "overlay" ? "fixed bottom-0 left-0 top-0" : "relative h-full w-[300px] shadow-none"
      )}
      initial={mode === "overlay" ? { x: -320 } : { opacity: 0, width: 0 }}
      animate={mode === "overlay" ? { x: 0 } : { opacity: 1, width: 300 }}
      exit={mode === "overlay" ? { x: -320 } : { opacity: 0, width: 0 }}
      transition={{ type: "spring", damping: 28, stiffness: 260 }}
    >
      <div className="flex items-center justify-between border-b border-border/80 px-4 py-5">
        <div className="min-w-0">
          <div className="truncate text-sm font-extrabold tracking-wide text-foreground">
            Oracle
          </div>
          <div className="mt-0.5 font-mono text-[9px] font-semibold tracking-[0.2em] text-accent/75">
            CHATS
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-border bg-card/70 p-2 text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground"
          aria-label={mode === "overlay" ? "Close sidebar" : "Hide chat history"}
          title={mode === "overlay" ? "Close sidebar" : "Hide chat history"}
        >
          {mode === "overlay" ? (
            <X className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>

          <button
            type="button"
            onClick={() => {
              onNewChat()
              onClose()
            }}
            className="mx-3 mt-3 flex items-center gap-2 rounded-xl border border-dashed border-accent/25 bg-accent/5 px-3.5 py-2.5 font-mono text-[10px] font-extrabold tracking-wider text-accent/80 transition-colors hover:border-accent/45 hover:bg-accent/10 hover:text-accent"
          >
            <Plus className="h-3 w-3" />
            NEW CHAT
          </button>

          <div className="mx-3 my-3 h-px bg-border" />

          <div className="scrollbar-thin flex-1 overflow-y-auto px-2 pb-4">
            {loading ? (
              <div className="flex flex-col gap-2 p-2">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="h-14 rounded-xl bg-muted"
                    animate={{ opacity: [0.3, 0.7, 0.3] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                  />
                ))}
              </div>
            ) : chats.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-muted-foreground">
                No previous chats
              </p>
            ) : (
              chats.map((chat) => (
                <motion.div
                  key={chat.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectChat(chat.id)}
                  onKeyDown={(e) => e.key === "Enter" && onSelectChat(chat.id)}
                  className={cn(
                    "relative mb-1 cursor-pointer rounded-xl border px-3 py-2.5 transition-colors hover:border-border hover:bg-white/55 dark:hover:bg-muted",
                    activeChatId === chat.id
                      ? "border-accent/25 bg-accent/10 shadow-sm"
                      : "border-transparent"
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                    {editingChatId === chat.id ? (
                      <div className="min-w-0 flex-1">
                        <input
                          value={draftTitle}
                          onChange={(e) => setDraftTitle(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void saveRename(chat.id)
                            if (e.key === "Escape") cancelRename()
                          }}
                          className="h-8 w-full rounded-lg border border-accent/35 bg-background px-2 text-sm font-semibold text-foreground outline-none ring-2 ring-accent/10"
                          autoFocus
                          maxLength={80}
                        />
                        <div className="mt-1 flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => void saveRename(chat.id, e)}
                            className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-accent-foreground transition-opacity hover:opacity-90"
                            aria-label="Save chat name"
                            title="Save"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={cancelRename}
                            className="flex h-6 w-6 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            aria-label="Cancel rename"
                            title="Cancel"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold leading-snug text-foreground">
                          {chat.title}
                        </p>
                        <p className="mt-1 font-mono text-[10px] font-semibold text-muted-foreground/75">
                          {formatDate(chat.created_at)}
                        </p>
                      </div>
                    )}
                    {editingChatId !== chat.id && (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenMenuId((id) => (id === chat.id ? null : chat.id))
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/55 transition-colors hover:bg-muted hover:text-foreground"
                          aria-label="Chat actions"
                          aria-expanded={openMenuId === chat.id}
                          title="Chat actions"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                        <AnimatePresence>
                          {openMenuId === chat.id && (
                            <motion.div
                              className="absolute right-0 top-full z-30 mt-1 w-36 overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-float)]"
                              initial={{ opacity: 0, y: -4, scale: 0.98 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: -4, scale: 0.98 }}
                              transition={{ duration: 0.14 }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={(e) => beginRename(chat, e)}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-muted"
                              >
                                <Pencil className="h-3.5 w-3.5 text-accent" />
                                Rename
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  setOpenMenuId(null)
                                  onDeleteChat(chat.id, e)
                                }}
                                className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Delete
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>
                  {activeChatId === chat.id && (
                    <div className="absolute bottom-[20%] left-0 top-[20%] w-0.5 rounded-r bg-accent" />
                  )}
                </motion.div>
              ))
            )}
          </div>
    </motion.aside>
  )

  return (
    <AnimatePresence>
      {open && (
        <>
          {mode === "overlay" && (
            <motion.div
              className="fixed inset-0 z-10 bg-black/40 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
            />
          )}
          {aside}
        </>
      )}
    </AnimatePresence>
  )
}
