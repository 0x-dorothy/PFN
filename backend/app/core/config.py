"""Application configuration.

Values come from environment variables (prefix ``PFN_``) or a ``.env`` file in
the working directory. Everything has a working default: with no configuration
at all the app runs against a local SQLite file inside the user's data
directory, and nothing else has to be installed or started.

Postgres is still supported for anyone who wants it — set ``PFN_DB_BACKEND=postgres``
and point the ``PFN_POSTGRES_*`` variables at a server.
"""
import os
import sys
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Single source of truth for the running app's version — surfaced in the API
# title, in GET /api/settings as app_version (which the frontend reads to show
# it in Settings; it deliberately does NOT ride on the unauthenticated
# /api/health), and embedded in exported backups so an old file can be told
# apart from a current one.
APP_NAME = "PFN"
APP_FULL_NAME = "Private Finance Tracker"
APP_VERSION = "1.2.0"


def default_data_dir() -> Path:
    """Per-user directory for the database and any future user data.

    Deliberately outside the application folder: replacing a downloaded build
    with a newer one must never touch the user's financial history.
    """
    if sys.platform == "win32":
        base = Path(os.environ.get("APPDATA") or Path.home() / "AppData" / "Roaming")
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.environ.get("XDG_DATA_HOME") or Path.home() / ".local" / "share")
    return base / APP_NAME


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="PFN_", extra="ignore")

    app_name: str = APP_NAME

    # "sqlite" (default, zero setup) or "postgres".
    db_backend: str = "sqlite"
    # Escape hatch: any SQLAlchemy async DSN. Wins over db_backend.
    db_url: str = ""
    # Where the SQLite file lives. Empty = the per-user default above.
    data_dir: str = ""

    # Used by the launcher; harmless when the app is served by something else.
    host: str = "127.0.0.1"
    port: int = 8765
    open_browser: bool = True

    # Postgres connection (only read when db_backend == "postgres")
    postgres_user: str = "pfn"
    postgres_password: str = "pfn"
    postgres_db: str = "pfn"
    postgres_host: str = "localhost"
    postgres_port: int = 5432

    # Default currency shown across the UI when an account doesn't override it
    default_currency: str = "USD"

    # Comma-separated list of browser origins allowed to call the API. Empty by
    # default: the app serves its own UI from the same origin, so there is no
    # cross-origin caller unless one is deliberately configured.
    cors_origins: str = ""

    # CoinGecko Demo API key (free, no card required —
    # https://www.coingecko.com/en/api/pricing) for the Crypto tab's price
    # lookups. Empty by default; those endpoints 400 with a clear message until
    # it is set. Everything else works offline.
    coingecko_api_key: str = ""

    # Swagger/ReDoc/openapi.json at /api/docs. On by default because the API is
    # a documented feature of this app (see docs/API-reference.md). Turn it off
    # on an instance that is reachable from the internet without auth: an open
    # /api/openapi.json is a complete, machine-readable map of every endpoint.
    enable_docs: bool = True

    @property
    def data_path(self) -> Path:
        return Path(self.data_dir).expanduser() if self.data_dir else default_data_dir()

    @property
    def sqlite_path(self) -> Path:
        return self.data_path / "pfn.db"

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def database_url(self) -> str:
        if self.db_url:
            return self.db_url
        if self.db_backend.lower() == "postgres":
            return (
                f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
                f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
            )
        return f"sqlite+aiosqlite:///{self.sqlite_path.as_posix()}"

    @property
    def cors_origins_list(self) -> list[str]:
        if self.cors_origins == "*":
            return ["*"]
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
