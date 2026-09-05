"""Configuration for Bugle, read from environment / optional .env file.

Mirrors the MyMonee convention: local-first, durable SQLite on disk, no cloud
dependency. All settings have sane localhost defaults.
"""

from __future__ import annotations

from pathlib import Path

import pydantic_settings


class Settings(pydantic_settings.BaseSettings):
    """Application settings.

    Overridable via environment variables (BUGLE_<name>)
    or a .env file in the project root.
    """

    host: str = "127.0.0.1"
    port: int = 8480

    #: Directory that holds the SQLite database on disk.
    data_dir: str = "data"

    #: Path to the built frontend (Vite `web/dist`). Serve statically when present.
    static_dir: str = "web/dist"

    #: Secret bearer token required for machine ingestion (Hermes).
    service_token: str = ""

    #: Email address matching Cloudflare Access authenticated user header.
    admin_email: str = "gaurav.singh.86@gmail.com"

    #: Whether anonymous access to public briefs is enabled.
    public_enabled: bool = False

    #: Whether dev mode is enabled (allows localhost requests admin access without CF headers).
    dev_mode: bool = False

    model_config = pydantic_settings.SettingsConfigDict(
        env_prefix="BUGLE_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def data_dir_path(self) -> Path:
        return Path(self.data_dir).resolve()

    @property
    def static_dir_path(self) -> Path:
        return Path(self.static_dir).resolve()

    @property
    def db_path(self) -> Path:
        return self.data_dir_path / "bugle.db"

    @property
    def is_cloudflare_only(self) -> bool:
        """True when configured to never expose a public bind."""
        return self.host in ("localhost", "127.0.0.1")


def get_settings() -> Settings:
    return Settings()