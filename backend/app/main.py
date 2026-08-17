"""Audio-to-text API built with FastAPI and faster-whisper.

Backend-only. Voice-in, transcript-out — plus an optional LLM pass, in the
style of ChatGPT's voice input flow.

Run with:

    uvicorn app.main:app --reload
"""

from __future__ import annotations

import logging
import shutil
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .config import DEVICE, OPENAI_API_KEY, WHISPER_MODEL
from .llm import LLMError, chat as llm_chat
from .whisper_loader import get_model, load_model

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)

# Formats that faster-whisper (via PyAV) can decode.
ALLOWED_AUDIO_SUFFIXES = {
    ".mp3", ".wav", ".m4a", ".aac", ".ogg", ".oga",
    ".opus", ".flac", ".webm", ".mp4",
}

ALLOWED_ROLES = {"system", "user", "assistant"}

DEFAULT_SYSTEM_PROMPT = (
    "You are a concise, helpful assistant. Respond directly to the user's "
    "spoken message."
)


# ---------------------------------------------------------------------------
# Startup / shutdown
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(_: FastAPI):
    """Load the Whisper model once, before the first request arrives."""
    load_model(WHISPER_MODEL, DEVICE)
    yield


app = FastAPI(
    title="Audio-to-Text API",
    version="1.0.0",
    description="Transcribe audio with faster-whisper and optionally ask an LLM.",
    lifespan=lifespan,
)

# Permissive CORS so any frontend can call this API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class ChatMessage(BaseModel):
    role: str = Field(..., description="One of: system, user, assistant")
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(..., description="Chat history, oldest first")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _validate_audio_suffix(filename: str | None) -> None:
    """Reject uploads whose extension we cannot decode."""
    suffix = Path(filename or "").suffix.lower()
    if suffix not in ALLOWED_AUDIO_SUFFIXES:
        raise HTTPException(
            status_code=415,
            detail=(
                f"Unsupported audio format '{suffix or 'unknown'}'. "
                f"Supported formats: {', '.join(sorted(ALLOWED_AUDIO_SUFFIXES))}."
            ),
        )


def _save_upload(file: UploadFile) -> Path:
    """Persist an uploaded file to a temp path and return its location."""
    suffix = Path(file.filename or "").suffix.lower() or ".webm"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        with tmp:
            shutil.copyfileobj(file.file, tmp)
    except Exception:
        _safe_unlink(tmp.name)
        raise
    return Path(tmp.name)


def _safe_unlink(path: str | Path) -> None:
    """Best-effort cleanup of a temporary file."""
    try:
        Path(path).unlink(missing_ok=True)
    except OSError:
        logger.warning("Could not remove temporary file %s", path)


def _transcribe(path: Path) -> dict[str, Any]:
    """Transcribe an audio file with faster-whisper into structured JSON."""
    try:
        segments_iter, info = get_model().transcribe(str(path), beam_size=5)
        segments = [
            {
                "start": round(seg.start, 2),
                "end": round(seg.end, 2),
                "text": seg.text.strip(),
            }
            for seg in segments_iter
        ]
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Transcription failed for %s", path)
        if any(word in str(exc).lower() for word in ("decode", "could not", "invalid")):
            raise HTTPException(
                status_code=400,
                detail="Could not decode the audio file. Is it a valid, supported audio format?",
            ) from exc
        raise HTTPException(status_code=500, detail="Transcription failed.") from exc

    return {
        "text": " ".join(seg["text"] for seg in segments).strip(),
        "language": info.language,
        "duration": round(info.duration, 2),
        "segments": segments,
    }


def _llm_answer(messages: list[dict[str, str]]) -> str:
    """Call the LLM, translating upstream failures into a 502."""
    try:
        return llm_chat(messages)
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/")
def health() -> dict[str, Any]:
    """Health check."""
    return {
        "status": "ok",
        "service": "audio-to-text",
        "model": WHISPER_MODEL,
        "device": DEVICE,
        "llm": "openai" if OPENAI_API_KEY else "mock",
    }


@app.post("/transcribe")
async def transcribe(file: UploadFile | None = File(None)) -> dict[str, Any]:
    """Transcribe an uploaded audio file and return the raw transcript."""
    if file is None:
        raise HTTPException(
            status_code=400,
            detail="No file provided. Send the audio in the 'file' form field.",
        )
    _validate_audio_suffix(file.filename)

    path = _save_upload(file)
    try:
        return _transcribe(path)
    finally:
        _safe_unlink(path)


@app.post("/ask-audio")
async def ask_audio(
    file: UploadFile | None = File(None),
    system_prompt: str | None = Form(None),
) -> dict[str, str]:
    """Transcribe an audio file, then send the transcript to the LLM."""
    if file is None:
        raise HTTPException(
            status_code=400,
            detail="No file provided. Send the audio in the 'file' form field.",
        )
    _validate_audio_suffix(file.filename)

    path = _save_upload(file)
    try:
        result = _transcribe(path)
    finally:
        _safe_unlink(path)

    prompt = (system_prompt or "").strip() or DEFAULT_SYSTEM_PROMPT
    messages = [
        {"role": "system", "content": prompt},
        {"role": "user", "content": result["text"]},
    ]
    answer = _llm_answer(messages)
    return {"transcript": result["text"], "answer": answer}


@app.post("/chat")
async def chat(req: ChatRequest) -> dict[str, str]:
    """Send chat messages to the LLM and return its answer."""
    if not req.messages:
        raise HTTPException(status_code=400, detail="'messages' must not be empty.")
    for message in req.messages:
        if message.role not in ALLOWED_ROLES:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Invalid role '{message.role}'. "
                    f"Use one of: {', '.join(sorted(ALLOWED_ROLES))}."
                ),
            )
        if not message.content.strip():
            raise HTTPException(
                status_code=400,
                detail="Message content must not be empty.",
            )

    messages = [{"role": m.role, "content": m.content} for m in req.messages]
    return {"answer": _llm_answer(messages)}
