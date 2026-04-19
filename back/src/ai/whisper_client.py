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
# Slightly stricter no-speech threshold reduces YouTube-style hallucinations on silence.
WHISPER_NO_SPEECH_THRESHOLD = _env_float("WHISPER_NO_SPEECH_THRESHOLD", 0.55)
# Longer min silence = fewer mid-word splits on medical terms.
WHISPER_VAD_MIN_SILENCE_MS = _env_int("WHISPER_VAD_MIN_SILENCE_MS", 600)
WHISPER_VAD_SPEECH_PAD_MS = _env_int("WHISPER_VAD_SPEECH_PAD_MS", 200)
WHISPER_VAD_MIN_SPEECH_MS = _env_int("WHISPER_VAD_MIN_SPEECH_MS", 200)
# Drop very low-confidence segments (e.g. avg log-prob below this is treated as garbage).
WHISPER_LOG_PROB_THRESHOLD = _env_float("WHISPER_LOG_PROB_THRESHOLD", -1.0)
WHISPER_COMPRESSION_RATIO_THRESHOLD = _env_float("WHISPER_COMPRESSION_RATIO_THRESHOLD", 2.4)
WHISPER_HOTWORDS = os.getenv(
    "WHISPER_HOTWORDS",
    # Common medical vocabulary — biases Whisper toward these terms.
    "жалобы анамнез объективно диагноз назначения дневник температура давление пульс "
    "горло кашель насморк головная боль гипертония ОРВИ ОРЗ бронхит пневмония",
).strip()
# Default initial prompt steers Whisper toward medical-consultation Russian.
WHISPER_DEFAULT_INITIAL_PROMPT = os.getenv(
    "WHISPER_DEFAULT_INITIAL_PROMPT",
    "Это запись медицинского приема врача в поликлинике. "
    "Врач диктует разделы: жалобы, анамнез, объективный осмотр, диагноз, назначения, дневник. "
    "Используются медицинские термины и названия препаратов на русском языке.",
).strip()

whisper_model = WhisperModel(
    WHISPER_MODEL,
    device=WHISPER_DEVICE,
    compute_type=WHISPER_COMPUTE_TYPE,
)


def transcribe_ru(audio_path: str, prompt: str = "") -> str:
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
        "log_prob_threshold": WHISPER_LOG_PROB_THRESHOLD,
        "compression_ratio_threshold": WHISPER_COMPRESSION_RATIO_THRESHOLD,
    }

    if WHISPER_VAD_FILTER:
        kwargs["vad_parameters"] = vad_parameters
    if WHISPER_HOTWORDS:
        kwargs["hotwords"] = WHISPER_HOTWORDS
    initial_prompt = (prompt or "").strip() or WHISPER_DEFAULT_INITIAL_PROMPT
    if initial_prompt:
        kwargs["initial_prompt"] = initial_prompt

    segments, _ = whisper_model.transcribe(
        audio_path,
        **kwargs,
    )

    text = " ".join(segment.text.strip() for segment in segments).strip()
    return _filter_hallucinations(text)


# Common Whisper hallucination phrases that surface on silence/noise — drop them.
_HALLUCINATION_SUBSTRINGS = (
    "субтитры",
    "subtitles by",
    "продолжение следует",
    "спасибо за просмотр",
    "спасибо за внимание",
    "подписывайтесь",
    "ставьте лайк",
    "amara.org",
    "корректор",
    "редактор субтитров",
    "музыка играет",
    "фоновая музыка",
)


def _filter_hallucinations(text: str) -> str:
    if not text:
        return ""
    lowered = text.lower()
    # If the WHOLE utterance is a known hallucination, drop it entirely.
    stripped = lowered.strip(" .,!?-—:;")
    for needle in _HALLUCINATION_SUBSTRINGS:
        if stripped == needle or stripped.startswith(needle + " ") or stripped.endswith(" " + needle):
            # If the hallucination is the dominant content, kill it.
            if len(stripped) <= len(needle) + 25:
                return ""
    # Otherwise, scrub any of those phrases from the middle.
    cleaned = text
    for needle in _HALLUCINATION_SUBSTRINGS:
        # Case-insensitive replace
        idx = cleaned.lower().find(needle)
        while idx >= 0:
            cleaned = cleaned[:idx] + cleaned[idx + len(needle):]
            idx = cleaned.lower().find(needle)
    return " ".join(cleaned.split())
