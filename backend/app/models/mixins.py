"""Reusable model mixins and column types."""
from datetime import datetime, timezone

from sqlalchemy import DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import TypeDecorator


class UTCDateTime(TypeDecorator):
    """A datetime column that always comes back timezone-aware, in UTC.

    Postgres stores TIMESTAMPTZ and returns aware datetimes, so nothing had to
    be said about it. SQLite has no timezone type: SQLAlchemy writes a plain
    "YYYY-MM-DD HH:MM:SS" string and reads it back naive, which turns every
    "now - stored" comparison into `TypeError: can't subtract offset-naive and
    offset-aware datetimes` the moment a timestamp is read (the Crypto tab's
    sync timer was the first to hit it).

    Values are normalised on the way in and re-tagged as UTC on the way out,
    so the rest of the code can keep comparing them to `datetime.now(timezone.utc)`
    on either backend.
    """

    impl = DateTime
    cache_ok = True

    def load_dialect_impl(self, dialect):
        # Keep the native type where it exists; SQLite falls back to its own
        # string storage.
        return dialect.type_descriptor(DateTime(timezone=dialect.name != "sqlite"))

    def process_bind_param(self, value: datetime | None, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            # Callers that pass a naive value mean "UTC" here — that is the
            # only interpretation that keeps the existing comparisons honest.
            value = value.replace(tzinfo=timezone.utc)
        value = value.astimezone(timezone.utc)
        # SQLite's storage format has no offset field, so it gets UTC without
        # the tzinfo; process_result_value puts it back.
        return value.replace(tzinfo=None) if dialect.name == "sqlite" else value

    def process_result_value(self, value: datetime | None, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


class TimestampMixin:
    """Adds created_at / updated_at columns managed by the database itself."""

    created_at: Mapped[datetime] = mapped_column(UTCDateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime, server_default=func.now(), onupdate=func.now()
    )
