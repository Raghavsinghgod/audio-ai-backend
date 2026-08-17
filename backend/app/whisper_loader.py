"""Singleton loader for the faster-whisper model.

The model is loaded exactly once when the server starts (see the lifespan
handler in main.py) and reused for every request. The first load downloads
the model weights if they are not already cached locally.
"""

import logging

from faster_whisper import WhisperModel

logger = logging.getLogger(__name__)

_model = None


def load_model(model_name, device):
    """Load the Whisper model once and cache it for the process lifetime."""
    global _model
    if _model is None:
        compute_type = "int8" if device == "cpu" else "float16"
        logger.info("Loading faster-whisper model %r on device %r ...", model_name, device)
        _model = WhisperModel(model_name, device=device, compute_type=compute_type)
        logger.info("Whisper model %r ready.", model_name)
    return _model


def get_model():
    """Return the loaded model, or raise if startup never completed."""
    if _model is None:
        raise RuntimeError("Whisper model has not been loaded. Did the server start correctly?")
    return _model
