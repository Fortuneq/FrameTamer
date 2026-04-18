"""
Low-level FFmpeg subprocess helpers.

All functions run FFmpeg as a child process via asyncio.create_subprocess_exec
so they do not block the event loop.
"""
import asyncio
import json
import logging
import re
import shutil
from pathlib import Path

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# FFmpeg / FFprobe binary resolution
# ---------------------------------------------------------------------------

def _find_binary(name: str) -> str:
    path = shutil.which(name)
    if path is None:
        raise RuntimeError(
            f"'{name}' not found in PATH. "
            "Install FFmpeg: https://ffmpeg.org/download.html"
        )
    return path


def ffmpeg_bin() -> str:
    return _find_binary("ffmpeg")


def ffprobe_bin() -> str:
    return _find_binary("ffprobe")


# ---------------------------------------------------------------------------
# Async subprocess helpers
# ---------------------------------------------------------------------------

async def run_ffmpeg(*args: str, check: bool = True) -> tuple[int, str, str]:
    """
    Run ffmpeg with the given arguments.
    Returns (returncode, stdout, stderr).
    Raises RuntimeError on non-zero exit when check=True.
    """
    cmd = [ffmpeg_bin(), "-hide_banner", "-loglevel", "error", *args]
    logger.debug("FFmpeg: %s", " ".join(cmd))
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout_b, stderr_b = await proc.communicate()
    stdout = stdout_b.decode("utf-8", errors="replace")
    stderr = stderr_b.decode("utf-8", errors="replace")

    if check and proc.returncode != 0:
        raise RuntimeError(
            f"FFmpeg failed (exit {proc.returncode}):\n{stderr}"
        )
    return proc.returncode, stdout, stderr


async def run_ffprobe(*args: str) -> tuple[int, str, str]:
    """Run ffprobe with the given arguments."""
    cmd = [ffprobe_bin(), "-hide_banner", *args]
    logger.debug("FFprobe: %s", " ".join(cmd))
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout_b, stderr_b = await proc.communicate()
    stdout = stdout_b.decode("utf-8", errors="replace")
    stderr = stderr_b.decode("utf-8", errors="replace")
    return proc.returncode or 0, stdout, stderr


# ---------------------------------------------------------------------------
# FFprobe helpers
# ---------------------------------------------------------------------------

async def probe_json(video_path: str | Path) -> dict:
    """Return full ffprobe JSON output for a media file."""
    _, stdout, _ = await run_ffprobe(
        "-v", "quiet",
        "-print_format", "json",
        "-show_streams",
        "-show_format",
        str(video_path),
    )
    return json.loads(stdout)


async def get_duration(path: str | Path) -> float:
    """Return media duration in seconds."""
    data = await probe_json(path)
    # Try format duration first (most reliable)
    fmt = data.get("format", {})
    if "duration" in fmt:
        return float(fmt["duration"])
    # Fall back to first stream
    for stream in data.get("streams", []):
        if "duration" in stream:
            return float(stream["duration"])
    return 0.0


def parse_progress_time(line: str) -> float | None:
    """
    Parse 'time=HH:MM:SS.ss' from an ffmpeg progress stderr line.
    Returns seconds or None if not found.
    """
    match = re.search(r"time=(\d+):(\d+):(\d+\.\d+)", line)
    if match:
        h, m, s = int(match.group(1)), int(match.group(2)), float(match.group(3))
        return h * 3600 + m * 60 + s
    return None


async def run_ffmpeg_with_progress(
    args: list[str],
    total_duration: float,
    progress_callback: "asyncio.Queue[float] | None" = None,
) -> None:
    """
    Run ffmpeg and push progress values (0.0–1.0) into an asyncio.Queue.
    Uses ffmpeg's pipe:1 progress protocol.
    """
    cmd = [
        ffmpeg_bin(), "-hide_banner",
        "-progress", "pipe:1",  # write progress to stdout
        "-nostats",
        *args,
    ]
    logger.debug("FFmpeg progress: %s", " ".join(cmd))
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    assert proc.stdout is not None

    while True:
        raw = await proc.stdout.readline()
        if not raw:
            break
        line = raw.decode("utf-8", errors="replace").strip()
        if line.startswith("out_time_ms="):
            try:
                ms = int(line.split("=")[1])
                seconds = ms / 1_000_000
                if total_duration > 0 and progress_callback is not None:
                    pct = min(seconds / total_duration, 1.0)
                    await progress_callback.put(pct)
            except (ValueError, IndexError):
                pass

    await proc.wait()
    if proc.returncode != 0:
        stderr_b = await proc.stderr.read() if proc.stderr else b""
        raise RuntimeError(
            f"FFmpeg failed (exit {proc.returncode}):\n"
            f"{stderr_b.decode('utf-8', errors='replace')}"
        )
    if progress_callback is not None:
        await progress_callback.put(1.0)
