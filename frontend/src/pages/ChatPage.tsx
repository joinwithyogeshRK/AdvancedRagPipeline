import { useState, useRef, useEffect } from "react";
import axios from "axios";

const ChatPage = () => {
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [response, setResponse] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const streamRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollAnchor = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isStreaming) {
      scrollAnchor.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [response, isStreaming]);

  const stopStreaming = () => {
    if (streamRef.current) clearTimeout(streamRef.current);
    setIsStreaming(false);
  };

  const typewriterStream = (text: string) => {
    setIsStreaming(true);
    setResponse("");
    let i = 0;
    const type = () => {
      if (i < text.length) {
        setResponse(text.slice(0, i + 1));
        const delay = text[i] === "\n" ? 20 : text[i] === "." ? 25 : 5;
        i++;
        streamRef.current = setTimeout(type, delay);
      } else {
        setIsStreaming(false);
      }
    };
    type();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (selected.type !== "application/pdf") {
      alert("Only PDF files are allowed");
      return;
    }
    setFile(selected);
    setFileName(selected.name);
  };

  const removeFile = () => {
    setFile(null);
    setFileName("");
  };

  const handleSend = async () => {
    if (!message.trim() || isStreaming) return;
    const formData = new FormData();
    if (file) formData.append("File", file);
    formData.append("query", message);
    setMessage("");
    setIsStreaming(true);
    setResponse("");
    try {
      const res = await axios.post("http://localhost:3009/query", formData);
      const text = res.data?.text ?? JSON.stringify(res.data);
      typewriterStream(text);
    } catch {
      typewriterStream("Something went wrong. Please try again.");
    }
  };

  return (
    <div className="relative h-screen w-full overflow-hidden font-bold text-white">
      <img
        className="absolute inset-0 z-0 h-full object-cover"
        src="/bg.webp"
        alt=""
      />

      {/*
        SHELL — centres the widget in the viewport
      */}
      <div className="relative z-10 flex h-screen flex-col items-center justify-center px-4 py-6 sm:px-8">
        {/*
          CHAT WIDGET
          ───────────
          max-w-4xl  → matches the card's intended width
          w-full     → shrinks on smaller screens
          Both the card and input bar live here so they share
          the exact same horizontal boundaries automatically.
        */}
        <div className="flex w-full max-w-4xl flex-col gap-3">
          {/*
            RESPONSE CARD
            h-[700px]  fixed height, text scrolls inside
            w-full     fills the max-w-4xl wrapper — same as input bar
          */}
          <div className="flex h-[700px] w-full flex-col rounded-2xl border border-pink-400/30 bg-black/30 backdrop-blur-lg">
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <p className="min-h-[2rem] text-sm leading-relaxed whitespace-pre-wrap text-gray-200">
                {isStreaming && response === "" ? (
                  <span className="flex gap-1 pt-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:300ms]" />
                  </span>
                ) : response ? (
                  <>
                    {response}
                    {isStreaming && (
                      <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-gray-200" />
                    )}
                  </>
                ) : (
                  <span className="text-gray-500 italic">
                    Response will appear here…
                  </span>
                )}
              </p>
              <div ref={scrollAnchor} />
            </div>
          </div>

          {/*
            INPUT BAR
            w-full → fills the same max-w-4xl wrapper as the card above,
                     so left and right edges are perfectly aligned.
          */}
          <div className="w-full flex-shrink-0">
            <div className="flex items-center gap-3 rounded-3xl border border-pink-400 bg-black/30 p-3 backdrop-blur-lg">
              {!file ? (
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-gray-500 px-3 py-2 text-xs text-gray-400 transition-colors hover:border-pink-400 hover:text-pink-400">
                  <span className="text-lg">+</span> Attach PDF
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>
              ) : (
                <div className="flex items-center gap-2 rounded-xl border border-pink-400/40 bg-pink-400/10 px-3 py-2 text-xs text-pink-300">
                  <span className="max-w-[120px] truncate">{fileName}</span>
                  <button
                    onClick={removeFile}
                    className="text-gray-400 hover:text-pink-400"
                  >
                    ✕
                  </button>
                </div>
              )}

              <input
                className="flex-1 bg-transparent text-sm text-white placeholder-gray-400 focus:outline-none"
                type="text"
                placeholder="Ask anything about your PDF…"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && !isStreaming && handleSend()
                }
              />

              {isStreaming ? (
                <button
                  onClick={stopStreaming}
                  title="Stop streaming"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-pink-400 bg-black/40 transition hover:bg-pink-400/20"
                >
                  <span className="block h-3 w-3 rounded-sm bg-pink-400" />
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!message.trim()}
                  className="h-9 w-9 rounded-full bg-pink-400 p-2 transition hover:bg-pink-500 disabled:opacity-40"
                >
                  <img src="/arrow.png" className="h-full w-full" alt="Send" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
