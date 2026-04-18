"""
Video operations service.

All heavy work is done via FFmpeg subprocesses so the event loop
stays unblocked.  Waveform generation uses numpy/librosa for accuracy.
"""
import asyncio
import logging
from pathlib import Path
from typing import Any

import numpy as np

from app.utils.ffmpeg import probe_json, run_ffmpeg, run_ffmpeg_with_progress

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Media info
# ---------------------------------------------------------------------------

async def get_video_info(video_path: str | Path) -> dict[str, Any]:
    """
    Return a dict with:
        duration, width, height, fps, codec, audio_codec, file_size
    """
    path = Path(video_path)
    data = await probe_json(path)
    streams = data.get("streams", [])
    fmt = data.get("format", {})

    video_stream = next((s for s in streams if s.get("codec_type") == "video"), {})
    audio_stream = next((s for s in streams if s.get("codec_type") == "audio"), {})

    # Parse FPS from avg_frame_rate or r_frame_rate (e.g. "30000/1001")
    fps = 0.0
    raw_fps = video_stream.get("avg_frame_rate") or video_stream.get("r_frame_rate", "0/1")
    try:
        parts = raw_fps.split("/")
        if len(parts) == 2 and float(parts[1]) != 0:
            fps = float(parts[0]) / float(parts[1])
    except (ValueError, ZeroDivisionError):
        pass

    return {
        "duration": float(fmt.get("duration", 0.0)),
        "width": int(video_stream.get("width", 0)),
        "height": int(video_stream.get("height", 0)),
        "fps": round(fps, 3),
        "codec": video_stream.get("codec_name", ""),
        "audio_codec": audio_stream.get("codec_name", ""),
        "file_size": int(fmt.get("size", 0)),
    }


# ---------------------------------------------------------------------------
# Audio extraction
# ---------------------------------------------------------------------------

async def extract_audio(
    video_path: str | Path,
    output_path: str | Path,
    sample_rate: int = 16000,
) -> Path:
    """
    Extract audio track from video and save as mono WAV at *sample_rate* Hz.
    Returns the output path.
    """
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)

    await run_ffmpeg(
        "-y",
        "-i", str(video_path),
        "-vn",                   # no video
        "-ac", "1",              # mono
        "-ar", str(sample_rate), # sample rate
        "-acodec", "pcm_s16le",  # 16-bit PCM WAV
        str(out),
    )
    logger.info("Audio extracted: %s", out)
    return out


# ---------------------------------------------------------------------------
# Thumbnail generation
# ---------------------------------------------------------------------------

async def generate_thumbnail(
    video_path: str | Path,
    time_sec: float,
    output_path: str | Path,
    width: int = 640,
) -> Path:
    """
    Extract a single frame at *time_sec* seconds and save as JPEG.
    """
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)

    await run_ffmpeg(
        "-y",
        "-ss", str(time_sec),
        "-i", str(video_path),
        "-vframes", "1",
        "-vf", f"scale={width}:-1",
        "-q:v", "2",             # JPEG quality (2 = near-lossless)
        str(out),
    )
    logger.info("Thumbnail saved: %s", out)
    return out


# ---------------------------------------------------------------------------
# Waveform
# ---------------------------------------------------------------------------

async def generate_waveform(
    audio_path: str | Path,
    samples_per_second: int = 10,  # 1 point per 100ms
) -> list[float]:
    """
    Load audio with librosa and return normalised amplitude values.
    Each value represents the RMS amplitude for a 100ms window.

    Falls back to numpy if librosa is unavailable.
    """
    path = str(audio_path)

    loop = asyncio.get_event_loop()
    waveform = await loop.run_in_executor(
        None,
        _compute_waveform,
        path,
        samples_per_second,
    )
    return waveform


def _compute_waveform(audio_path: str, samples_per_second: int) -> list[float]:
    try:
        import librosa  # type: ignore

        y, sr = librosa.load(audio_path, sr=None, mono=True)
        hop_length = max(1, int(sr / samples_per_second))
        rms = librosa.feature.rms(y=y, frame_length=hop_length * 2, hop_length=hop_length)[0]
        # Normalise to 0–1
        max_val = float(rms.max()) if rms.max() > 0 else 1.0
        return [round(float(v) / max_val, 4) for v in rms]
    except ImportError:
        logger.warning("librosa not available, falling back to soundfile for waveform")
        import soundfile as sf  # type: ignore

        data, sr = sf.read(audio_path, dtype="float32", always_2d=False)
        if data.ndim > 1:
            data = data.mean(axis=1)
        hop = max(1, int(sr / samples_per_second))
        chunks = [data[i : i + hop] for i in range(0, len(data), hop)]
        rms_vals = np.array([np.sqrt(np.mean(c ** 2)) for c in chunks if len(c) > 0])
        max_val = float(rms_vals.max()) if rms_vals.max() > 0 else 1.0
        return [round(float(v) / max_val, 4) for v in rms_vals]


# ---------------------------------------------------------------------------
# Export – cut & concatenate
# ---------------------------------------------------------------------------

async def export_edited_video(
    video_path: str | Path,
    segments: list[tuple[float, float]],
    output_path: str | Path,
    video_codec: str = "libx264",
    audio_codec: str = "aac",
    crf: int = 23,
    audio_bitrate: str = "192k",
    resolution: str = "original",
    progress_queue: asyncio.Queue | None = None,
) -> Path:
    """
    Cut *video_path* into *segments* [(start, end), ...] and concatenate them.

    Strategy: use the FFmpeg concat filter with trim/setpts/atrim/asetpts
    to avoid intermediate files and re-encode only once.

    If the segment list is empty, raise ValueError.
    """
    if not segments:
        raise ValueError("No segments provided for export")

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)

    # Build a complex filtergraph
    # Each segment contributes [v{i}][a{i}] pairs that are concatenated.
    filter_parts: list[str] = []
    v_labels: list[str] = []
    a_labels: list[str] = []

    for i, (start, end) in enumerate(segments):
        # Video segment: trim → setpts (reset timestamps to avoid gaps)
        filter_parts.append(
            f"[0:v]trim=start={start}:end={end},setpts=PTS-STARTPTS[v{i}]"
        )
        # Audio segment
        filter_parts.append(
            f"[0:a]atrim=start={start}:end={end},asetpts=PTS-STARTPTS[a{i}]"
        )
        v_labels.append(f"[v{i}]")
        a_labels.append(f"[a{i}]")

    n = len(segments)
    all_labels = "".join(v_labels) + "".join(a_labels)
    filter_parts.append(f"{all_labels}concat=n={n}:v=1:a=1[outv][outa]")
    filter_complex = ";".join(filter_parts)

    # Optional scale filter
    vf_output = "[outv]"
    if resolution != "original" and "x" in resolution:
        w, h = resolution.split("x")
        vf_output = "[outv_scaled]"
        filter_parts[-1] = filter_parts[-1].rstrip(";") + f";[outv]scale={w}:{h}[outv_scaled]"
        filter_complex = ";".join(filter_parts)

    ffmpeg_args = [
        "-y",
        "-i", str(video_path),
        "-filter_complex", filter_complex,
        "-map", vf_output,
        "-map", "[outa]",
        "-c:v", video_codec,
        "-crf", str(crf),
        "-c:a", audio_codec,
        "-b:a", audio_bitrate,
        "-movflags", "+faststart",
        str(out),
    ]

    total_duration = sum(end - start for start, end in segments)

    if progress_queue is not None:
        await run_ffmpeg_with_progress(ffmpeg_args, total_duration, progress_queue)
    else:
        await run_ffmpeg(*ffmpeg_args)

    logger.info("Exported video: %s (%d segments)", out, n)
    return out
