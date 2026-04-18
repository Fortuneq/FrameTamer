"""
Audio analysis utilities.

Silence detection and additional audio helpers that sit
on top of the video service's waveform generation.
"""
import asyncio
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


class SilenceInterval:
    def __init__(self, start: float, end: float) -> None:
        self.start = start
        self.end = end
        self.duration = end - start

    def __repr__(self) -> str:  # pragma: no cover
        return f"SilenceInterval({self.start:.3f}s – {self.end:.3f}s)"


async def detect_silence(
    audio_path: str | Path,
    noise_floor_db: float = -40.0,
    min_duration: float = 0.3,
) -> list[SilenceInterval]:
    """
    Detect silent intervals in an audio file using FFmpeg's silencedetect filter.

    Parameters
    ----------
    audio_path:
        Path to the audio file (WAV / MP3 / etc.)
    noise_floor_db:
        dB threshold below which audio is considered silent.
        -40 dB works well for clean recordings.
    min_duration:
        Minimum silence duration in seconds to report.
    """
    from app.utils.ffmpeg import ffmpeg_bin

    cmd = [
        ffmpeg_bin(), "-hide_banner",
        "-i", str(audio_path),
        "-af", f"silencedetect=noise={noise_floor_db}dB:d={min_duration}",
        "-f", "null", "-",
    ]

    loop = asyncio.get_event_loop()
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr_b = await proc.communicate()
    stderr = stderr_b.decode("utf-8", errors="replace")

    intervals: list[SilenceInterval] = []
    start: float | None = None

    for line in stderr.splitlines():
        if "silence_start:" in line:
            try:
                start = float(line.split("silence_start:")[1].strip())
            except (ValueError, IndexError):
                pass
        elif "silence_end:" in line and start is not None:
            try:
                end_part = line.split("silence_end:")[1].split("|")[0].strip()
                end = float(end_part)
                intervals.append(SilenceInterval(start, end))
                start = None
            except (ValueError, IndexError):
                pass

    logger.info(
        "Silence detection: %d intervals found in %s",
        len(intervals),
        audio_path,
    )
    return intervals


async def get_audio_loudness(audio_path: str | Path) -> dict[str, float]:
    """
    Measure integrated loudness using EBU R128 (loudnorm filter).
    Returns dict with: integrated_loudness, loudness_range, true_peak.
    """
    import json
    from app.utils.ffmpeg import ffmpeg_bin

    cmd = [
        ffmpeg_bin(), "-hide_banner",
        "-i", str(audio_path),
        "-af", "loudnorm=print_format=json",
        "-f", "null", "-",
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr_b = await proc.communicate()
    stderr = stderr_b.decode("utf-8", errors="replace")

    # loudnorm outputs JSON block inside stderr
    json_start = stderr.find("{")
    json_end = stderr.rfind("}") + 1
    if json_start >= 0 and json_end > json_start:
        try:
            data = json.loads(stderr[json_start:json_end])
            return {
                "integrated_loudness": float(data.get("input_i", -70)),
                "loudness_range": float(data.get("input_lra", 0)),
                "true_peak": float(data.get("input_tp", -70)),
            }
        except (json.JSONDecodeError, ValueError):
            pass

    return {"integrated_loudness": -70.0, "loudness_range": 0.0, "true_peak": -70.0}
