"""SQLite storage via SQLAlchemy — the canonical Bugle research data store.

Durable SQLite on disk (WAL mode), with models for Research Jobs, Briefs,
Sources, Claims, and ClaimSource associations.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    create_engine,
    event,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker

from .config import Settings


def now_utc() -> datetime:
    return datetime.now(UTC)


def generate_id(prefix: str = "") -> str:
    token = uuid.uuid4().hex[:12]
    return f"{prefix}_{token}" if prefix else token


class Base(DeclarativeBase):
    pass


# Association table for Claim <-> Source (many-to-many evidence mapping)
claim_sources = Table(
    "claim_sources",
    Base.metadata,
    Column(
        "claim_id",
        Integer,
        ForeignKey("claims.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "source_id",
        Integer,
        ForeignKey("sources.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class ResearchJob(Base):
    """An asynchronous investigation task commissioned to Hermes."""

    __tablename__ = "research_jobs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    topic: Mapped[str] = mapped_column(String(500), nullable=False)
    research_type: Mapped[str] = mapped_column(String(50), default="general")
    research_depth: Mapped[str] = mapped_column(String(50), default="standard")
    status: Mapped[str] = mapped_column(
        String(50), default="pending"
    )  # pending | running | completed | failed | cancelled
    execution_meta: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc, onupdate=now_utc
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    brief: Mapped[Brief | None] = relationship(
        "Brief", back_populates="job", uselist=False
    )


class Brief(Base):
    """The canonical research brief synthesized from an investigation."""

    __tablename__ = "briefs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    job_id: Mapped[str | None] = mapped_column(
        String(64),
        ForeignKey("research_jobs.id", ondelete="SET NULL"),
        unique=True,
        nullable=True,
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    summary: Mapped[str] = mapped_column(Text, default="")
    content_markdown: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(100), default="Technology")
    subcategory: Mapped[str] = mapped_column(String(100), default="")
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    confidence: Mapped[str] = mapped_column(
        String(20), default="medium"
    )  # high | medium | low
    visibility: Mapped[str] = mapped_column(
        String(20), default="private"
    )  # private | public
    research_type: Mapped[str] = mapped_column(String(50), default="general")
    research_depth: Mapped[str] = mapped_column(String(50), default="standard")
    source_count: Mapped[int] = mapped_column(Integer, default=0)
    claim_count: Mapped[int] = mapped_column(Integer, default=0)
    research_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    research_completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    published_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc, onupdate=now_utc
    )

    job: Mapped[ResearchJob | None] = relationship(
        "ResearchJob", back_populates="brief"
    )
    sources: Mapped[list[Source]] = relationship(
        "Source",
        back_populates="brief",
        cascade="all, delete-orphan",
        order_by="Source.id",
    )
    claims: Mapped[list[Claim]] = relationship(
        "Claim",
        back_populates="brief",
        cascade="all, delete-orphan",
        order_by="Claim.id",
    )


class Source(Base):
    """An evidence document, paper, announcement, or repository cited in a brief."""

    __tablename__ = "sources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    brief_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("briefs.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(300), default="")
    url: Mapped[str] = mapped_column(String(1000), default="")
    publisher: Mapped[str] = mapped_column(String(200), default="")
    author: Mapped[str | None] = mapped_column(String(200), nullable=True)
    source_type: Mapped[str] = mapped_column(
        String(50), default="general"
    )  # paper | blog | news | github | filing | tweet | general
    reliability: Mapped[str] = mapped_column(
        String(50), default="secondary"
    )  # primary | secondary | contested
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    retrieved_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc
    )
    relevance: Mapped[str | None] = mapped_column(Text, nullable=True)

    brief: Mapped[Brief] = relationship("Brief", back_populates="sources")
    claims: Mapped[list[Claim]] = relationship(
        "Claim", secondary=claim_sources, back_populates="sources"
    )


class Claim(Base):
    """A distinct assertion extracted from an investigation and verified against sources."""

    __tablename__ = "claims"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    brief_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("briefs.id", ondelete="CASCADE"),
        nullable=False,
    )
    statement: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), default="unverified"
    )  # verified | contradicted | unverified
    evidence_summary: Mapped[str] = mapped_column(Text, default="")

    brief: Mapped[Brief] = relationship("Brief", back_populates="claims")
    sources: Mapped[list[Source]] = relationship(
        "Source", secondary=claim_sources, back_populates="claims"
    )


def _build_engine(settings: Settings):
    settings.data_dir_path.mkdir(parents=True, exist_ok=True)
    engine = create_engine(
        f"sqlite:///{settings.db_path}",
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    return engine


class Database:
    """Binds an engine + session factory to a given settings object."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self.engine = _build_engine(settings)
        Base.metadata.create_all(self.engine)
        self.session_factory = sessionmaker(self.engine, expire_on_commit=False)

    def session(self):
        return self.session_factory()