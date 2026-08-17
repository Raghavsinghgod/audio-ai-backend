"""Configuration loaded from environment variables (.env supported).

All settings are read once at import time. Copy `.env.example` to `.env`
to configure them locally.
"""

from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()

# Whisper model size. Larger models are slower but more accurate.
WHISPER_MODEL: str = os.getenv("WHISPER_MODEL", "base")

# Compute device for Whisper: "cpu", "cuda", or "auto".
DEVICE: str = os.getenv("DEVICE", "cpu")

# OpenAI API key. When missing or empty, the LLM endpoints return mock answers.
OPENAI_API_KEY: str | None = os.getenv("OPENAI_API_KEY", "").strip() or None
