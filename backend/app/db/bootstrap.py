"""Schema bootstrap for the SQLite backend.

Postgres installs keep using Alembic (``alembic upgrade head``); SQLite has no
migration server to run and no operator to run it, so the schema is created
straight from the ORM metadata on first start and recorded in ``app_meta``.

When a model changes, bump ``SCHEMA_VERSION`` and add the matching step to
``_MIGRATIONS`` — otherwise an existing user's database will keep its old
columns while the code expects new ones.
"""
import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.config import get_settings
from app.db.base import Base
from app.db.session import engine

logger = logging.getLogger(__name__)

SCHEMA_VERSION = 1

# version -> list of DDL statements that bring version-1 databases up to it.
_MIGRATIONS: dict[int, list[str]] = {}

_META_TABLE = "CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)"


async def _read_version(conn: AsyncConnection) -> int | None:
    row = (await conn.execute(text("SELECT value FROM app_meta WHERE key = 'schema_version'"))).first()
    return int(row[0]) if row else None


async def _write_version(conn: AsyncConnection, version: int) -> None:
    await conn.execute(
        text(
            "INSERT INTO app_meta (key, value) VALUES ('schema_version', :v) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value"
        ),
        {"v": str(version)},
    )


async def ensure_schema() -> None:
    """Make the database match the models. No-op for Postgres."""
    settings = get_settings()
    if not settings.is_sqlite:
        return

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text(_META_TABLE))

        stored = await _read_version(conn)
        if stored is None:
            await _write_version(conn, SCHEMA_VERSION)
            return

        if stored > SCHEMA_VERSION:
            raise RuntimeError(
                f"Database schema version {stored} is newer than this build supports "
                f"({SCHEMA_VERSION}). Update {settings.app_name} instead of downgrading it."
            )
        if stored < SCHEMA_VERSION:
            for version in range(stored + 1, SCHEMA_VERSION + 1):
                for statement in _MIGRATIONS.get(version, []):
                    logger.info("Applying schema migration %s: %s", version, statement)
                    await conn.execute(text(statement))
            await _write_version(conn, SCHEMA_VERSION)
