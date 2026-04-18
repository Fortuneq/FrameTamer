"""
API tests for the /api/projects endpoints.

These tests use TestClient (sync) and mock FFmpeg calls so they
run without a real video file or FFmpeg binary.
"""
import io
import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.models.project import Project, ProjectStatus, VideoInfo
from app.models.transcript import Transcript, TranscriptSegment, Word


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_fake_project(projects_dir: Path) -> Project:
    """Write a minimal project.json to disk and return the project."""
    import asyncio
    from app.services.project import save_project

    project = Project(
        name="Existing Project",
        description="A pre-existing project",
        status=ProjectStatus.READY,
        video_filename="video.mp4",
        video_info=VideoInfo(duration=10.0, width=1920, height=1080, fps=30.0),
    )
    asyncio.get_event_loop().run_until_complete(save_project(project))
    return project


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestHealthEndpoint:
    def test_health(self, client: TestClient):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    def test_root(self, client: TestClient):
        resp = client.get("/")
        assert resp.status_code == 200
        assert "name" in resp.json()


class TestListProjects:
    def test_empty_list(self, client: TestClient):
        resp = client.get("/api/projects")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_returns_created_project(self, client: TestClient, patch_settings):
        project = _make_fake_project(patch_settings / "projects")
        resp = client.get("/api/projects")
        assert resp.status_code == 200
        ids = [p["id"] for p in resp.json()]
        assert project.id in ids


class TestGetProject:
    def test_not_found(self, client: TestClient):
        resp = client.get("/api/projects/nonexistent-id")
        assert resp.status_code == 404

    def test_found(self, client: TestClient, patch_settings):
        project = _make_fake_project(patch_settings / "projects")
        resp = client.get(f"/api/projects/{project.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == project.id
        assert data["name"] == "Existing Project"


class TestUpdateProject:
    def test_update_name(self, client: TestClient, patch_settings):
        project = _make_fake_project(patch_settings / "projects")
        resp = client.patch(
            f"/api/projects/{project.id}",
            json={"name": "Renamed Project"},
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Renamed Project"

    def test_update_not_found(self, client: TestClient):
        resp = client.patch("/api/projects/bad-id", json={"name": "X"})
        assert resp.status_code == 404


class TestDeleteProject:
    def test_delete(self, client: TestClient, patch_settings):
        project = _make_fake_project(patch_settings / "projects")
        resp = client.delete(f"/api/projects/{project.id}")
        assert resp.status_code == 204
        # Confirm it's gone
        resp2 = client.get(f"/api/projects/{project.id}")
        assert resp2.status_code == 404

    def test_delete_not_found(self, client: TestClient):
        resp = client.delete("/api/projects/bad-id")
        assert resp.status_code == 404


class TestCreateProject:
    @patch("app.routers.projects.get_video_info", new_callable=AsyncMock)
    @patch("app.routers.projects.generate_thumbnail", new_callable=AsyncMock)
    def test_create_project(self, mock_thumb, mock_info, client: TestClient):
        mock_info.return_value = {
            "duration": 5.0,
            "width": 1280,
            "height": 720,
            "fps": 30.0,
            "codec": "h264",
            "audio_codec": "aac",
            "file_size": 1024,
        }
        mock_thumb.return_value = Path("/tmp/thumb.jpg")

        fake_video = io.BytesIO(b"fake video content")
        resp = client.post(
            "/api/projects",
            data={"name": "New Project", "description": "Created via test"},
            files={"file": ("my_video.mp4", fake_video, "video/mp4")},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "New Project"
        assert "id" in data
        assert data["video_filename"].endswith(".mp4")

    def test_reject_non_video(self, client: TestClient):
        resp = client.post(
            "/api/projects",
            data={"name": "Bad"},
            files={"file": ("script.py", io.BytesIO(b"print()"), "text/plain")},
        )
        assert resp.status_code == 400


class TestTranscriptEndpoints:
    def _project_with_transcript(self, projects_dir: Path) -> Project:
        import asyncio
        from app.services.project import save_project

        project = Project(
            name="Has Transcript",
            status=ProjectStatus.READY,
            video_filename="video.mp4",
            video_info=VideoInfo(duration=5.0),
            transcript=Transcript(
                language="en",
                duration=5.0,
                segments=[
                    TranscriptSegment(
                        start=0.0,
                        end=5.0,
                        words=[
                            Word(word="Hello", start=0.0, end=0.4),
                            Word(word="world", start=0.5, end=1.0),
                        ],
                    )
                ],
            ),
        )
        asyncio.get_event_loop().run_until_complete(save_project(project))
        return project

    def test_get_transcript(self, client: TestClient, patch_settings):
        project = self._project_with_transcript(patch_settings / "projects")
        resp = client.get(f"/api/projects/{project.id}/transcript")
        assert resp.status_code == 200
        data = resp.json()
        assert data["language"] == "en"
        assert len(data["segments"]) == 1

    def test_get_transcript_not_found(self, client: TestClient, patch_settings):
        project = _make_fake_project(patch_settings / "projects")
        resp = client.get(f"/api/projects/{project.id}/transcript")
        # project has no transcript
        assert resp.status_code == 404

    def test_save_transcript(self, client: TestClient, patch_settings):
        project = _make_fake_project(patch_settings / "projects")
        new_transcript = {
            "language": "ru",
            "duration": 10.0,
            "segments": [],
        }
        resp = client.put(
            f"/api/projects/{project.id}/transcript",
            json=new_transcript,
        )
        assert resp.status_code == 200
        assert resp.json()["language"] == "ru"


class TestEditorEndpoints:
    def _project_with_transcript(self, projects_dir: Path) -> Project:
        import asyncio
        from app.services.project import save_project

        project = Project(
            name="Editor Test",
            status=ProjectStatus.READY,
            video_filename="video.mp4",
            video_info=VideoInfo(duration=5.0, fps=30.0),
            transcript=Transcript(
                language="en",
                duration=5.0,
                segments=[
                    TranscriptSegment(
                        start=0.0,
                        end=5.0,
                        words=[
                            Word(word="um", start=0.0, end=0.3),
                            Word(word="Hello", start=0.4, end=0.8),
                            Word(word="world", start=0.9, end=1.3),
                        ],
                    )
                ],
            ),
        )
        asyncio.get_event_loop().run_until_complete(save_project(project))
        return project

    def test_delete_words(self, client: TestClient, patch_settings):
        project = self._project_with_transcript(patch_settings / "projects")
        resp = client.post(
            f"/api/projects/{project.id}/editor/words/delete",
            json={"indices": [0]},
        )
        assert resp.status_code == 200
        assert resp.json()["deleted"] == [0]

        # Verify persistence
        resp2 = client.get(f"/api/projects/{project.id}/transcript")
        segments = resp2.json()["segments"]
        assert segments[0]["words"][0]["deleted"] is True

    def test_restore_words(self, client: TestClient, patch_settings):
        project = self._project_with_transcript(patch_settings / "projects")
        # Delete first
        client.post(
            f"/api/projects/{project.id}/editor/words/delete",
            json={"indices": [0]},
        )
        # Restore
        resp = client.post(
            f"/api/projects/{project.id}/editor/words/restore",
            json={"indices": [0]},
        )
        assert resp.status_code == 200

        resp2 = client.get(f"/api/projects/{project.id}/transcript")
        assert resp2.json()["segments"][0]["words"][0]["deleted"] is False

    def test_sync_timeline(self, client: TestClient, patch_settings):
        project = self._project_with_transcript(patch_settings / "projects")
        resp = client.post(f"/api/projects/{project.id}/editor/sync-timeline")
        assert resp.status_code == 200
        data = resp.json()
        assert "total_duration" in data
        assert data["segments"] >= 1
