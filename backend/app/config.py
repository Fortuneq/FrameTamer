from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = True

    # CORS
    cors_origins: list[str] = [
        "http://localhost:1420",  # Tauri dev
        "http://localhost:5173",  # Vite dev
        "http://127.0.0.1:1420",
        "http://127.0.0.1:5173",
    ]

    # Storage
    projects_dir: Path = Path.home() / "ClipForge" / "projects"
    media_dir: Path = Path.home() / "ClipForge" / "media"
    temp_dir: Path = Path.home() / "ClipForge" / "temp"

    # Whisper
    whisper_model: str = "large-v3"
    whisper_device: str = "auto"  # auto | cpu | cuda
    whisper_compute_type: str = "auto"  # auto | float32 | float16 | int8

    # Anthropic
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-20250514"

    # Export
    default_video_codec: str = "libx264"
    default_audio_codec: str = "aac"
    default_crf: int = 23

    def ensure_dirs(self) -> None:
        self.projects_dir.mkdir(parents=True, exist_ok=True)
        self.media_dir.mkdir(parents=True, exist_ok=True)
        self.temp_dir.mkdir(parents=True, exist_ok=True)


settings = Settings()
