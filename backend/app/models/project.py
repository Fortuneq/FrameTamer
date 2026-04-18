import uuid
from datetime import datetime
from enum import Enum
from pathlib import Path

from pydantic import BaseModel, Field

from app.models.transcript import Transcript
from app.models.timeline import Timeline


class ProjectStatus(str, Enum):
    CREATED = "created"
    TRANSCRIBING = "transcribing"
    READY = "ready"
    EXPORTING = "exporting"
    ERROR = "error"


class VideoInfo(BaseModel):
    duration: float = 0.0
    width: int = 0
    height: int = 0
    fps: float = 0.0
    codec: str = ""
    audio_codec: str = ""
    file_size: int = 0  # bytes


class Project(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str = ""
    status: ProjectStatus = ProjectStatus.CREATED
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    # File paths (relative to project directory)
    video_filename: str = ""
    audio_filename: str = ""
    thumbnail_filename: str = ""

    # Media info
    video_info: VideoInfo = Field(default_factory=VideoInfo)

    # Content
    transcript: Transcript | None = None
    timeline: Timeline | None = None

    # Error info
    error_message: str = ""

    def get_project_dir(self, base_dir: Path) -> Path:
        return base_dir / self.id

    def get_video_path(self, base_dir: Path) -> Path | None:
        if not self.video_filename:
            return None
        return self.get_project_dir(base_dir) / self.video_filename

    def get_audio_path(self, base_dir: Path) -> Path | None:
        if not self.audio_filename:
            return None
        return self.get_project_dir(base_dir) / self.audio_filename

    def get_thumbnail_path(self, base_dir: Path) -> Path | None:
        if not self.thumbnail_filename:
            return None
        return self.get_project_dir(base_dir) / "thumbnails" / self.thumbnail_filename


class ProjectCreate(BaseModel):
    name: str
    description: str = ""


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class ProjectSummary(BaseModel):
    """Lightweight project representation for list endpoints."""
    id: str
    name: str
    description: str
    status: ProjectStatus
    created_at: datetime
    updated_at: datetime
    video_filename: str
    thumbnail_filename: str
    duration: float
    has_transcript: bool
