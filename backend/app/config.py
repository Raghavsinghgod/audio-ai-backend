"""Configuration loaded from environment variables (.env supported)."""

import os

from dotenv import load_dotenv

load_dotenv()

# Whisper model size. Larger models are slower but more accurate.
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "base")

# Compute device for Whisper: "cpu", "cuda", or "auto".
DEVICE = os.getenv("DEVICE", "cpu")

# OpenAI API key. When missing or empty, the LLM endpoints return mock answers.
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip() or None

# Max uploaded file size in megabytes. Larger files are rejected with 413.
MAX_UPLOAD_SIZE_MB = int(os.getenv("MAX_UPLOAD_SIZE_MB", "25"))

# Comma-separated list of allowed CORS origins, or "*" for any origin.
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*")
