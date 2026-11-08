"""Test harness wiring — runs against a throwaway SQLite database.

The app ships two database backends; the local build (the one users install)
runs on SQLite, so the suite exercises that one. Each test gets a fresh
in-memory database created straight from the ORM metadata — the Alembic chain
stays a Postgres concern — wiped and reseeded before the next test.

The app's own engine is never touched: the ASGI app is exercised over httpx
without running startup events, and ``get_session`` is overridden to point at
the test database.
"""
from collections.abc import AsyncGenerator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401  (registers every table on Base.metadata)
from app.api.deps import get_session
from app.db.base import Base
from app.db.seed import seed_default_account, seed_default_app_settings, seed_default_categories
from app.main import app

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture
async def test_sessionmaker() -> AsyncGenerator[async_sessionmaker[AsyncSession], None]:
    # An in-memory SQLite database lives and dies with its one connection, so
    # the pool must keep handing that connection back (StaticPool) and the
    # driver must not care which thread touches it.
    engine = create_async_engine(
        TEST_DB_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine.sync_engine, "connect")
    def _foreign_keys_on(dbapi_connection, _record):  # noqa: ANN001
        # Off by default in SQLite; without it the schema's ON DELETE clauses
        # silently do nothing and tests would pass on a lie.
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield async_sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)
    await engine.dispose()


@pytest_asyncio.fixture(autouse=True)
async def _clean_database(test_sessionmaker):
    """Wipe every table and reseed the defaults before each test, so tests
    never see leftovers from a previous one and never guess at IDs."""
    async with test_sessionmaker() as session:
        # Children before parents — SQLite enforces the foreign keys above.
        for table in reversed(Base.metadata.sorted_tables):
            await session.execute(text(f'DELETE FROM "{table.name}"'))
        await session.commit()
        await seed_default_categories(session)
        await seed_default_account(session)
        await seed_default_app_settings(session)
    yield


@pytest_asyncio.fixture
async def client(test_sessionmaker) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_session() -> AsyncGenerator[AsyncSession, None]:
        async with test_sessionmaker() as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test/api") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def account_id(client: AsyncClient) -> int:
    """The default seeded account (see app/db/seed.py) — every transaction
    needs one, and the app itself always seeds exactly this one on first
    boot, so tests build on the same shape real usage does."""
    resp = await client.get("/accounts")
    accounts = resp.json()
    assert accounts, "seed_default_account should have created exactly one account"
    return accounts[0]["id"]


@pytest_asyncio.fixture
async def categories(client: AsyncClient) -> dict[str, dict]:
    """Default seeded categories keyed by name, e.g. categories["Groceries"]["id"]."""
    resp = await client.get("/categories")
    return {c["name"]: c for c in resp.json()}
