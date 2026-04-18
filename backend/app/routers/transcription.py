"""
Transcription router.

POST /api/projects/{id}/transcribe   – start transcription, SSE progress
GET  /api/projects/{id}/transcript   – get current transcript
PUT  /api/projects/{id}/transcript   – save edited transcript
"""
import asyncio
import json
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse

from app.config import settings
from app.models.project import ProjectStatus
from app.models.transcript import Transcript
from app.services import project as project_svc
from app.services.transcription import transcribe_video
from app.services.video import extract_audio

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects", tags=["transcription"])


# ---------------------------------------------------------------------------
# Start transcription – SSE stream
# ---------------------------------------------------------------------------

@router.post("/{project_id}/transcribe")
async def start_transcription(project_id: str) -> StreamingResponse:
    """
    Launch transcription and stream progress events to the client via SSE.

    Event format:
        data: {"progress": 0.45, "message": "Running transcription…"}
        data: {"progress": 1.0, "message": "Done", "transcript": {...}}
        data: {"error": "..."}
    """
    try:
        project = await project_svc.load_project(project_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")

    video_path = project.get_video_path(settings.projects_dir)
    if video_path is None or not video_path.exists():
        raise HTTPException(status_code=400, detail="Video file not found for this project")

    if project.status == ProjectStatus.TRANSCRIBING:
        raise HTTPException(status_code=409, detail="Transcription already in progress")

    async def event_stream():
        project.status = ProjectStatus.TRANSCRIBING
        project.error_message = ""
        await project_svc.save_project(project)

        # Channel for progress updates from the background task
        progress_queue: asyncio.Queue[tuple[float, str]] = asyncio.Queue()

        def progress_callback(fraction: float, message: str) -> None:
            # put_nowait is safe from sync context inside executor
            try:
                progress_queue.put_nowait((fraction, message))
            except asyncio.QueueFull:
                pass

        async def _transcribe():
            try:
                proj_dir = project.get_project_dir(settings.projects_dir)
                audio_path = proj_dir / "audio.wav"

                progress_callback(0.02, "Extracting audio…")
                await extract_audio(video_path, audio_path)

                transcript = await transcribe_video(
                    video_path=video_path,
                    audio_path=audio_path,
                    model_name=settings.whisper_model,
                    device=settings.whisper_device,
                    compute_type=settings.whisper_compute_type,
                    progress_callback=progress_callback,
                )
                await progress_queue.put((2.0, json.dumps(transcript.model_dump(mode="json"))))
            except Exception as exc:
                logger.exception("Transcription failed: %s", exc)
                await progress_queue.put((-1.0, str(exc)))

        task = asyncio.create_task(_transcribe())

        while True:
            item = await progress_queue.get()
            fraction, payload = item

            if fraction == -1.0:
                # Error
                project.status = ProjectStatus.ERROR
                project.error_message = payload
                await project_svc.save_project(project)
                yield f"data: {json.dumps({'error': payload})}\n\n"
                break
            elif fraction == 2.0:
                # Done – payload is the serialised transcript JSON string
                transcript_data = json.loads(payload)
                transcript = Transcript.model_validate(transcript_data)
                project.transcript = transcript
                project.status = ProjectStatus.READY
                project.audio_filename = "audio.wav"
                await project_svc.save_project(project)
                yield (
                    f"data: {json.dumps({'progress': 1.0, 'message': 'Done', 'transcript': transcript_data})}\n\n"
                )
                break
            else:
                yield f"data: {json.dumps({'progress': round(fraction, 3), 'message': payload})}\n\n"

        await task  # ensure task cleanup

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# Get transcript
# ---------------------------------------------------------------------------

@router.get("/{project_id}/transcript", response_model=Transcript)
async def get_transcript(project_id: str) -> Transcript:
    try:
        project = await project_svc.load_project(project_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")

    if project.transcript is None:
        raise HTTPException(status_code=404, detail="Transcript not available. Run transcription first.")

    return project.transcript


# ---------------------------------------------------------------------------
# Save transcript (after manual editing)
# ---------------------------------------------------------------------------

@router.put("/{project_id}/transcript", response_model=Transcript)
async def save_transcript(project_id: str, transcript: Transcript) -> Transcript:
    try:
        project = await project_svc.load_project(project_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")

    project.transcript = transcript
    await project_svc.save_project(project)
    return transcript
