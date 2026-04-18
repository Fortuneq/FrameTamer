import asyncio
import hashlib
import shutil
import tempfile
import uuid
from pathlib import Path


ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v", ".flv", ".wmv"}
ALLOWED_AUDIO_EXTENSIONS = {".mp3", ".wav", ".aac", ".flac", ".ogg", ".m4a"}


def is_video_file(path: Path | str) -> bool:
    return Path(path).suffix.lower() in ALLOWED_VIDEO_EXTENSIONS


def is_audio_file(path: Path | str) -> bool:
    return Path(path).suffix.lower() in ALLOWED_AUDIO_EXTENSIONS


def generate_unique_filename(original_name: str) -> str:
    """Return a UUID-based filename preserving the original extension."""
    ext = Path(original_name).suffix.lower()
    return f"{uuid.uuid4()}{ext}"


def safe_filename(name: str) -> str:
    """Sanitise a display name so it can be used as a filesystem component."""
    keep = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_. ")
    sanitised = "".join(c if c in keep else "_" for c in name)
    return sanitised.strip() or "untitled"


def file_md5(path: Path) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def human_size(num_bytes: int) -> str:
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if abs(num_bytes) < 1024.0:
            return f"{num_bytes:3.1f} {unit}"
        num_bytes /= 1024.0  # type: ignore[assignment]
    return f"{num_bytes:.1f} PB"


def make_temp_path(suffix: str = "") -> Path:
    """Create a unique temp file path (not yet created on disk)."""
    return Path(tempfile.gettempdir()) / f"mydescript_{uuid.uuid4()}{suffix}"


async def async_remove(path: Path) -> None:
    """Remove a file asynchronously without blocking the event loop."""
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, lambda: path.unlink(missing_ok=True))


async def async_copy(src: Path, dst: Path) -> None:
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, shutil.copy2, str(src), str(dst))


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path
