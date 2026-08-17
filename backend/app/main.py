"""Audio-to-text API built with FastAPI and faster-whisper.

Backend-only. Voice in, transcript out — plus an optional LLM pass, in the
style of ChatGPT's voice input flow.

Run with:

    uvicorn app.main:app --reload
"""

import logging
import os
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Body, FastAPI, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import CORS_ORIGINS, DEVICE, MAX_UPLOAD_SIZE_MB, OPENAI_API_KEY, WHISPER_MODEL
from .llm import LLMError
from .llm import chat as llm_chat
from .whisper_loader import get_model, load_model

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger(__name__)

# Formats that faster-whisper (via PyAV) can decode.
ALLOWED_AUDIO_SUFFIXES = {
    ".mp3", ".wav", ".m4a", ".aac", ".ogg", ".oga",
    ".opus", ".flac", ".webm", ".mp4",
}

ALLOWED_ROLES = {"system", "user", "assistant"}

# Hard limits that keep the API cheap to run and hard to abuse.
MAX_UPLOAD_SIZE = MAX_UPLOAD_SIZE_MB * 1024 * 1024
MAX_CHAT_MESSAGES = 50

DEFAULT_SYSTEM_PROMPT = (
    "You are a concise, helpful assistant. Respond directly to the user's "
    "spoken message."
)


@asynccontextmanager
async def lifespan(_app):
    """Load the Whisper model once, before the first request arrives."""
    load_model(WHISPER_MODEL, DEVICE)
    yield


app = FastAPI(title="Audio-to-Text API", version="1.0.0", lifespan=lifespan)

# Configurable CORS so a frontend can call this API. Set CORS_ORIGINS to a
# comma-separated list of origins, or leave "*" for any origin.
origins = [origin.strip() for origin in CORS_ORIGINS.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _validate_audio_suffix(filename):
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


def _save_upload(file):
    """Persist an uploaded file to a temp path and return its location.

    Reads in chunks and aborts with 413 once the size limit is exceeded.
    """
    suffix = Path(file.filename or "").suffix.lower() or ".webm"
    fd, tmp_name = tempfile.mkstemp(suffix=suffix)
    try:
        with os.fdopen(fd, "wb") as tmp:
            written = 0
            while True:
                chunk = file.file.read(1024 * 1024)
                if not chunk:
                    break
                written += len(chunk)
                if written > MAX_UPLOAD_SIZE:
                    raise HTTPException(
                        status_code=413,
                        detail=f"File exceeds the {MAX_UPLOAD_SIZE_MB} MB upload limit.",
                    )
                tmp.write(chunk)
    except Exception:
        _safe_unlink(tmp_name)
        raise
    return Path(tmp_name)


def _safe_unlink(path):
    """Best-effort cleanup of a temporary file."""
    try:
        Path(path).unlink(missing_ok=True)
    except OSError:
        logger.warning("Could not remove temporary file %s", path)


def _transcribe(path):
    """Transcribe an audio file with faster-whisper into structured JSON."""
    if path.stat().st_size == 0:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    try:
        segments_iter, info = get_model().transcribe(str(path), beam_size=5)
        segments = [
            {"start": round(seg.start, 2), "end": round(seg.end, 2), "text": seg.text.strip()}
            for seg in segments_iter
        ]
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


def _llm_answer(messages):
    """Call the LLM, translating upstream failures into a 502."""
    try:
        return llm_chat(messages)
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/")
def health():
    """Health check."""
    return {
        "status": "ok",
        "service": "audio-to-text",
        "model": WHISPER_MODEL,
        "device": DEVICE,
        "llm": "openai" if OPENAI_API_KEY else "mock",
    }


@app.post("/transcribe")
async def transcribe(file=File(None)):
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
async def ask_audio(file=File(None), system_prompt=Form(None)):
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
    return {"transcript": result["text"], "answer": _llm_answer(messages)}


@app.post("/chat")
async def chat(payload=Body(...)):
    """Send chat messages to the LLM and return its answer."""
    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=400,
            detail="Request body must be a JSON object with a 'messages' array.",
        )
    messages = payload.get("messages")
    if not isinstance(messages, list) or not messages:
        raise HTTPException(status_code=400, detail="'messages' must be a non-empty array.")
    if len(messages) > MAX_CHAT_MESSAGES:
        raise HTTPException(
            status_code=400,
            detail=f"'messages' must contain at most {MAX_CHAT_MESSAGES} messages.",
        )

    cleaned = []
    for message in messages:
        if not isinstance(message, dict):
            raise HTTPException(
                status_code=400,
                detail="Each message must be an object with 'role' and 'content'.",
            )
        role = message.get("role")
        content = message.get("content")
        if role not in ALLOWED_ROLES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid role '{role}'. Use one of: {', '.join(sorted(ALLOWED_ROLES))}.",
            )
        if not isinstance(content, str) or not content.strip():
            raise HTTPException(status_code=400, detail="'content' must be a non-empty string.")
        cleaned.append({"role": role, "content": content})

    return {"answer": _llm_answer(cleaned)}
