# Audio-to-Text API

A backend-only speech-to-text API built with Python and FastAPI. Upload audio,
get a transcript — and optionally send it to an LLM for an AI response. Voice
in, text out, no frontend.

## Stack

| Layer      | Choice            |
| ---------- | ----------------- |
| Framework  | FastAPI           |
| Speech     | faster-whisper    |
| LLM        | OpenAI            |
| Config     | python-dotenv     |

## Quick start

```bash
cd backend

python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

pip install -r requirements.txt  # or: pip install -e .

cp env.example .env              # then edit .env if needed

uvicorn app.main:app --reload
```

The API is then available at `http://localhost:8000`. Interactive docs:
`http://localhost:8000/docs`.

> The first startup downloads the Whisper model weights (default: `base`,
> ~140 MB) and caches them locally. `POST /transcribe` works without any
> configuration. The LLM endpoints work without a key too — they return a mock
> answer until `OPENAI_API_KEY` is set.

## Configuration

All settings come from environment variables (`.env` is loaded automatically).

| Variable             | Default | Description                                                                       |
| -------------------- | ------- | --------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`     | —       | OpenAI key for `/ask-audio` and `/chat`. When missing, both return mock answers.   |
| `WHISPER_MODEL`      | `base`  | Whisper model size: `tiny`, `base`, `small`, `medium`, `large-v3`. Larger is slower but more accurate. |
| `DEVICE`             | `cpu`   | Compute device: `cpu`, `cuda`, or `auto`.                                         |
| `MAX_UPLOAD_SIZE_MB` | `25`    | Max upload size in megabytes; larger files are rejected with `413`.               |
| `CORS_ORIGINS`       | `*`     | Comma-separated allowed origins, or `*` for any origin.                           |

## Endpoints

### `GET /`

Health check.

```bash
curl http://localhost:8000/
```

```json
{
  "status": "ok",
  "service": "audio-to-text",
  "model": "base",
  "device": "cpu",
  "llm": "mock"
}
```

### `POST /transcribe`

Accepts an audio upload (`multipart/form-data`), transcribes it with
faster-whisper, and returns the transcript as JSON.

```bash
curl -X POST http://localhost:8000/transcribe \
  -F "file=@sample.mp3"
```

```json
{
  "text": "Hello, this is a test recording.",
  "language": "en",
  "duration": 2.34,
  "segments": [
    { "start": 0.0, "end": 1.1, "text": "Hello, this is" },
    { "start": 1.1, "end": 2.34, "text": "a test recording." }
  ]
}
```

### `POST /ask-audio`

Accepts an audio upload plus an optional `system_prompt` field. Transcribes the
audio, sends the transcript to OpenAI Chat Completions, and returns both.

```bash
curl -X POST http://localhost:8000/ask-audio \
  -F "file=@question.mp3" \
  -F "system_prompt=Answer in one sentence."
```

```json
{
  "transcript": "What is the capital of France?",
  "answer": "The capital of France is Paris."
}
```

### `POST /chat`

Accepts a JSON chat history and returns the assistant's answer.

```bash
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"What is 2 + 2?"}]}'
```

```json
{
  "answer": "2 + 2 = 4."
}
```

## Error handling

| Condition                     | Status | Detail                                              |
| ----------------------------- | ------ | --------------------------------------------------- |
| Missing file                  | `400`  | No file in the `file` form field.                   |
| Empty file                    | `400`  | Uploaded file has zero bytes.                       |
| Unsupported audio format      | `415`  | Extension outside the supported set.                |
| Undecodable / corrupt audio   | `400`  | faster-whisper could not decode the file.           |
| Upload exceeds size limit     | `413`  | Larger than `MAX_UPLOAD_SIZE_MB`.                   |
| Transcription failure         | `500`  | Unexpected error during transcription.              |
| Missing `OPENAI_API_KEY`      | `200`  | `/ask-audio` and `/chat` return a mock answer.      |
| Upstream OpenAI failure       | `502`  | The OpenAI request itself failed.                   |

Uploaded files are written to a temporary file, processed, and deleted in a
`finally` block — nothing is stored between requests.

## Development

```bash
pip install -e ".[dev]"
ruff check .        # lint
pytest              # tests
```

The test suite stubs out faster-whisper and OpenAI, so it runs in seconds
without a model download, GPU, or API key. CI (GitHub Actions) runs the same
lint and tests on Python 3.10–3.12 — see `.github/workflows/backend-ci.yml`.

## Project structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── config.py         # env-var configuration
│   ├── llm.py            # OpenAI client + mock fallback
│   ├── main.py           # FastAPI app, routes, upload handling
│   └── whisper_loader.py # model loaded once at startup
├── tests/
│   ├── conftest.py       # fixtures + faster-whisper / OpenAI stubs
│   └── test_api.py       # endpoint tests
├── env.example           # template — copy to .env
├── pyproject.toml        # metadata, dependencies, tool config
└── requirements.txt      # thin wrapper around pyproject.toml
```

## License

MIT — see [LICENSE](LICENSE).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Security

See [SECURITY.md](SECURITY.md) for the vulnerability reporting policy and what
this API does — and does not — protect against.
