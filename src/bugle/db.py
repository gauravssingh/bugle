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
    Float,
    ForeignKey,
    Index,
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
    cost_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    cost_inr: Mapped[float | None] = mapped_column(Float, nullable=True)
    cost_exchange_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    token_usage: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc, onupdate=now_utc
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    brief: Mapped[Brief | None] = relationship("Brief", back_populates="job", uselist=False)
    events: Mapped[list[JobEvent]] = relationship(
        "JobEvent", back_populates="job", cascade="all, delete-orphan", order_by="JobEvent.id"
    )


class JobEvent(Base):
    """Append-only lifecycle event for an investigation job."""

    __tablename__ = "job_events"
    __table_args__ = (Index("ix_job_events_job_id", "job_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("research_jobs.id", ondelete="CASCADE"), nullable=False
    )
    from_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    to_status: Mapped[str] = mapped_column(String(50), nullable=False)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    job: Mapped[ResearchJob] = relationship("ResearchJob", back_populates="events")


class Brief(Base):
    """The canonical research brief synthesized from an investigation."""

    __tablename__ = "briefs"
    __table_args__ = (
        Index("ix_briefs_visibility_published_at", "visibility", "published_at"),
        Index("ix_briefs_published_at", "published_at"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    job_id: Mapped[str | None] = mapped_column(
        String(64),
        ForeignKey("research_jobs.id", ondelete="SET NULL"),
        unique=True,
        nullable=True,
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    summary: Mapped[str] = mapped_column(Text, default="")
    content_markdown: Mapped[str] = mapped_column(Text, default="", deferred=True)
    category: Mapped[str] = mapped_column(String(100), default="Technology")
    subcategory: Mapped[str] = mapped_column(String(100), default="")
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    confidence: Mapped[str] = mapped_column(String(20), default="medium")  # high | medium | low
    visibility: Mapped[str] = mapped_column(String(20), default="private")  # private | public
    research_type: Mapped[str] = mapped_column(String(50), default="general")
    research_depth: Mapped[str] = mapped_column(String(50), default="standard")
    source_count: Mapped[int] = mapped_column(Integer, default=0)
    claim_count: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    cost_inr: Mapped[float | None] = mapped_column(Float, nullable=True)
    cost_exchange_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    token_usage: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    execution_meta: Mapped[dict] = mapped_column(JSON, default=dict)
    research_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    research_completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc, onupdate=now_utc
    )

    job: Mapped[ResearchJob | None] = relationship("ResearchJob", back_populates="brief")
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
    revisions: Mapped[list[BriefRevision]] = relationship(
        "BriefRevision",
        back_populates="brief",
        cascade="all, delete-orphan",
        order_by="BriefRevision.id",
    )

    @property
    def total_tokens(self) -> int | None:
        if self.token_usage and isinstance(self.token_usage, dict):
            tot = self.token_usage.get("total") or self.token_usage.get("total_tokens")
            if tot is not None:
                return int(tot)
            inp = self.token_usage.get("input") or self.token_usage.get("input_tokens") or 0
            out = self.token_usage.get("output") or self.token_usage.get("output_tokens") or 0
            return int(inp) + int(out)
        return None


class BriefRevision(Base):
    """Snapshot of a brief before an operator or agent edits it."""

    __tablename__ = "brief_revisions"
    __table_args__ = (Index("ix_brief_revisions_brief_id", "brief_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    brief_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("briefs.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    summary: Mapped[str] = mapped_column(Text, default="")
    content_markdown: Mapped[str] = mapped_column(Text, default="")
    claims_snapshot: Mapped[list[dict]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    brief: Mapped[Brief] = relationship("Brief", back_populates="revisions")


class Source(Base):
    """An evidence document, paper, announcement, or repository cited in a brief."""

    __tablename__ = "sources"
    __table_args__ = (Index("ix_sources_brief_id", "brief_id"),)

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
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    relevance: Mapped[str | None] = mapped_column(Text, nullable=True, deferred=True)

    brief: Mapped[Brief] = relationship("Brief", back_populates="sources")
    claims: Mapped[list[Claim]] = relationship(
        "Claim", secondary=claim_sources, back_populates="sources"
    )


class Claim(Base):
    """A distinct assertion extracted from an investigation and verified against sources."""

    __tablename__ = "claims"
    __table_args__ = (Index("ix_claims_brief_id", "brief_id"),)

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
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.execute("PRAGMA cache_size=-64000")
        cursor.execute("PRAGMA mmap_size=268435456")
        cursor.execute("PRAGMA temp_store=MEMORY")
        cursor.close()

    return engine


class Database:
    """Binds an engine + session factory to a given settings object."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self.engine = _build_engine(settings)
        Base.metadata.create_all(self.engine)
        self._auto_migrate_schema()
        self.session_factory = sessionmaker(self.engine, expire_on_commit=False)

    def _auto_migrate_schema(self):
        with self.engine.connect() as conn:
            # Check briefs table columns
            brief_cols = {
                row[1] for row in conn.exec_driver_sql("PRAGMA table_info(briefs)").fetchall()
            }
            if brief_cols:
                if "cost_usd" not in brief_cols:
                    conn.exec_driver_sql("ALTER TABLE briefs ADD COLUMN cost_usd REAL")
                if "cost_inr" not in brief_cols:
                    conn.exec_driver_sql("ALTER TABLE briefs ADD COLUMN cost_inr REAL")
                if "cost_exchange_rate" not in brief_cols:
                    conn.exec_driver_sql("ALTER TABLE briefs ADD COLUMN cost_exchange_rate REAL")
                if "duration_seconds" not in brief_cols:
                    conn.exec_driver_sql("ALTER TABLE briefs ADD COLUMN duration_seconds REAL")
                if "model" not in brief_cols:
                    conn.exec_driver_sql("ALTER TABLE briefs ADD COLUMN model VARCHAR(100)")
                if "token_usage" not in brief_cols:
                    conn.exec_driver_sql("ALTER TABLE briefs ADD COLUMN token_usage JSON")
                if "execution_meta" not in brief_cols:
                    conn.exec_driver_sql(
                        "ALTER TABLE briefs ADD COLUMN execution_meta JSON DEFAULT '{}'"
                    )

            # Check research_jobs table columns
            job_cols = {
                row[1]
                for row in conn.exec_driver_sql("PRAGMA table_info(research_jobs)").fetchall()
            }
            if job_cols:
                if "cost_usd" not in job_cols:
                    conn.exec_driver_sql("ALTER TABLE research_jobs ADD COLUMN cost_usd REAL")
                if "cost_inr" not in job_cols:
                    conn.exec_driver_sql("ALTER TABLE research_jobs ADD COLUMN cost_inr REAL")
                if "cost_exchange_rate" not in job_cols:
                    conn.exec_driver_sql(
                        "ALTER TABLE research_jobs ADD COLUMN cost_exchange_rate REAL"
                    )
                if "duration_seconds" not in job_cols:
                    conn.exec_driver_sql(
                        "ALTER TABLE research_jobs ADD COLUMN duration_seconds REAL"
                    )
                if "model" not in job_cols:
                    conn.exec_driver_sql("ALTER TABLE research_jobs ADD COLUMN model VARCHAR(100)")
                if "token_usage" not in job_cols:
                    conn.exec_driver_sql("ALTER TABLE research_jobs ADD COLUMN token_usage JSON")
            conn.exec_driver_sql(
                "CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)"
            )
            conn.exec_driver_sql(
                "INSERT INTO schema_meta (key, value) VALUES ('schema_version', '1') "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value"
            )
            rate = self.settings.usd_to_inr_rate
            conn.exec_driver_sql(
                "UPDATE briefs SET cost_inr = ROUND(cost_usd * :rate, 2), "
                "cost_exchange_rate = :rate WHERE cost_usd IS NOT NULL AND cost_inr IS NULL",
                {"rate": rate},
            )
            conn.exec_driver_sql(
                "UPDATE research_jobs SET cost_inr = ROUND(cost_usd * :rate, 2), "
                "cost_exchange_rate = :rate WHERE cost_usd IS NOT NULL AND cost_inr IS NULL",
                {"rate": rate},
            )
            conn.commit()
            conn.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_briefs_visibility_published_at "
                "ON briefs (visibility, published_at)"
            )
            conn.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_briefs_published_at ON briefs (published_at)"
            )
            conn.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_sources_brief_id ON sources (brief_id)"
            )
            conn.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_claims_brief_id ON claims (brief_id)"
            )
            conn.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_claim_sources_claim_id ON claim_sources (claim_id)"
            )
            conn.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_claim_sources_source_id ON claim_sources (source_id)"
            )
            conn.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_research_jobs_status ON research_jobs (status)"
            )
            conn.exec_driver_sql("PRAGMA optimize")
            conn.commit()

    def session(self):
        return self.session_factory()
