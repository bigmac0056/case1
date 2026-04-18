import os

from faster_whisper import WhisperModel


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return float(value)
    except ValueError:
        return default


WHISPER_MODEL = os.getenv("WHISPER_MODEL", "large-v3")
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
WHISPER_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
WHISPER_LANGUAGE = os.getenv("WHISPER_LANGUAGE", "ru")
WHISPER_BEAM_SIZE = _env_int("WHISPER_BEAM_SIZE", 3)
WHISPER_TEMPERATURE = _env_float("WHISPER_TEMPERATURE", 0.0)
WHISPER_CONDITION_ON_PREVIOUS_TEXT = _env_bool("WHISPER_CONDITION_ON_PREVIOUS_TEXT", False)
WHISPER_VAD_FILTER = _env_bool("WHISPER_VAD_FILTER", True)
WHISPER_NO_SPEECH_THRESHOLD = _env_float("WHISPER_NO_SPEECH_THRESHOLD", 0.45)
WHISPER_VAD_MIN_SILENCE_MS = _env_int("WHISPER_VAD_MIN_SILENCE_MS", 420)
WHISPER_VAD_SPEECH_PAD_MS = _env_int("WHISPER_VAD_SPEECH_PAD_MS", 160)
WHISPER_VAD_MIN_SPEECH_MS = _env_int("WHISPER_VAD_MIN_SPEECH_MS", 120)
WHISPER_HOTWORDS = os.getenv("WHISPER_HOTWORDS", "").strip()

whisper_model = WhisperModel(
    WHISPER_MODEL,
    device=WHISPER_DEVICE,
    compute_type=WHISPER_COMPUTE_TYPE,
)


def transcribe_ru(audio_path: str) -> str:
    vad_parameters = {
        "min_silence_duration_ms": WHISPER_VAD_MIN_SILENCE_MS,
        "speech_pad_ms": WHISPER_VAD_SPEECH_PAD_MS,
        "min_speech_duration_ms": WHISPER_VAD_MIN_SPEECH_MS,
    }

    kwargs = {
        "language": WHISPER_LANGUAGE,
        "task": "transcribe",
        "beam_size": WHISPER_BEAM_SIZE,
        "temperature": WHISPER_TEMPERATURE,
        "condition_on_previous_text": WHISPER_CONDITION_ON_PREVIOUS_TEXT,
        "vad_filter": WHISPER_VAD_FILTER,
        "no_speech_threshold": WHISPER_NO_SPEECH_THRESHOLD,
    }

    if WHISPER_VAD_FILTER:
        kwargs["vad_parameters"] = vad_parameters
    if WHISPER_HOTWORDS:
        kwargs["hotwords"] = WHISPER_HOTWORDS

    segments, _ = whisper_model.transcribe(
        audio_path,
        **kwargs,
    )
    return " ".join(segment.text.strip() for segment in segments).strip()
