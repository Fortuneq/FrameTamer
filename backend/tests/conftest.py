"""
Shared test fixtures.
"""
import asyncio
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from httpx import AsyncClient, ASGITransport


@pytest.fixture(scope="session", autouse=True)
def patch_settings(tmp_path_factory):
    """Redirect all file storage to a temp directory during tests."""
    tmp = tmp_path_factory.mktemp("mydescript_test")
    from app import config
    config.settings.projects_dir = tmp / "projects"
    config.settings.media_dir = tmp / "media"
    config.settings.temp_dir = tmp / "temp"
    config.settings.anthropic_api_key = "test-key"
    config.settings.debug = True
    config.settings.ensure_dirs()
    return tmp


@pytest.fixture
def client(patch_settings):
    from app.main import app
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


@pytest.fixture
async def async_client(patch_settings):
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture
def sample_project_id(client, tmp_path):
    """Create a minimal project and return its ID."""
    import io
    # 1×1 pixel MP4-like blob – just for upload test (won't be probed)
    fake_video = io.BytesIO(b"fake_video_data")
    resp = client.post(
        "/api/projects",
        data={"name": "Test Project", "description": "unit test"},
        files={"file": ("test.mp4", fake_video, "video/mp4")},
    )
    # If upload fails (no FFmpeg in CI), skip video-dependent tests
    if resp.status_code != 201:
        pytest.skip("Could not create test project (FFmpeg required)")
    return resp.json()["id"]
