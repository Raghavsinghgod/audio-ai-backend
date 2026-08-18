import { motion } from "framer-motion";
import { ArrowRight, FileAudio, MessageSquare, Mic, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import ApiDemo from "@/components/ApiDemo";

const fadeUp = {
  initial: { opacity: 0, y: 14 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
};

const endpoints = [
  {
    method: "POST",
    path: "/transcribe",
    name: "Audio → transcript",
    description:
      "Upload an audio file and get back text, language, duration, and timed segments as JSON. The core of the ChatGPT-style voice flow.",
    curl: `curl -F "file=@sample.mp3" \\
  http://localhost:8000/transcribe`,
  },
  {
    method: "POST",
    path: "/ask-audio",
    name: "Audio → transcript → AI answer",
    description:
      "Transcribe the audio, then send the transcript to an LLM with an optional system prompt. Returns transcript and answer.",
    curl: `curl -F "file=@sample.mp3" \\
  -F "system_prompt=Answer in one sentence" \\
  http://localhost:8000/ask-audio`,
  },
  {
    method: "POST",
    path: "/chat",
    name: "Messages → AI answer",
    description:
      "Send JSON chat messages straight to the LLM. Works without an API key too — the API answers in a clearly-labeled mock mode.",
    curl: `curl -X POST http://localhost:8000/chat \\
  -H "Content-Type: application/json" \\
  -d '{"messages":[{"role":"user","content":"hi"}]}'`,
  },
];

const features = [
  {
    title: "Loaded once",
    body: "The Whisper model is loaded a single time at server startup and reused for every request. No per-call model downloads.",
  },
  {
    title: "Cleanup guaranteed",
    body: "Uploads are written to temporary files and always deleted — even when transcription fails — via a try/finally pattern.",
  },
  {
    title: "Errors, mapped",
    body: "Every failure mode maps to a precise status: 400 bad input, 413 oversized, 415 unsupported format, 500 server fault, 502 upstream LLM fault.",
  },
  {
    title: "Mock mode",
    body: "No OPENAI_API_KEY? The LLM endpoints still answer with clear mock responses, so the API is testable before you wire up a key.",
  },
  {
    title: "CORS ready",
    body: "Configurable origins (CORS_ORIGINS) so any frontend — this landing page included — can call the API from the browser.",
  },
  {
    title: "Env-driven",
    body: "WHISPER_MODEL, DEVICE, MAX_UPLOAD_SIZE_MB, CORS_ORIGINS, OPENAI_API_KEY — configure, don't edit code.",
  },
];

const runSteps = [
  "python3 -m venv .venv && source .venv/bin/activate",
  "pip install -r requirements.txt",
  "cp env.example .env        # optional",
  "uvicorn app.main:app --reload",
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <a href="#top" className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-full bg-foreground text-background">
              <Waves className="size-3.5" />
            </span>
            <span className="text-sm font-semibold tracking-tight">Aural</span>
            <span className="hidden rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground sm:inline">
              audio-to-text api
            </span>
          </a>
          <div className="flex items-center gap-1 sm:gap-2">
            {[
              ["Demo", "#demo"],
              ["Endpoints", "#endpoints"],
              ["Features", "#features"],
              ["Run it", "#run"],
            ].map(([label, href]) => (
              <a
                key={href}
                href={href}
                className="hidden rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground md:inline-block"
              >
                {label}
              </a>
            ))}
            <Button asChild variant="outline" size="sm" className="ml-1 cursor-pointer">
              <a href="/auth">Sign in</a>
            </Button>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section id="top" className="mx-auto max-w-6xl px-6 pt-20 pb-16 sm:pt-28 sm:pb-20">
        <motion.div {...fadeUp}>
          <p className="font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
            FastAPI · faster-whisper · OpenAI-ready
          </p>
          <h1 className="mt-5 max-w-3xl text-5xl font-semibold tracking-tight text-balance sm:text-6xl md:text-7xl">
            Voice in.
            <br />
            Text out. Answers
            <br />
            on request.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
            A backend-only audio-to-text API for the ChatGPT-style voice flow. Upload audio, get a
            transcript, optionally get an AI answer — self-hosted, env-configured, and testable
            right here in the browser.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="cursor-pointer gap-2">
              <a href="#demo">
                Try the live demo <ArrowRight className="size-4" />
              </a>
            </Button>
            <Button asChild variant="outline" size="lg" className="cursor-pointer">
              <a href="#endpoints">See the endpoints</a>
            </Button>
          </div>
        </motion.div>

        <motion.dl
          {...fadeUp}
          transition={{ duration: 0.55, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="mt-16 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4"
        >
          {[
            ["3", "endpoints"],
            ["9", "audio formats"],
            ["25 MB", "max upload"],
            ["0", "SaaS lock-in"],
          ].map(([value, label]) => (
            <div key={label} className="bg-background px-5 py-4">
              <dd className="font-mono text-xl font-medium tracking-tight">{value}</dd>
              <dt className="mt-0.5 text-xs text-muted-foreground">{label}</dt>
            </div>
          ))}
        </motion.dl>
      </section>

      {/* Demo */}
      <section id="demo" className="scroll-mt-20 border-t border-border bg-muted/40">
        <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <motion.div {...fadeUp} className="mx-auto max-w-2xl text-center">
            <p className="font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
              Live playground
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Test the API without leaving this page
            </h2>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Record or upload audio, transcribe it, ask a follow-up, or chat directly. The
              playground calls the running backend from your browser — and falls back to a
              clearly-labeled simulated mode when it isn&apos;t reachable.
            </p>
          </motion.div>
          <motion.div {...fadeUp} transition={{ duration: 0.55, delay: 0.1, ease: [0.22, 1, 0.36, 1] }} className="mt-10">
            <ApiDemo />
          </motion.div>
        </div>
      </section>

      {/* Endpoints */}
      <section id="endpoints" className="scroll-mt-20 mx-auto max-w-6xl px-6 py-16 sm:py-24">
        <motion.div {...fadeUp}>
          <p className="font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
            API reference
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Three endpoints. No ceremony.
          </h2>
        </motion.div>
        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {endpoints.map((endpoint, index) => (
            <motion.article
              key={endpoint.path}
              {...fadeUp}
              transition={{ duration: 0.5, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col rounded-xl border border-border bg-background p-6"
            >
              <div className="flex items-center gap-2.5">
                <span className="rounded-md bg-foreground px-2 py-1 font-mono text-[10px] font-semibold tracking-wider text-background">
                  {endpoint.method}
                </span>
                <code className="font-mono text-sm font-medium">{endpoint.path}</code>
              </div>
              <h3 className="mt-4 flex items-center gap-2 text-base font-semibold tracking-tight">
                {index === 0 && <FileAudio className="size-4 text-muted-foreground" />}
                {index === 1 && <Mic className="size-4 text-muted-foreground" />}
                {index === 2 && <MessageSquare className="size-4 text-muted-foreground" />}
                {endpoint.name}
              </h3>
              <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">
                {endpoint.description}
              </p>
              <pre className="mt-5 overflow-x-auto rounded-lg border border-border bg-muted/50 p-4 font-mono text-[11px] leading-5 text-foreground/90">
                {endpoint.curl}
              </pre>
            </motion.article>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-20 border-t border-border bg-muted/40">
        <div className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
          <motion.div {...fadeUp}>
            <p className="font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
              Design decisions
            </p>
            <h2 className="mt-3 max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Built to be boring in exactly the right ways
            </h2>
          </motion.div>
          <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                {...fadeUp}
                transition={{ duration: 0.5, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
                className="bg-background p-6"
              >
                <h3 className="text-sm font-semibold tracking-tight">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Run it */}
      <section id="run" className="scroll-mt-20 mx-auto max-w-6xl px-6 py-16 sm:py-24">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <motion.div {...fadeUp}>
            <p className="font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
              Self-hosted
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Running locally takes three commands
            </h2>
            <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">
              Clone the repo, install the requirements, start uvicorn. Then open{" "}
              <code className="rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-xs">
                http://localhost:8000/playground
              </code>{" "}
              — the same playground you used above, served by the API itself — or browse the
              interactive OpenAPI docs at <code className="font-mono text-xs">/docs</code>.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild variant="outline" className="cursor-pointer">
                <a href="backend/README.md">Read the README</a>
              </Button>
              <Button asChild variant="ghost" className="cursor-pointer text-muted-foreground">
                <a href="backend/LICENSE">MIT License</a>
              </Button>
            </div>
          </motion.div>
          <motion.div {...fadeUp} transition={{ duration: 0.55, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}>
            <div className="overflow-hidden rounded-xl border border-border">
              <div className="flex items-center justify-between border-b border-border bg-muted/50 px-4 py-2.5">
                <span className="font-mono text-xs text-muted-foreground">terminal</span>
                <span className="flex gap-1.5">
                  <span className="size-2.5 rounded-full bg-border" />
                  <span className="size-2.5 rounded-full bg-border" />
                  <span className="size-2.5 rounded-full bg-border" />
                </span>
              </div>
              <pre className="overflow-x-auto p-5 font-mono text-xs leading-6 text-foreground/90">
                <code>{`cd backend
${runSteps.join("\n")}
# open http://localhost:8000/playground`}</code>
              </pre>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-6 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <p className="flex items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded-full bg-foreground text-background">
              <Waves className="size-2.5" />
            </span>
            Aural · the audio-to-text API · MIT License
          </p>
          <div className="flex gap-4">
            <a href="backend/README.md" className="transition-colors hover:text-foreground">
              README
            </a>
            <a href="backend/CONTRIBUTING.md" className="transition-colors hover:text-foreground">
              Contributing
            </a>
            <a href="backend/SECURITY.md" className="transition-colors hover:text-foreground">
              Security
            </a>
            <a href="/auth" className="transition-colors hover:text-foreground">
              Sign in
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
