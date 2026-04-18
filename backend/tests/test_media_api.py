"""Tests for the /api/media endpoints."""
import io
from fastapi.testclient import TestClient


class TestMediaAPI:
    def test_list_empty(self, client: TestClient):
        resp = client.get("/api/media")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_upload_video(self, client: TestClient):
        fake = io.BytesIO(b"fake mp4 data")
        resp = client.post(
            "/api/media/upload",
            files={"file": ("clip.mp4", fake, "video/mp4")},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["original_name"] == "clip.mp4"
        assert data["media_type"] == "video"
        assert data["filename"].endswith(".mp4")

    def test_upload_and_list(self, client: TestClient):
        fake = io.BytesIO(b"audio content")
        upload_resp = client.post(
            "/api/media/upload",
            files={"file": ("song.mp3", fake, "audio/mpeg")},
        )
        assert upload_resp.status_code == 201
        stored_name = upload_resp.json()["filename"]

        list_resp = client.get("/api/media")
        names = [f["filename"] for f in list_resp.json()]
        assert stored_name in names

    def test_upload_and_delete(self, client: TestClient):
        fake = io.BytesIO(b"delete me")
        upload_resp = client.post(
            "/api/media/upload",
            files={"file": ("to_delete.mp4", fake, "video/mp4")},
        )
        stored_name = upload_resp.json()["filename"]

        del_resp = client.delete(f"/api/media/{stored_name}")
        assert del_resp.status_code == 204

        # Confirm gone
        get_resp = client.get(f"/api/media/{stored_name}")
        assert get_resp.status_code == 404

    def test_delete_not_found(self, client: TestClient):
        resp = client.delete("/api/media/nonexistent_file.mp4")
        assert resp.status_code == 404
