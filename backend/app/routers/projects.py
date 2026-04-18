"""
Projects CRUD router.

POST   /api/projects          – create project + upload video
GET    /api/projects          – list all projects
GET    /api/projects/{id}     – project details
PATCH  /api/projects/{id}     – update name/description
DELETE /api/projects/{id}     – remove project
"""
import logging
import shutil
from pathlib import Path

import aiofiles  # type: ignore
from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from app.config import settings
from app.models.project import Project, ProjectSummary, ProjectUpdate, VideoInfo
from app.services.project import (
    delete_project,
    list_projects,
    load_project,
    save_project,
)
from app.services.video import generate_thumbnail, get_video_info
from app.utils.file_utils import generate_unique_filename, is_video_file

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects", tags=["projects"])


# ---------------------------------------------------------------------------
# Create project
# ---------------------------------------------------------------------------

@router.post("", status_code=status.HTTP_201_CREATED, response_model=Project)
async def create_project(
    name: str = Form(...),
    description: str = Form(""),
    file: UploadFile = File(...),
) -> Project:
    """Upload a video and create a new project."""
    if not is_video_file(file.filename or ""):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file type. Please upload a video file.",
        )

    settings.ensure_dirs()

    project = Project(name=name, description=description)
    proj_dir = project.get_project_dir(settings.projects_dir)
    proj_dir.mkdir(parents=True, exist_ok=True)
    (proj_dir / "thumbnails").mkdir(exist_ok=True)

    # Save uploaded file
    filename = generate_unique_filename(file.filename or "video.mp4")
    video_path = proj_dir / filename
    async with aiofiles.open(video_path, "wb") as f:
        while chunk := await file.read(1024 * 1024):  # 1 MB chunks
            await f.write(chunk)

    project.video_filename = filename

    # Probe video metadata
    try:
        info = await get_video_info(video_path)
        project.video_info = VideoInfo(**info)
    except Exception as exc:
        logger.warning("Could not probe video info: %s", exc)

    # Generate thumbnail at 1 second (or at 0 if shorter)
    try:
        thumb_time = min(1.0, project.video_info.duration / 2) if project.video_info.duration > 0 else 0.0
        thumb_path = proj_dir / "thumbnails" / "thumb.jpg"
        await generate_thumbnail(video_path, thumb_time, thumb_path)
        project.thumbnail_filename = "thumb.jpg"
    except Exception as exc:
        logger.warning("Could not generate thumbnail: %s", exc)

    await save_project(project)
    logger.info("Project created: %s (%s)", project.id, project.name)
    return project


# ---------------------------------------------------------------------------
# List projects
# ---------------------------------------------------------------------------

@router.get("", response_model=list[ProjectSummary])
async def get_projects() -> list[ProjectSummary]:
    return await list_projects()


# ---------------------------------------------------------------------------
# Get project details
# ---------------------------------------------------------------------------

@router.get("/{project_id}", response_model=Project)
async def get_project(project_id: str) -> Project:
    try:
        return await load_project(project_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")


# ---------------------------------------------------------------------------
# Update project metadata
# ---------------------------------------------------------------------------

@router.patch("/{project_id}", response_model=Project)
async def update_project(project_id: str, payload: ProjectUpdate) -> Project:
    try:
        project = await load_project(project_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")

    if payload.name is not None:
        project.name = payload.name
    if payload.description is not None:
        project.description = payload.description

    await save_project(project)
    return project


# ---------------------------------------------------------------------------
# Delete project
# ---------------------------------------------------------------------------

@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_project(project_id: str) -> None:
    try:
        await delete_project(project_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")


# ---------------------------------------------------------------------------
# Thumbnail
# ---------------------------------------------------------------------------

@router.get("/{project_id}/thumbnail")
async def get_thumbnail(project_id: str) -> FileResponse:
    try:
        project = await load_project(project_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")

    thumb_path = project.get_thumbnail_path(settings.projects_dir)
    if thumb_path is None or not thumb_path.exists():
        raise HTTPException(status_code=404, detail="Thumbnail not available")

    return FileResponse(thumb_path, media_type="image/jpeg")


# ---------------------------------------------------------------------------
# Serve video file
# ---------------------------------------------------------------------------

@router.get("/{project_id}/video")
async def get_video(project_id: str) -> FileResponse:
    try:
        project = await load_project(project_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")

    video_path = project.get_video_path(settings.projects_dir)
    if video_path is None or not video_path.exists():
        raise HTTPException(status_code=404, detail="Video not available")

    return FileResponse(video_path, media_type="video/mp4")
