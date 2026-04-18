"""
Media library router.

POST /api/media/upload  – upload a media file to the global library
GET  /api/media         – list all media files
GET  /api/media/{name}  – serve/download a media file
DELETE /api/media/{name} – remove a media file
"""
import logging
from pathlib import Path

import aiofiles  # type: ignore
from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.config import settings
from app.utils.file_utils import (
    generate_unique_filename,
    human_size,
    is_audio_file,
    is_video_file,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/media", tags=["media"])


class MediaFileInfo(BaseModel):
    filename: str
    original_name: str
    size: int
    size_human: str
    media_type: str  # video | audio | other


def _detect_media_type(filename: str) -> str:
    if is_video_file(filename):
        return "video"
    if is_audio_file(filename):
        return "audio"
    return "other"


def _read_media_index(media_dir: Path) -> dict[str, str]:
    """Read filename → original_name mapping from index file."""
    index_file = media_dir / ".index.json"
    if index_file.exists():
        import json
        try:
            return json.loads(index_file.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def _write_media_index(media_dir: Path, index: dict[str, str]) -> None:
    import json
    index_file = media_dir / ".index.json"
    index_file.write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------

@router.post("/upload", status_code=status.HTTP_201_CREATED, response_model=MediaFileInfo)
async def upload_media(file: UploadFile = File(...)) -> MediaFileInfo:
    settings.ensure_dirs()
    media_dir = settings.media_dir

    original_name = file.filename or "file"
    stored_name = generate_unique_filename(original_name)
    dest_path = media_dir / stored_name

    async with aiofiles.open(dest_path, "wb") as f:
        while chunk := await file.read(1024 * 1024):
            await f.write(chunk)

    size = dest_path.stat().st_size

    # Update index
    index = _read_media_index(media_dir)
    index[stored_name] = original_name
    _write_media_index(media_dir, index)

    logger.info("Media uploaded: %s → %s (%s)", original_name, stored_name, human_size(size))

    return MediaFileInfo(
        filename=stored_name,
        original_name=original_name,
        size=size,
        size_human=human_size(size),
        media_type=_detect_media_type(original_name),
    )


# ---------------------------------------------------------------------------
# List media
# ---------------------------------------------------------------------------

@router.get("", response_model=list[MediaFileInfo])
async def list_media() -> list[MediaFileInfo]:
    media_dir = settings.media_dir
    if not media_dir.exists():
        return []

    index = _read_media_index(media_dir)
    files: list[MediaFileInfo] = []

    for p in sorted(media_dir.iterdir()):
        if p.name.startswith(".") or not p.is_file():
            continue
        original = index.get(p.name, p.name)
        size = p.stat().st_size
        files.append(
            MediaFileInfo(
                filename=p.name,
                original_name=original,
                size=size,
                size_human=human_size(size),
                media_type=_detect_media_type(original),
            )
        )

    return files


# ---------------------------------------------------------------------------
# Serve / download
# ---------------------------------------------------------------------------

@router.get("/{filename}")
async def get_media_file(filename: str) -> FileResponse:
    media_path = settings.media_dir / filename
    if not media_path.exists() or not media_path.is_file():
        raise HTTPException(status_code=404, detail="Media file not found")

    return FileResponse(media_path, filename=filename)


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------

@router.delete("/{filename}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_media(filename: str) -> None:
    media_dir = settings.media_dir
    media_path = media_dir / filename
    if not media_path.exists():
        raise HTTPException(status_code=404, detail="Media file not found")

    media_path.unlink()

    index = _read_media_index(media_dir)
    index.pop(filename, None)
    _write_media_index(media_dir, index)

    logger.info("Media deleted: %s", filename)
