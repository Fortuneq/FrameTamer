"""
Project persistence service.

Projects are stored as JSON files on the local filesystem:
    ~/ClipForge/projects/{project_id}/project.json

This module is intentionally thin – it only reads/writes JSON and
delegates business logic to the individual domain services.
"""
import asyncio
import json
import logging
import shutil
from datetime import datetime
from pathlib import Path

import aiofiles  # type: ignore

from app.config import settings
from app.models.project import Project, ProjectStatus, ProjectSummary

logger = logging.getLogger(__name__)

_PROJECT_FILE = "project.json"


# ---------------------------------------------------------------------------
# Path helpers
# ---------------------------------------------------------------------------

def _project_dir(project_id: str) -> Path:
    return settings.projects_dir / project_id


def _project_file(project_id: str) -> Path:
    return _project_dir(project_id) / _PROJECT_FILE


# ---------------------------------------------------------------------------
# Read / Write
# ---------------------------------------------------------------------------

async def save_project(project: Project) -> None:
    """Persist a project to disk as JSON."""
    proj_dir = _project_dir(project.id)
    proj_dir.mkdir(parents=True, exist_ok=True)
    (proj_dir / "thumbnails").mkdir(exist_ok=True)

    project.updated_at = datetime.utcnow()

    data = project.model_dump(mode="json")
    async with aiofiles.open(_project_file(project.id), "w", encoding="utf-8") as f:
        await f.write(json.dumps(data, ensure_ascii=False, indent=2))

    logger.debug("Project saved: %s", project.id)


async def load_project(project_id: str) -> Project:
    """Load a project from disk. Raises FileNotFoundError if not found."""
    path = _project_file(project_id)
    if not path.exists():
        raise FileNotFoundError(f"Project not found: {project_id}")

    async with aiofiles.open(path, "r", encoding="utf-8") as f:
        raw = await f.read()

    data = json.loads(raw)
    return Project.model_validate(data)


async def list_projects() -> list[ProjectSummary]:
    """Return a lightweight summary list of all projects, sorted newest-first."""
    base = settings.projects_dir
    if not base.exists():
        return []

    summaries: list[ProjectSummary] = []

    loop = asyncio.get_event_loop()
    dirs = await loop.run_in_executor(
        None,
        lambda: [d for d in base.iterdir() if d.is_dir()],
    )

    for proj_dir in dirs:
        pf = proj_dir / _PROJECT_FILE
        if not pf.exists():
            continue
        try:
            async with aiofiles.open(pf, "r", encoding="utf-8") as f:
                raw = await f.read()
            data = json.loads(raw)
            # Build summary without parsing heavy transcript data
            summaries.append(
                ProjectSummary(
                    id=data["id"],
                    name=data.get("name", ""),
                    description=data.get("description", ""),
                    status=data.get("status", ProjectStatus.CREATED),
                    created_at=datetime.fromisoformat(data["created_at"]),
                    updated_at=datetime.fromisoformat(data["updated_at"]),
                    video_filename=data.get("video_filename", ""),
                    thumbnail_filename=data.get("thumbnail_filename", ""),
                    duration=data.get("video_info", {}).get("duration", 0.0),
                    has_transcript=bool(data.get("transcript")),
                )
            )
        except Exception as exc:
            logger.warning("Skipping corrupt project '%s': %s", proj_dir.name, exc)

    summaries.sort(key=lambda p: p.updated_at, reverse=True)
    return summaries


async def delete_project(project_id: str) -> None:
    """Delete a project directory from disk."""
    proj_dir = _project_dir(project_id)
    if not proj_dir.exists():
        raise FileNotFoundError(f"Project not found: {project_id}")

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, shutil.rmtree, str(proj_dir))
    logger.info("Project deleted: %s", project_id)


async def project_exists(project_id: str) -> bool:
    return _project_file(project_id).exists()
