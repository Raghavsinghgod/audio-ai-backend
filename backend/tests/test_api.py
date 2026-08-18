"""Endpoint tests.

The OpenAI key is not set in CI, so /ask-audio and /chat exercise the mock
answer path. See conftest.py for how the Whisper model is faked.
"""

import io
from pathlib import Path


def _audio(content, filename="sample.mp3"):
    return {"file": (filename, io.BytesIO(content), "audio/mpeg")}


def test_health(client):
    response = client.get("/")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "audio-to-text"
    assert body["llm"] == "mock"
    assert body["playground"] == "/playground"


def test_playground(client):
    response = client.get("/playground")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "Audio-to-Text API" in response.text
    assert "/transcribe" in response.text


def test_transcribe_missing_file(client):
    response = client.post("/transcribe")
    assert response.status_code == 400
    assert "file" in response.json()["detail"].lower()


def test_transcribe_unsupported_format(client):
    response = client.post("/transcribe", files=_audio(b"ok", filename="notes.txt"))
    assert response.status_code == 415


def test_transcribe_empty_file(client):
    response = client.post("/transcribe", files=_audio(b""))
    assert response.status_code == 400
    assert "empty" in response.json()["detail"].lower()


def test_transcribe_success(client, transcribed_paths):
    response = client.post("/transcribe", files=_audio(b"ok: hello world"))
    assert response.status_code == 200
    body = response.json()
    assert body["text"] == "Hello, this is a test recording."
    assert body["language"] == "en"
    assert body["duration"] == 2.5
    assert len(body["segments"]) == 2
    assert body["segments"][0] == {"start": 0.0, "end": 1.1, "text": "Hello, this is"}

    # The temporary file must be deleted after processing.
    assert transcribed_paths
    assert not Path(transcribed_paths[-1]).exists()


def test_transcribe_undecodable_audio(client):
    response = client.post("/transcribe", files=_audio(b"decode: garbage"))
    assert response.status_code == 400
    assert "decode" in response.json()["detail"].lower()


def test_transcribe_failure(client):
    response = client.post("/transcribe", files=_audio(b"boom"))
    assert response.status_code == 500
    assert "transcription" in response.json()["detail"].lower()


def test_transcribe_upload_too_large(client, monkeypatch):
    monkeypatch.setattr("app.main.MAX_UPLOAD_SIZE", 10)
    response = client.post("/transcribe", files=_audio(b"ok: " + b"x" * 100))
    assert response.status_code == 413
    assert "upload limit" in response.json()["detail"].lower()


def test_ask_audio_returns_transcript_and_answer(client):
    response = client.post(
        "/ask-audio",
        files=_audio(b"ok: what is the capital of france"),
        data={"system_prompt": "Answer in one sentence."},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["transcript"] == "Hello, this is a test recording."
    assert "Mock answer" in body["answer"]


def test_ask_audio_missing_file(client):
    response = client.post("/ask-audio")
    assert response.status_code == 400


def test_chat_returns_mock_answer(client):
    response = client.post("/chat", json={"messages": [{"role": "user", "content": "hi"}]})
    assert response.status_code == 200
    assert "Mock answer" in response.json()["answer"]
    assert "hi" in response.json()["answer"]


def test_chat_empty_messages(client):
    response = client.post("/chat", json={"messages": []})
    assert response.status_code == 400


def test_chat_invalid_role(client):
    response = client.post("/chat", json={"messages": [{"role": "robot", "content": "x"}]})
    assert response.status_code == 400
    assert "assistant" in response.json()["detail"]


def test_chat_content_not_string(client):
    response = client.post("/chat", json={"messages": [{"role": "user", "content": 42}]})
    assert response.status_code == 400


def test_chat_message_not_object(client):
    response = client.post("/chat", json={"messages": ["hi"]})
    assert response.status_code == 400


def test_chat_too_many_messages(client):
    messages = [{"role": "user", "content": "x"}] * 51
    response = client.post("/chat", json={"messages": messages})
    assert response.status_code == 400


def test_chat_body_not_object(client):
    response = client.post("/chat", json=["not", "an", "object"])
    assert response.status_code == 400
