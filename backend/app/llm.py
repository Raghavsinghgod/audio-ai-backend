"""OpenAI Chat Completions with a mock fallback when no API key is set."""

import logging

from openai import OpenAI

from .config import OPENAI_API_KEY

logger = logging.getLogger(__name__)

# Model used for chat completions. Change here if you prefer another model.
DEFAULT_MODEL = "gpt-4o-mini"

_client = None


class LLMError(Exception):
    """Raised when an upstream OpenAI request fails."""


def _get_client():
    """Return a cached OpenAI client, or None when no API key is configured."""
    global _client
    if not OPENAI_API_KEY:
        return None
    if _client is None:
        _client = OpenAI(api_key=OPENAI_API_KEY)
    return _client


def chat(messages):
    """Send a chat completion request and return the assistant's reply.

    Returns a mock answer when OPENAI_API_KEY is not configured.
    """
    client = _get_client()
    if client is None:
        return _mock_answer(messages)

    try:
        response = client.chat.completions.create(model=DEFAULT_MODEL, messages=messages)
    except Exception as exc:
        logger.exception("OpenAI chat completion failed")
        raise LLMError("OpenAI request failed.") from exc

    content = response.choices[0].message.content
    return content if content is not None else ""


def _mock_answer(messages):
    """Minimal placeholder response used while OPENAI_API_KEY is unset."""
    last_user = ""
    for message in reversed(messages):
        if message["role"] == "user":
            last_user = message["content"]
            break
    return f"Mock answer — OPENAI_API_KEY is not set. Received your message: “{last_user}”"
