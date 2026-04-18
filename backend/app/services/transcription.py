"""
Transcription service backed by faster-whisper.

The WhisperModel is loaded lazily on first use and cached in a module-level
variable so subsequent calls reuse the same model weights.
"""
import asyncio
import logging
import uuid
from pathlib import Path
from typing import Any, Callable

from app.models.transcript import Transcript, TranscriptSegment, Word

logger = logging.getLogger(__name__)

# Module-level model cache to avoid reloading weights on every request
_whisper_model: Any = None
_model_lock = asyncio.Lock()


def _resolve_device_and_compute(device: str, compute_type: str) -> tuple[str, str]:
    """
    Resolve 'auto' device / compute_type to concrete values based on hardware.
    """
    if device == "auto":
        try:
            import torch  # type: ignore
            device = "cuda" if torch.cuda.is_available() else "cpu"
        except ImportError:
            device = "cpu"

    if compute_type == "auto":
        compute_type = "float16" if device == "cuda" else "int8"

    return device, compute_type


async def _get_model(model_name: str, device: str, compute_type: str):
    """Return (and cache) the faster-whisper WhisperModel."""
    global _whisper_model

    async with _model_lock:
        if _whisper_model is None:
            logger.info(
                "Loading Whisper model '%s' on device='%s' compute='%s' …",
                model_name,
                device,
                compute_type,
            )
            from faster_whisper import WhisperModel  # type: ignore

            loop = asyncio.get_event_loop()
            _whisper_model = await loop.run_in_executor(
                None,
                lambda: WhisperModel(model_name, device=device, compute_type=compute_type),
            )
            logger.info("Whisper model loaded.")
    return _whisper_model


def _run_transcription(
    model,
    audio_path: str,
    language: str | None,
) -> tuple[list[dict], dict]:
    """
    Blocking call to faster-whisper transcribe().
    Runs inside an executor thread.

    Returns (list_of_segment_dicts, info_dict).
    """
    segments_iter, info = model.transcribe(
        audio_path,
        language=language,
        beam_size=5,
        word_timestamps=True,
        vad_filter=True,       # built-in silence filtering
        vad_parameters={"min_silence_duration_ms": 500},
    )

    segments_data: list[dict] = []
    for seg in segments_iter:
        words_data: list[dict] = []
        if seg.words:
            for w in seg.words:
                words_data.append(
                    {
                        "word": w.word.strip(),
                        "start": w.start,
                        "end": w.end,
                        "confidence": getattr(w, "probability", 1.0),
                    }
                )
        segments_data.append(
            {
                "id": str(uuid.uuid4()),
                "speaker": None,
                "start": seg.start,
                "end": seg.end,
                "words": words_data,
            }
        )

    return segments_data, {
        "language": info.language,
        "language_probability": info.language_probability,
        "duration": info.duration,
    }


async def transcribe_video(
    video_path: str | Path,
    audio_path: str | Path,
    *,
    model_name: str = "large-v3",
    device: str = "auto",
    compute_type: str = "auto",
    language: str | None = None,
    progress_callback: Callable[[float, str], None] | None = None,
) -> Transcript:
    """
    Transcribe a video file and return a Transcript.

    Parameters
    ----------
    video_path:
        Path to the original video (used only for logging).
    audio_path:
        Path to the extracted audio WAV (16kHz mono).
    model_name:
        faster-whisper model name (default: large-v3).
    device:
        'auto', 'cpu', or 'cuda'.
    compute_type:
        'auto', 'float32', 'float16', or 'int8'.
    language:
        ISO-639-1 language code or None for auto-detect.
    progress_callback:
        Optional callable(progress_fraction, message) for SSE/WS updates.
    """
    device, compute_type = _resolve_device_and_compute(device, compute_type)

    if progress_callback:
        progress_callback(0.05, "Loading Whisper model…")

    model = await _get_model(model_name, device, compute_type)

    if progress_callback:
        progress_callback(0.15, "Running transcription…")

    loop = asyncio.get_event_loop()
    segments_data, info = await loop.run_in_executor(
        None,
        _run_transcription,
        model,
        str(audio_path),
        language,
    )

    if progress_callback:
        progress_callback(0.90, "Building transcript…")

    segments: list[TranscriptSegment] = []
    for seg in segments_data:
        words = [
            Word(
                word=w["word"],
                start=w["start"],
                end=w["end"],
                confidence=w["confidence"],
            )
            for w in seg["words"]
        ]
        segments.append(
            TranscriptSegment(
                id=seg["id"],
                speaker=seg["speaker"],
                start=seg["start"],
                end=seg["end"],
                words=words,
            )
        )

    transcript = Transcript(
        segments=segments,
        language=info.get("language", "ru"),
        duration=info.get("duration", 0.0),
    )

    if progress_callback:
        progress_callback(1.0, "Transcription complete")

    logger.info(
        "Transcribed '%s': lang=%s, duration=%.1fs, segments=%d",
        video_path,
        transcript.language,
        transcript.duration,
        len(segments),
    )
    return transcript
