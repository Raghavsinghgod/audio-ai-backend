# Contributing

Thanks for contributing. Keep changes small, focused, and consistent with the
existing style.

## Development setup

```bash
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
cp env.example .env              # optional, for local configuration
```

## Checks

Run both before opening a pull request:

```bash
ruff check .
pytest
```

- `ruff` enforces style; fix violations before submitting.
- `pytest` runs the endpoint test suite. The tests stub out faster-whisper and
  OpenAI, so they run without a model download or an API key.

## Pull requests

1. Fork the repository and create a branch from `main`.
2. Make your change, add or update tests for it.
3. Run `ruff check .` and `pytest` locally.
4. Open the pull request and describe what changed and why.

## Project layout

```
app/
├── config.py         # environment-variable configuration
├── llm.py            # OpenAI client + mock fallback
├── main.py           # FastAPI app and routes
└── whisper_loader.py # model loaded once at startup
tests/                # pytest suite (faster-whisper and OpenAI are stubbed)
```
