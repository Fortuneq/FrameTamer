"""
Editor operations router.

Handles transcript editing: word deletions, segment splits/merges,
speaker labelling, and waveform data fetching.

GET  /api/projects/{id}/waveform          – waveform amplitude array
POST /api/projects/{id}/editor/words/delete  – mark words as deleted
POST /api/projects/{id}/editor/words/restore – restore deleted words
POST /api/projects/{id}/editor/sync-timeline – rebuild timeline from transcript
"""
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.models.timeline import Timeline
from app.services import project as project_svc
from app.services.video import generate_waveform

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects", tags=["editor"])


# ---------------------------------------------------------------------------
# Waveform
# ---------------------------------------------------------------------------

@router.get("/{project_id}/waveform")
async def get_waveform(project_id: str) -> dict:
    """Return amplitude array for the project's audio track."""
    try:
        project = await project_svc.load_project(project_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")

    audio_path = project.get_audio_path(settings.projects_dir)
    if audio_path is None or not audio_path.exists():
        # Fall back to video directly if audio hasn't been extracted yet
        video_path = project.get_video_path(settings.projects_dir)
        if video_path is None or not video_path.exists():
            raise HTTPException(status_code=404, detail="No audio/video available")

        from app.services.video import extract_audio
        proj_dir = project.get_project_dir(settings.projects_dir)
        audio_path = proj_dir / "audio.wav"
        await extract_audio(video_path, audio_path)
        project.audio_filename = "audio.wav"
        await project_svc.save_project(project)

    try:
        amplitudes = await generate_waveform(audio_path)
    except Exception as exc:
        logger.error("Waveform generation failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Waveform generation failed: {exc}")

    return {
        "project_id": project_id,
        "samples_per_second": 10,
        "data": amplitudes,
        "total_samples": len(amplitudes),
    }


# ---------------------------------------------------------------------------
# Word operations
# ---------------------------------------------------------------------------

class WordIndexList(BaseModel):
    # Flat indices into the transcript's all_words list
    indices: list[int]


@router.post("/{project_id}/editor/words/delete")
async def delete_words(project_id: str, payload: WordIndexList) -> dict:
    """Mark words as deleted (soft delete – they stay in JSON, flagged as deleted=True)."""
    try:
        project = await project_svc.load_project(project_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")

    if project.transcript is None:
        raise HTTPException(status_code=400, detail="No transcript available")

    index_set = set(payload.indices)
    flat_index = 0
    for seg in project.transcript.segments:
        for word in seg.words:
            if flat_index in index_set:
                word.deleted = True
            flat_index += 1

    await project_svc.save_project(project)
    return {"deleted": sorted(index_set), "message": f"{len(index_set)} word(s) marked as deleted"}


@router.post("/{project_id}/editor/words/restore")
async def restore_words(project_id: str, payload: WordIndexList) -> dict:
    """Restore previously deleted words."""
    try:
        project = await project_svc.load_project(project_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")

    if project.transcript is None:
        raise HTTPException(status_code=400, detail="No transcript available")

    index_set = set(payload.indices)
    flat_index = 0
    for seg in project.transcript.segments:
        for word in seg.words:
            if flat_index in index_set:
                word.deleted = False
            flat_index += 1

    await project_svc.save_project(project)
    return {"restored": sorted(index_set), "message": f"{len(index_set)} word(s) restored"}


# ---------------------------------------------------------------------------
# Sync timeline from transcript
# ---------------------------------------------------------------------------

@router.post("/{project_id}/editor/sync-timeline")
async def sync_timeline(project_id: str) -> dict:
    """
    Rebuild the project timeline from the current transcript's active words.
    Call this after any editing to prepare for export.
    """
    try:
        project = await project_svc.load_project(project_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")

    if project.transcript is None:
        raise HTTPException(status_code=400, detail="No transcript available")

    ranges = project.transcript.get_kept_time_ranges()
    if not ranges:
        raise HTTPException(status_code=400, detail="No active words in transcript")

    video_filename = project.video_filename
    timeline = Timeline(fps=project.video_info.fps or 30.0)
    timeline.rebuild_from_transcript_ranges(video_filename, ranges)

    project.timeline = timeline
    await project_svc.save_project(project)

    return {
        "segments": len(ranges),
        "total_duration": timeline.duration,
        "message": "Timeline synced successfully",
    }
