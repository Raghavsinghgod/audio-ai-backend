import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  Check,
  Copy,
  FileAudio,
  LoaderCircle,
  Mic,
  Send,
  Square,
  Upload,
} from "lucide-react";

/* The FastAPI backend this demo talks to. Override with VITE_API_URL, e.g.
   "http://localhost:8000". The demo falls back to a clearly-labeled
   simulated mode when the backend is unreachable (e.g. inside a preview). */
const API_BASE = (
  (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000"
).replace(/\/+$/, "");

type Mode = "checking" | "live" | "demo";
type Tab = "transcribe" | "ask" | "chat";
type ChatMessage = { role: "user" | "assistant"; content: string };

const SIMULATED_TRANSCRIPT = {
  text: "This is a simulated transcript. The FastAPI backend isn't reachable from this preview — start it locally and the demo switches to live mode automatically.",
  language: "en",
  duration: 2.4,
  segments: [
    { start: 0.0, end: 1.2, text: "This is a simulated transcript." },
    { start: 1.2, end: 2.4, text: "Start the backend to go live." },
  ],
};

function pickMime(): string | null {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  return candidates.find((mime) => MediaRecorder.isTypeSupported(mime)) ?? null;
}

function nameFor(mime: string): string {
  if (mime.includes("ogg")) return "recording.ogg";
  if (mime.includes("mp4") || mime.includes("aac")) return "recording.m4a";
  if (mime.includes("wav")) return "recording.wav";
  return "recording.webm";
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function ApiDemo() {
  const [mode, setMode] = useState<Mode>("checking");
  const [tab, setTab] = useState<Tab>("transcribe");

  const [recording, setRecording] = useState(false);
  const [micBlocked, setMicBlocked] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedName, setRecordedName] = useState<string>("");
  const [pickedFile, setPickedFile] = useState<File | null>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transcribeResult, setTranscribeResult] = useState<unknown>(null);
  const [askResult, setAskResult] = useState<unknown>(null);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [copied, setCopied] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  /* Probe the backend once — if it answers, the demo goes live. */
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    fetch(`${API_BASE}/`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then(() => setMode("live"))
      .catch(() => setMode("demo"))
      .finally(() => clearTimeout(timer));
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat]);

  const hasAudio = Boolean(recordedBlob || pickedFile);

  const startRecording = async () => {
    setMicBlocked(false);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime();
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      } catch {
        recorder = new MediaRecorder(stream);
      }
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || mime || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        setRecordedBlob(blob);
        setRecordedName(nameFor(type));
        setPickedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      setMicBlocked(true);
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
  };

  const handleFile = (file: File | null) => {
    setPickedFile(file);
    setRecordedBlob(null);
    setError(null);
  };

  const audioFormData = (): FormData | null => {
    const form = new FormData();
    if (recordedBlob) form.append("file", recordedBlob, recordedName);
    else if (pickedFile) form.append("file", pickedFile, pickedFile.name);
    else return null;
    return form;
  };

  /* POST to the backend; throw a readable error on non-2xx. */
  const post = async (path: string, body: FormData | string, isJson: boolean) => {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      body,
      headers: isJson ? { "Content-Type": "application/json" } : undefined,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const detail =
        json && json.detail
          ? typeof json.detail === "string"
            ? json.detail
            : JSON.stringify(json.detail)
          : `${res.status} ${res.statusText}`;
      throw new Error(detail);
    }
    return json;
  };

  const runTranscribe = async () => {
    const form = audioFormData();
    if (!form) {
      setError("Record or upload an audio file first.");
      return;
    }
    setBusy("transcribe");
    setError(null);
    if (mode === "demo") {
      await delay(1100);
      setTranscribeResult(SIMULATED_TRANSCRIPT);
      setBusy(null);
      return;
    }
    try {
      setTranscribeResult(await post("/transcribe", form, false));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transcription failed.");
    } finally {
      setBusy(null);
    }
  };

  const runAsk = async () => {
    const form = audioFormData();
    if (!form) {
      setError("Record or upload an audio file first.");
      return;
    }
    const prompt = systemPrompt.trim();
    if (prompt) form.append("system_prompt", prompt);
    setBusy("ask");
    setError(null);
    if (mode === "demo") {
      await delay(1500);
      setAskResult({
        transcript: SIMULATED_TRANSCRIPT.text,
        answer:
          "Mock answer — simulated because the backend isn't reachable here. Start it locally " +
          "(`uvicorn app.main:app`) and this demo goes live automatically.",
      });
      setBusy(null);
      return;
    }
    try {
      setAskResult(await post("/ask-audio", form, false));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setBusy(null);
    }
  };

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || busy === "chat") return;
    const history: ChatMessage[] = [...chat, { role: "user", content: text }];
    setChat(history);
    setChatInput("");
    setBusy("chat");
    setError(null);
    if (mode === "demo") {
      await delay(900);
      setChat([...history, { role: "assistant", content: `Mock answer — simulated mode. You said: “${text}”` }]);
      setBusy(null);
      return;
    }
    try {
      const json = await post("/chat", JSON.stringify({ messages: history }), true);
      setChat([...history, { role: "assistant", content: json.answer }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setBusy(null);
    }
  };

  const copyJson = async (value: unknown) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable */
    }
  };

  const audioLabel = recordedBlob
    ? `${recordedName} · ${Math.max(1, Math.round(recordedBlob.size / 1024))} KB`
    : pickedFile
      ? `${pickedFile.name} · ${Math.max(1, Math.round(pickedFile.size / 1024))} KB`
      : "No audio selected.";

  return (
    <div className="w-full overflow-hidden rounded-xl border border-neutral-200 bg-white text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50">
      {/* Status strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-5 py-3 dark:border-neutral-800">
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`inline-flex h-2 w-2 rounded-full ${
              mode === "live"
                ? "bg-emerald-500"
                : mode === "checking"
                  ? "animate-pulse bg-neutral-400"
                  : "bg-amber-500"
            }`}
          />
          {mode === "checking" && <span className="text-neutral-500">Probing backend…</span>}
          {mode === "live" && (
            <span className="font-medium text-emerald-700 dark:text-emerald-400">Live backend</span>
          )}
          {mode === "demo" && (
            <span className="font-medium text-amber-700 dark:text-amber-400">
              Demo mode — simulated
            </span>
          )}
        </div>
        <code className="font-mono text-[11px] text-neutral-400">{API_BASE}</code>
      </div>

      {mode === "demo" && (
        <p className="border-b border-neutral-200 bg-neutral-50 px-5 py-2.5 text-xs leading-5 text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
          The FastAPI backend isn&apos;t reachable from this preview, so responses are simulated.
          Run{" "}
          <code className="font-mono text-[11px]">uvicorn app.main:app</code> locally (or set{" "}
          <code className="font-mono text-[11px]">VITE_API_URL</code>) and this demo goes live.
        </p>
      )}

      <div className="p-5 sm:p-6">
        {/* Shared audio capture */}
        <div className="flex flex-col gap-3 border-b border-neutral-200 pb-6 dark:border-neutral-800">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
            Step 1 · Audio
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              size="sm"
              variant={recording ? "destructive" : "default"}
              className="gap-2"
              onClick={recording ? stopRecording : startRecording}
            >
              {recording ? <Square className="size-3.5 fill-current" /> : <Mic className="size-3.5" />}
              {recording ? "Stop recording" : "Record"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="size-3.5" />
              Upload file
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp3,.wav,.m4a,.aac,.ogg,.oga,.opus,.flac,.webm,.mp4,audio/*"
              className="hidden"
              onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
            />
            <span className="font-mono text-xs text-neutral-500">{audioLabel}</span>
          </div>
          {micBlocked && (
            <p className="flex items-center gap-1.5 text-xs text-neutral-500">
              <AlertCircle className="size-3.5 shrink-0" />
              Microphone unavailable (permissions or browser support). Upload a file instead.
            </p>
          )}
        </div>

        {/* Tabs */}
        <div className="mt-6 flex gap-1 border-b border-neutral-200 dark:border-neutral-800">
          {(
            [
              ["transcribe", "Transcribe"],
              ["ask", "Ask audio"],
              ["chat", "Chat"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`-mb-px cursor-pointer border-b-2 px-3 py-2 text-sm transition-colors ${
                tab === key
                  ? "border-neutral-900 font-medium text-neutral-900 dark:border-neutral-50 dark:text-neutral-50"
                  : "border-transparent text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Step 2 area */}
        <div className="pt-6">
          {tab === "transcribe" && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                Step 2 · <span className="text-neutral-600 dark:text-neutral-300">Transcribe</span>
              </p>
              <p className="mt-1 text-sm text-neutral-500">
                Send the audio to <code className="font-mono text-xs">POST /transcribe</code> and get{" "}
                <code className="font-mono text-xs">text · language · duration · segments</code>.
              </p>
              <div className="mt-4 flex items-center gap-3">
                <Button type="button" size="sm" className="gap-2" onClick={runTranscribe} disabled={busy !== null}>
                  {busy === "transcribe" ? <LoaderCircle className="size-3.5 animate-spin" /> : <FileAudio className="size-3.5" />}
                  Transcribe
                </Button>
                {!hasAudio && <span className="text-xs text-neutral-400">Record or upload first ↑</span>}
              </div>
              {transcribeResult && (
                <ResultBlock label="Transcript" value={transcribeResult} onCopy={copyJson} copied={copied} />
              )}
            </div>
          )}

          {tab === "ask" && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                Step 2 · <span className="text-neutral-600 dark:text-neutral-300">Ask audio</span>
              </p>
              <p className="mt-1 text-sm text-neutral-500">
                Transcribe, then send the transcript to the LLM via{" "}
                <code className="font-mono text-xs">POST /ask-audio</code>.
              </p>
              <label className="mt-4 block text-xs font-medium text-neutral-500">
                System prompt <span className="font-normal text-neutral-400">(optional)</span>
              </label>
              <textarea
                value={systemPrompt}
                onChange={(event) => setSystemPrompt(event.target.value)}
                rows={2}
                placeholder="You are a concise, helpful assistant. Respond directly to the user's spoken message."
                className="mt-1.5 w-full resize-y rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-950"
              />
              <div className="mt-4 flex items-center gap-3">
                <Button type="button" size="sm" className="gap-2" onClick={runAsk} disabled={busy !== null}>
                  {busy === "ask" ? <LoaderCircle className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                  Transcribe + ask
                </Button>
                {!hasAudio && <span className="text-xs text-neutral-400">Record or upload first ↑</span>}
              </div>
              {askResult && (
                <ResultBlock label="Transcript + answer" value={askResult} onCopy={copyJson} copied={copied} />
              )}
            </div>
          )}

          {tab === "chat" && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                <span className="text-neutral-600 dark:text-neutral-300">Chat</span>
              </p>
              <p className="mt-1 text-sm text-neutral-500">
                JSON chat straight to the LLM — <code className="font-mono text-xs">POST /chat</code>.
                No audio needed.
              </p>
              <div className="mt-4 max-h-72 space-y-3 overflow-y-auto rounded-md border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
                {chat.length === 0 && (
                  <p className="text-xs text-neutral-400">
                    Send a message to start the conversation.
                  </p>
                )}
                {chat.map((message, index) => (
                  <div key={index} className={`max-w-[85%] ${message.role === "user" ? "ml-auto" : ""}`}>
                    <div
                      className={`rounded-lg px-3.5 py-2 text-sm leading-6 whitespace-pre-wrap ${
                        message.role === "user"
                          ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                          : "border border-neutral-200 bg-white text-neutral-800 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                      }`}
                    >
                      {message.content}
                    </div>
                  </div>
                ))}
                {busy === "chat" && (
                  <div className="flex items-center gap-2 text-xs text-neutral-400">
                    <LoaderCircle className="size-3.5 animate-spin" /> Waiting for the LLM…
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") sendChat();
                  }}
                  placeholder="Message the LLM…"
                  className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-950"
                />
                <Button
                  type="button"
                  size="sm"
                  className="gap-2 shrink-0"
                  onClick={sendChat}
                  disabled={busy === "chat" || !chatInput.trim()}
                >
                  <Send className="size-3.5" />
                  Send
                </Button>
              </div>
            </div>
          )}

          {error && (
            <p className="mt-4 flex items-start gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultBlock({
  label,
  value,
  onCopy,
  copied,
}: {
  label: string;
  value: unknown;
  onCopy: (value: unknown) => void;
  copied: boolean;
}) {
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
          {label}
        </p>
        <button
          type="button"
          onClick={() => onCopy(value)}
          className="flex cursor-pointer items-center gap-1 text-[11px] text-neutral-400 transition-colors hover:text-neutral-700 dark:hover:text-neutral-200"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? "copied" : "copy JSON"}
        </button>
      </div>
      <pre className="mt-2 max-h-80 overflow-auto rounded-md border border-neutral-200 bg-neutral-50 p-4 font-mono text-xs leading-6 text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
