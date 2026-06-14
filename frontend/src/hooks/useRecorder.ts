// frontend/src/hooks/useRecorder.ts
import { useRef, useState, useCallback, useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_URL as string;
const MIC_BLOCKED_MESSAGE =
  "Microphone is blocked. Enable it from the browser site settings, then click the mic again.";

interface UseRecorderOptions {
  /** Called with the transcript text when AssemblyAI finishes */
  onTranscript: (text: string) => void;
  /** Clerk session token getter — pass () => getToken() from useAuth() */
  getToken: () => Promise<string | null>;
}

export function useRecorder({ onTranscript, getToken }: UseRecorderOptions) {
  const [isRecording,    setIsRecording]    = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recError,       setRecError]       = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef        = useRef<Blob[]>([]);
  const streamRef        = useRef<MediaStream | null>(null);
  const errorTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRecorderError = useCallback(() => {
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
    setRecError(null);
  }, []);

  const showRecorderError = useCallback((message: string, duration = 5000) => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    setRecError(message);
    errorTimerRef.current = setTimeout(() => {
      setRecError(null);
      errorTimerRef.current = null;
    }, duration);
  }, []);

  useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  const startRecording = useCallback(async () => {
    clearRecorderError();
    try {
      const permission = await navigator.permissions
        ?.query({ name: "microphone" as PermissionName })
        .catch(() => null);

      if (permission?.state === "denied") {
        showRecorderError(MIC_BLOCKED_MESSAGE, 9000);
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Prefer webm/opus; fall back to whatever the browser supports
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        // Stop mic immediately
        streamRef.current?.getTracks().forEach((t) => t.stop());

        const blob = new Blob(chunksRef.current, {
          type: mimeType || "audio/webm",
        });

        setIsTranscribing(true);
        try {
          const token = await getToken();
          const form  = new FormData();
          form.append("audio", blob, "recording.webm");

          const res = await fetch(`${API_BASE}/transcribe`, {
            method:  "POST",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body:    form,
          });

          if (!res.ok) {
            const { error } = await res.json().catch(() => ({ error: "Unknown error" }));
            throw new Error(error ?? `HTTP ${res.status}`);
          }

          const { text } = (await res.json()) as { text: string };
          onTranscript(text);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Transcription failed";
          showRecorderError(msg);
          console.error("[useRecorder]", err);
        } finally {
          setIsTranscribing(false);
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (err) {
      const msg =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? MIC_BLOCKED_MESSAGE
          : err instanceof Error
            ? err.message
            : "Microphone access denied";
      showRecorderError(msg, msg === MIC_BLOCKED_MESSAGE ? 9000 : 5000);
      console.error("[useRecorder]", err);
    }
  }, [clearRecorderError, onTranscript, getToken, showRecorderError]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  return {
    isRecording,
    isTranscribing,
    recError,
    startRecording,
    stopRecording,
    clearRecorderError,
  };
}
