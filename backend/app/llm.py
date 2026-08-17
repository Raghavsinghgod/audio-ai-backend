"""OpenAI Chat Completions with a mock fallback when no API key is set."""

from __future__ import annotations

import logging

from openai import OpenAI

from .config import OPENAI_API_KEY

logger = logging.getLogger(__name__)

# Model used for chat completions. Change here if you prefer another model.
DEFAULT_MODEL = "gpt-4o-mini"

_client: OpenAI | None = None


class LLMError(Exception):
    """Raised when an upstream OpenAI request fails."""


def _get_client() -> OpenAI | None:
    """Return a cached OpenAI client, or None when no API key is configured."""
    global _client
    if not OPENAI_API_KEY:
        return None
    if _client is None:
        _client = OpenAI(api_key=OPENAI_API_KEY)
    return _client


def chat(messages: list[dict[str, str]]) -> str:
    """Send a chat completion request and return the assistant's reply.

    Returns a mock answer when ``OPENAI_API_KEY`` is not configured.
    """
    client = _get_client()
    if client is None:
        return _mock_answer(messages)

    try:
        response = client.chat.completions.create(
            model=DEFAULT_MODEL,
            messages=messages,
        )
    except Exception as exc:
        logger.exception("OpenAI chat completion failed")
        raise LLMError("OpenAI request failed.") from exc

    content = response.choices[0].message.content
    return content if content is not None else ""


def _mock_answer(messages: list[dict[str, str]]) -> str:
    """Minimal placeholder response used while OPENAI_API_KEY is unset."""
    last_user = next(
        (m["content"] for m in reversed(messages) if m["role"] == "user"),
        "",
    )
    return (
        "Mock answer — OPENAI_API_KEY is not set. "
        f"Received your message: “{last_user}”"
    )
