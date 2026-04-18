"""
Unit tests for service functions that can run without real video files.
"""
import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.transcript import Transcript, TranscriptSegment, Word
from app.services import project as project_svc
from app.models.project import Project, ProjectStatus, VideoInfo


# ---------------------------------------------------------------------------
# Project service
# ---------------------------------------------------------------------------

class TestProjectService:
    @pytest.mark.asyncio
    async def test_save_and_load(self, patch_settings):
        project = Project(name="Test Save")
        await project_svc.save_project(project)

        loaded = await project_svc.load_project(project.id)
        assert loaded.id == project.id
        assert loaded.name == "Test Save"

    @pytest.mark.asyncio
    async def test_load_not_found(self, patch_settings):
        with pytest.raises(FileNotFoundError):
            await project_svc.load_project("does-not-exist")

    @pytest.mark.asyncio
    async def test_list_projects(self, patch_settings):
        p1 = Project(name="Alpha")
        p2 = Project(name="Beta")
        await project_svc.save_project(p1)
        await project_svc.save_project(p2)

        summaries = await project_svc.list_projects()
        ids = [s.id for s in summaries]
        assert p1.id in ids
        assert p2.id in ids

    @pytest.mark.asyncio
    async def test_delete_project(self, patch_settings):
        project = Project(name="To Delete")
        await project_svc.save_project(project)
        assert await project_svc.project_exists(project.id)

        await project_svc.delete_project(project.id)
        assert not await project_svc.project_exists(project.id)

    @pytest.mark.asyncio
    async def test_delete_not_found(self, patch_settings):
        with pytest.raises(FileNotFoundError):
            await project_svc.delete_project("ghost-id")

    @pytest.mark.asyncio
    async def test_save_project_with_transcript(self, patch_settings):
        project = Project(
            name="With Transcript",
            transcript=Transcript(
                language="ru",
                duration=3.0,
                segments=[
                    TranscriptSegment(
                        start=0.0,
                        end=3.0,
                        words=[Word(word="Привет", start=0.0, end=0.5)],
                    )
                ],
            ),
        )
        await project_svc.save_project(project)
        loaded = await project_svc.load_project(project.id)
        assert loaded.transcript is not None
        assert loaded.transcript.language == "ru"
        assert loaded.transcript.segments[0].words[0].word == "Привет"


# ---------------------------------------------------------------------------
# Transcript model logic (integration with project service)
# ---------------------------------------------------------------------------

class TestTranscriptOperations:
    def _project_with_words(self) -> Project:
        # A and B have a 0.04s gap → merge.  C is 2.5s away → separate.
        return Project(
            name="Words Test",
            transcript=Transcript(
                duration=5.0,
                segments=[
                    TranscriptSegment(
                        start=0.0,
                        end=3.0,
                        words=[
                            Word(word="A", start=0.0, end=0.5),
                            Word(word="B", start=0.54, end=1.0),  # gap = 0.04 < 0.05
                            Word(word="C", start=3.5, end=4.0),   # gap = 2.5 → separate
                        ],
                    )
                ],
            ),
        )

    def test_ranges_with_gap(self):
        project = self._project_with_words()
        assert project.transcript is not None
        ranges = project.transcript.get_kept_time_ranges()
        # A–B merge, C is separate → 2 ranges
        assert len(ranges) == 2

    def test_all_deleted_no_ranges(self):
        project = self._project_with_words()
        assert project.transcript is not None
        for seg in project.transcript.segments:
            for word in seg.words:
                word.deleted = True
        assert project.transcript.get_kept_time_ranges() == []


# ---------------------------------------------------------------------------
# File utils
# ---------------------------------------------------------------------------

class TestFileUtils:
    def test_is_video_file(self):
        from app.utils.file_utils import is_video_file
        assert is_video_file("clip.mp4")
        assert is_video_file("video.MOV")
        assert not is_video_file("document.pdf")
        assert not is_video_file("audio.mp3")

    def test_is_audio_file(self):
        from app.utils.file_utils import is_audio_file
        assert is_audio_file("track.mp3")
        assert is_audio_file("recording.WAV")
        assert not is_audio_file("video.mp4")

    def test_generate_unique_filename(self):
        from app.utils.file_utils import generate_unique_filename
        name = generate_unique_filename("my video.mp4")
        assert name.endswith(".mp4")
        assert name != "my video.mp4"

    def test_safe_filename(self):
        from app.utils.file_utils import safe_filename
        result = safe_filename("Видео/test:2024")
        assert "/" not in result
        assert ":" not in result

    def test_human_size(self):
        from app.utils.file_utils import human_size
        assert "KB" in human_size(2048)
        assert "MB" in human_size(1024 * 1024 * 5)
        assert "B" in human_size(512)
