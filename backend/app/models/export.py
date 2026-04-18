from enum import Enum

from pydantic import BaseModel, Field


class ExportFormat(str, Enum):
    MP4 = "mp4"
    MOV = "mov"
    WEBM = "webm"
    MKV = "mkv"


class ExportResolution(str, Enum):
    ORIGINAL = "original"
    R_4K = "3840x2160"
    R_1080P = "1920x1080"
    R_720P = "1280x720"
    R_480P = "854x480"


class ExportSettings(BaseModel):
    format: ExportFormat = ExportFormat.MP4
    resolution: ExportResolution = ExportResolution.ORIGINAL
    video_codec: str = "libx264"
    audio_codec: str = "aac"
    crf: int = Field(default=23, ge=0, le=51)
    audio_bitrate: str = "192k"
    include_audio: bool = True
    # Output filename (without extension), empty = auto-generated
    output_name: str = ""


class ExportJob(BaseModel):
    project_id: str
    settings: ExportSettings = Field(default_factory=ExportSettings)
    output_path: str = ""
    progress: float = 0.0  # 0.0 – 1.0
    status: str = "pending"  # pending | running | done | error
    error: str = ""


class ExportRequest(BaseModel):
    settings: ExportSettings = Field(default_factory=ExportSettings)
