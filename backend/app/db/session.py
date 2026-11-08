"""Async SQLAlchemy engine/session wiring.

Works against SQLite (the default, a single file with no server) and Postgres.
SQLite needs two things Postgres gives for free: foreign keys are OFF unless
asked for per connection, and concurrent readers/writers behave best in WAL
mode. Both are set below on every connection.
"""
from collections.abc import AsyncGenerator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings

settings = get_settings()

if settings.is_sqlite:
    settings.data_path.mkdir(parents=True, exist_ok=True)

_engine_kwargs: dict = {"pool_pre_ping": True}
if settings.is_sqlite:
    # check_same_thread: the async driver hands connections between threads.
    # timeout: how long a writer waits for a lock before raising "database is
    # locked" — 15s is plenty for a single-user app and far friendlier than the
    # 5s default.
    _engine_kwargs["connect_args"] = {"check_same_thread": False, "timeout": 15}

engine = create_async_engine(settings.database_url, **_engine_kwargs)

if settings.is_sqlite:

    @event.listens_for(engine.sync_engine, "connect")
    def _sqlite_pragmas(dbapi_connection, _connection_record):  # noqa: ANN001
        cursor = dbapi_connection.cursor()
        # Off by default in SQLite: without this, ON DELETE CASCADE and the
        # ON DELETE SET NULL on transfer_account_id silently do nothing.
        cursor.execute("PRAGMA foreign_keys=ON")
        # Readers never block writers in WAL mode — the difference between a
        # dashboard load stalling behind a backup export and not noticing it.
        try:
            cursor.execute("PRAGMA journal_mode=WAL")
        except Exception:
            # WAL is unavailable on some network filesystems; the app still
            # works in the default rollback-journal mode.
            pass
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()

AsyncSessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
