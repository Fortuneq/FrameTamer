"""
Export router.

POST /api/projects/{id}/export           – start export job
GET  /api/projects/{id}/export/progress  – SSE progress stream
GET  /api/projects/{id}/export/download  – download the exported file
"""
import asyncio
import json
import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse

from app.config import settings
from app.models.export import ExportJob, ExportRequest
from app.models.project import ProjectStatus
from app.services import project as project_svc
from app.services.video import export_edited_video

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects", tags=["export"])

# In-memory job store (sufficient for a single-user desktop app)
_export_jobs: dict[str, ExportJob] = {}
_export_queues: dict[str, asyncio.Queue] = {}


# ---------------------------------------------------------------------------
# Start export
# ---------------------------------------------------------------------------

@router.post("/{project_id}/export", response_model=ExportJob)
async def start_export(project_id: str, request: ExportRequest) -> ExportJob:
    """
    Kick off a background export job.
    The client should then poll /export/progress via SSE.
    """
    try:
        project = await project_svc.load_project(project_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")

    if project.transcript is None:
        raise HTTPException(status_code=400, detail="Transcript required before export")

    video_path = project.get_video_path(settings.projects_dir)
    if video_path is None or not video_path.exists():
        raise HTTPException(status_code=400, detail="Video file not found")

    # Build time ranges from transcript
    ranges = project.transcript.get_kept_time_ranges()
    if not ranges:
        raise HTTPException(status_code=400, detail="No active content to export")

    # Prepare output path
    output_name = request.settings.output_name or f"export_{project.name}"
    output_name = output_name.replace(" ", "_")
    ext = request.settings.format.value
    output_path = project.get_project_dir(settings.projects_dir) / f"{output_name}.{ext}"

    job = ExportJob(
        project_id=project_id,
        settings=request.settings,
        output_path=str(output_path),
        status="running",
    )
    _export_jobs[project_id] = job
    _export_queues[project_id] = asyncio.Queue()

    # Start background task
    asyncio.create_task(_run_export(job, video_path, ranges, output_path))

    project.status = ProjectStatus.EXPORTING
    await project_svc.save_project(project)

    return job


async def _run_export(
    job: ExportJob,
    video_path: Path,
    ranges: list[tuple[float, float]],
    output_path: Path,
) -> None:
    q = _export_queues.get(job.project_id)
    try:
        await export_edited_video(
            video_path=video_path,
            segments=ranges,
            output_path=output_path,
            video_codec=job.settings.video_codec,
            audio_codec=job.settings.audio_codec,
            crf=job.settings.crf,
            audio_bitrate=job.settings.audio_bitrate,
            resolution=job.settings.resolution.value,
            progress_queue=q,
        )
        job.status = "done"
        job.progress = 1.0
        if q:
            await q.put(("done", 1.0))

        # Update project status
        try:
            project = await project_svc.load_project(job.project_id)
            project.status = ProjectStatus.READY
            await project_svc.save_project(project)
        except Exception:
            pass

    except Exception as exc:
        logger.exception("Export failed for project %s: %s", job.project_id, exc)
        job.status = "error"
        job.error = str(exc)
        if q:
            await q.put(("error", str(exc)))

        try:
            project = await project_svc.load_project(job.project_id)
            project.status = ProjectStatus.ERROR
            project.error_message = str(exc)
            await project_svc.save_project(project)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Export progress – SSE
# ---------------------------------------------------------------------------

@router.get("/{project_id}/export/progress")
async def export_progress(project_id: str) -> StreamingResponse:
    """
    SSE stream for export progress.

    Events:
        data: {"progress": 0.45}
        data: {"status": "done"}
        data: {"error": "..."}
    """
    if project_id not in _export_jobs:
        raise HTTPException(status_code=404, detail="No export job for this project")

    async def stream():
        job = _export_jobs[project_id]
        q = _export_queues.get(project_id)

        # If job already finished before SSE connected, send final event
        if job.status in ("done", "error"):
            if job.status == "done":
                yield f"data: {json.dumps({'status': 'done', 'progress': 1.0})}\n\n"
            else:
                yield f"data: {json.dumps({'error': job.error})}\n\n"
            return

        while True:
            if q is None:
                break
            item = await q.get()
            kind, value = item

            if kind == "done":
                yield f"data: {json.dumps({'status': 'done', 'progress': 1.0})}\n\n"
                break
            elif kind == "error":
                yield f"data: {json.dumps({'error': value})}\n\n"
                break
            else:
                # value is a float progress 0–1
                progress = float(value)
                job.progress = progress
                yield f"data: {json.dumps({'progress': round(progress, 3)})}\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------------------------------------------------------------------------
# Download exported file
# ---------------------------------------------------------------------------

@router.get("/{project_id}/export/download")
async def download_export(project_id: str) -> FileResponse:
    job = _export_jobs.get(project_id)
    if job is None:
        raise HTTPException(status_code=404, detail="No export job for this project")
    if job.status != "done":
        raise HTTPException(status_code=400, detail="Export not finished yet")

    output_path = Path(job.output_path)
    if not output_path.exists():
        raise HTTPException(status_code=404, detail="Exported file not found on disk")

    return FileResponse(
        path=output_path,
        filename=output_path.name,
        media_type="video/mp4",
    )
