"""Shared test fixtures.

faster-whisper and OpenAI are stubbed before the app modules are imported, so
the suite runs without a model download, GPU, or API key. The fake Whisper
model decides its behavior from the uploaded file's first bytes:

- ``b"ok"``     -> returns scripted segments and info
- ``b"decode"`` -> raises a decode error (client's fault)
- anything else -> raises a generic runtime error (server's fault)
"""

import sys
import types
from pathlib import Path

import pytest

TRANSCRIBED_PATHS = []


class FakeSegment:
    def __init__(self, start, end, text):
        self.start = start
        self.end = end
        self.text = text


class FakeInfo:
    language = "en"
    duration = 2.5


class FakeWhisperModel:
    def __init__(self, *args, **kwargs):
        pass

    def transcribe(self, path, **kwargs):
        TRANSCRIBED_PATHS.append(str(path))
        content = Path(path).read_bytes()
        if content.startswith(b"ok"):
            segments = [
                FakeSegment(0.0, 1.1, "Hello, this is"),
                FakeSegment(1.1, 2.5, "a test recording."),
            ]
            return segments, FakeInfo()
        if content.startswith(b"decode"):
            raise ValueError("Audio file could not be decoded: unknown codec")
        raise RuntimeError("transcription crashed")


def _install_stub(name, attrs):
    module = types.ModuleType(name)
    for key, value in attrs.items():
        setattr(module, key, value)
    sys.modules[name] = module


_install_stub("faster_whisper", {"WhisperModel": FakeWhisperModel})
_install_stub("openai", {"OpenAI": type("OpenAI", (), {})})


@pytest.fixture()
def transcribed_paths():
    """The temp paths the fake model was asked to transcribe, reset per test."""
    TRANSCRIBED_PATHS.clear()
    return TRANSCRIBED_PATHS


@pytest.fixture()
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client
