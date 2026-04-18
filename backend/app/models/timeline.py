import uuid
from enum import Enum

from pydantic import BaseModel, Field


class ClipType(str, Enum):
    VIDEO = "video"
    AUDIO = "audio"
    TEXT = "text"


class Clip(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    clip_type: ClipType = ClipType.VIDEO

    # Position on timeline (seconds)
    timeline_start: float
    timeline_end: float

    # Source file offsets (seconds)
    source_start: float
    source_end: float

    # Source file reference
    source_file: str = ""

    # Display properties
    label: str = ""
    muted: bool = False
    volume: float = 1.0

    @property
    def duration(self) -> float:
        return self.timeline_end - self.timeline_start

    @property
    def source_duration(self) -> float:
        return self.source_end - self.source_start


class Track(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str = ""
    clip_type: ClipType = ClipType.VIDEO
    clips: list[Clip] = Field(default_factory=list)
    muted: bool = False
    locked: bool = False
    height: int = 80  # pixels in UI

    def get_total_duration(self) -> float:
        if not self.clips:
            return 0.0
        return max(c.timeline_end for c in self.clips)


class Timeline(BaseModel):
    tracks: list[Track] = Field(default_factory=list)
    duration: float = 0.0
    fps: float = 30.0

    def rebuild_from_transcript_ranges(
        self,
        source_file: str,
        ranges: list[tuple[float, float]],
    ) -> None:
        """
        Rebuild the primary video track from a list of (start, end) keep ranges.
        Called after transcript editing to sync timeline.
        """
        video_track = Track(name="Video", clip_type=ClipType.VIDEO)
        timeline_cursor = 0.0

        for src_start, src_end in ranges:
            clip = Clip(
                clip_type=ClipType.VIDEO,
                timeline_start=timeline_cursor,
                timeline_end=timeline_cursor + (src_end - src_start),
                source_start=src_start,
                source_end=src_end,
                source_file=source_file,
            )
            video_track.clips.append(clip)
            timeline_cursor += src_end - src_start

        self.tracks = [video_track]
        self.duration = timeline_cursor
