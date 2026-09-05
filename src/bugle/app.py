"""FastAPI application for Bugle (Personal Research Intelligence).

Serves the v1 Research Jobs & Briefs API with:
- Strict authorization invariant (Cloudflare Access for operator, Service Token for Hermes)
- Safe-by-default server-side query filtering (anonymous can never view private data)
- Idempotent Hermes publication
- Claim <-> Source relational evidence mapping
- Static frontend fallback from web/dist
"""

from __future__ import annotations

import os
import re
from collections.abc import Generator
from dataclasses import dataclass
from datetime import UTC, datetime

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, Response, status
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import exists, func, or_, select, true
from sqlalchemy.orm import Session as SASession
from sqlalchemy.orm import selectinload, undefer

from . import __version__
from .config import Settings, get_settings
from .db import (
    Brief,
    BriefRevision,
    Claim,
    Database,
    JobEvent,
    ResearchJob,
    Source,
    generate_id,
    now_utc,
)
from .schemas import (
    AuthMeResponse,
    BriefCreate,
    BriefDetailRead,
    BriefListRead,
    BriefRevisionRead,
    BriefUpdate,
    ClaimRead,
    DbVacuumResponse,
    JobCreate,
    JobEventRead,
    JobListRead,
    JobRead,
    JobUpdate,
    PostList,
    PostRead,
    QuickIngestRequest,
    QuickIngestResponse,
    SourceRead,
    TaxonomiesRead,
    TaxonomyCategory,
    TaxonomyTag,
)


@dataclass
class AuthContext:
    role: str  # admin | service | anonymous
    email: str | None = None
    is_admin: bool = False
    is_service: bool = False


def slugify(text: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return cleaned[:40] if cleaned else "brief"


def cost_inr_for(cost_usd: float | None, settings: Settings) -> float | None:
    if cost_usd is None:
        return None
    return round(cost_usd * settings.usd_to_inr_rate, 2)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    db = Database(settings)

    app = FastAPI(
        title="Bugle",
        description="Personal Research Intelligence Platform",
        version=__version__,
    )
    app.state.db = db
    app.state.settings = settings

    def get_db() -> Generator[SASession]:
        """Provide one request-scoped session and always return it to the pool."""
        db_session = db.session()
        try:
            yield db_session
        finally:
            db_session.close()

    def get_auth_context(
        request: Request,
        authorization: str | None = Header(default=None),
        cf_access_email: str | None = Header(
            default=None, alias="Cf-Access-Authenticated-User-Email"
        ),
    ) -> AuthContext:
        # 1. Hermes Service Token check (machine-to-machine)
        if settings.service_token and authorization:
            expected = f"Bearer {settings.service_token}"
            if authorization == expected:
                return AuthContext(
                    role="service",
                    email=None,
                    is_admin=True,
                    is_service=True,
                )

        # 2. Cloudflare Access Identity Header (operator browser)
        if (
            cf_access_email
            and settings.admin_email
            and cf_access_email.strip().lower() == settings.admin_email.strip().lower()
        ):
            return AuthContext(
                role="admin",
                email=cf_access_email.strip(),
                is_admin=True,
                is_service=False,
            )

        # 3. Localhost dev mode fallback (only when explicitly enabled)
        client_host = request.client.host if request.client else ""
        if settings.dev_mode and client_host in ("127.0.0.1", "localhost", "testclient"):
            return AuthContext(
                role="admin",
                email="dev@localhost",
                is_admin=True,
                is_service=False,
            )

        # 4. Anonymous / Public
        return AuthContext(
            role="anonymous",
            email=None,
            is_admin=False,
            is_service=False,
        )

    def require_admin_or_service(
        auth: AuthContext = Depends(get_auth_context),
    ) -> AuthContext:
        if not (auth.is_admin or auth.is_service):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unauthorized. Service token or Cloudflare Access required.",
            )
        return auth

    def require_admin(
        auth: AuthContext = Depends(get_auth_context),
    ) -> AuthContext:
        if not (auth.is_admin or auth.is_service):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unauthorized. Authentication required.",
            )
        if auth.is_service:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden. Operator admin access required.",
            )
        return auth

    # ---------------- Health & Auth ----------------

    @app.get("/api/health")
    def health():
        return {"status": "ok", "app": "bugle", "version": __version__}

    @app.get("/api/v1/system/status")
    def system_status(
        db_session: SASession = Depends(get_db),
        _: AuthContext = Depends(require_admin_or_service),
    ):
        briefs = db_session.scalar(select(func.count()).select_from(Brief)) or 0
        jobs = db_session.scalar(select(func.count()).select_from(ResearchJob)) or 0
        latest_job = db_session.scalar(
            select(ResearchJob).order_by(ResearchJob.created_at.desc()).limit(1)
        )
        return {
            "status": "ok",
            "app": "bugle",
            "version": __version__,
            "database": {"briefs": briefs, "jobs": jobs},
            "latest_job": (
                {
                    "id": latest_job.id,
                    "status": latest_job.status,
                    "created_at": latest_job.created_at,
                }
                if latest_job
                else None
            ),
        }

    @app.get("/api/v1/system/db-health")
    def db_health(
        db_session: SASession = Depends(get_db),
        _: AuthContext = Depends(require_admin_or_service),
    ):
        connection = db_session.connection()
        page_count = connection.exec_driver_sql("PRAGMA page_count").scalar() or 0
        freelist_pages = connection.exec_driver_sql("PRAGMA freelist_count").scalar() or 0
        integrity = connection.exec_driver_sql("PRAGMA integrity_check").scalar()
        foreign_keys = connection.exec_driver_sql("PRAGMA foreign_key_check").fetchall()
        db_size = settings.db_path.stat().st_size if settings.db_path.exists() else 0
        fragmentation = round((freelist_pages / page_count) * 100, 2) if page_count else 0.0
        return {
            "integrity_ok": integrity == "ok",
            "foreign_keys_ok": not foreign_keys,
            "page_count": page_count,
            "freelist_pages": freelist_pages,
            "fragmentation_pct": fragmentation,
            "db_size_bytes": db_size,
            "wal_size_bytes": settings.db_path.with_name(settings.db_path.name + "-wal")
            .stat()
            .st_size
            if settings.db_path.with_name(settings.db_path.name + "-wal").exists()
            else 0,
        }

    @app.post("/api/v1/system/db-vacuum", response_model=DbVacuumResponse)
    def db_vacuum(
        db_session: SASession = Depends(get_db),
        _: AuthContext = Depends(require_admin_or_service),
    ):
        conn = db_session.connection()
        conn.exec_driver_sql("PRAGMA wal_checkpoint(TRUNCATE)")
        conn.exec_driver_sql("VACUUM")
        conn.exec_driver_sql("PRAGMA optimize")
        page_count = conn.exec_driver_sql("PRAGMA page_count").scalar() or 0
        freelist_pages = conn.exec_driver_sql("PRAGMA freelist_count").scalar() or 0
        db_size = settings.db_path.stat().st_size if settings.db_path.exists() else 0
        wal_path = settings.db_path.with_name(settings.db_path.name + "-wal")
        wal_size = wal_path.stat().st_size if wal_path.exists() else 0
        fragmentation = round((freelist_pages / page_count) * 100, 2) if page_count else 0.0
        return DbVacuumResponse(
            status="ok",
            message="Database vacuumed, WAL truncated, and query planner optimized.",
            page_count=page_count,
            freelist_pages=freelist_pages,
            fragmentation_pct=fragmentation,
            db_size_bytes=db_size,
            wal_size_bytes=wal_size,
        )

    @app.get("/api/v1/auth/me", response_model=AuthMeResponse)
    def auth_me(auth: AuthContext = Depends(get_auth_context)):
        return AuthMeResponse(
            role=auth.role,
            email=auth.email,
            is_admin=auth.is_admin,
            is_service=auth.is_service,
            public_enabled=settings.public_enabled,
        )

    # ---------------- Research Jobs API ----------------

    @app.post(
        "/api/v1/jobs",
        response_model=JobRead,
        status_code=status.HTTP_201_CREATED,
    )
    def create_job(
        payload: JobCreate,
        db_session: SASession = Depends(get_db),
        _: AuthContext = Depends(require_admin_or_service),
    ):
        job_id = payload.id or generate_id("job")
        job = ResearchJob(
            id=job_id,
            topic=payload.topic,
            research_type=payload.research_type,
            research_depth=payload.research_depth,
            status="pending",
            execution_meta=payload.execution_meta,
            cost_usd=payload.cost_usd,
            cost_inr=cost_inr_for(payload.cost_usd, settings),
            cost_exchange_rate=settings.usd_to_inr_rate if payload.cost_usd is not None else None,
            duration_seconds=payload.duration_seconds,
            model=payload.model,
            token_usage=payload.token_usage,
        )
        db_session.add(job)
        db_session.add(JobEvent(job_id=job_id, to_status="pending", message="Job created"))
        db_session.commit()
        db_session.refresh(job)
        return job

    @app.get("/api/v1/jobs/{job_id}", response_model=JobRead)
    def get_job(
        job_id: str,
        db_session: SASession = Depends(get_db),
        _: AuthContext = Depends(require_admin_or_service),
    ):
        job = db_session.scalar(
            select(ResearchJob)
            .options(selectinload(ResearchJob.events))
            .where(ResearchJob.id == job_id)
        )
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Research job not found",
            )
        return job

    @app.get("/api/v1/jobs/{job_id}/events", response_model=list[JobEventRead])
    def get_job_events(
        job_id: str,
        db_session: SASession = Depends(get_db),
        _: AuthContext = Depends(require_admin_or_service),
    ):
        job = db_session.get(ResearchJob, job_id)
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Research job not found",
            )
        return db_session.scalars(
            select(JobEvent)
            .where(JobEvent.job_id == job_id)
            .order_by(JobEvent.created_at.asc(), JobEvent.id.asc())
        ).all()

    @app.patch("/api/v1/jobs/{job_id}", response_model=JobRead)
    def update_job(
        job_id: str,
        payload: JobUpdate,
        db_session: SASession = Depends(get_db),
        _: AuthContext = Depends(require_admin_or_service),
    ):
        job = db_session.get(ResearchJob, job_id)
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Research job not found",
            )
        previous_status = job.status
        if payload.status is not None:
            job.status = payload.status
            if payload.status in ("completed", "failed", "cancelled") and not job.completed_at:
                job.completed_at = now_utc()
        if payload.execution_meta is not None:
            job.execution_meta = payload.execution_meta
        if payload.cost_usd is not None:
            job.cost_usd = payload.cost_usd
            job.cost_inr = cost_inr_for(payload.cost_usd, settings)
            job.cost_exchange_rate = settings.usd_to_inr_rate
        if payload.duration_seconds is not None:
            job.duration_seconds = payload.duration_seconds
        if payload.model is not None:
            job.model = payload.model
        if payload.token_usage is not None:
            job.token_usage = payload.token_usage
        if payload.completed_at is not None:
            job.completed_at = payload.completed_at

        if payload.status is not None and payload.status != previous_status:
            db_session.add(
                JobEvent(
                    job_id=job.id,
                    from_status=previous_status,
                    to_status=payload.status,
                    message=f"Job transitioned from {previous_status} to {payload.status}",
                )
            )

        db_session.commit()
        refreshed = db_session.scalar(
            select(ResearchJob)
            .options(selectinload(ResearchJob.events))
            .where(ResearchJob.id == job_id)
        )
        return refreshed

    @app.get("/api/v1/jobs", response_model=JobListRead)
    def list_jobs(
        limit: int = Query(default=50, ge=1, le=200),
        offset: int = Query(default=0, ge=0),
        db_session: SASession = Depends(get_db),
        _: AuthContext = Depends(require_admin_or_service),
    ):
        base = select(ResearchJob)
        total = db_session.scalar(select(func.count()).select_from(base.subquery())) or 0
        rows = db_session.scalars(
            base.order_by(ResearchJob.created_at.desc()).limit(limit).offset(offset)
        ).all()
        return {"jobs": rows, "total": total}

    @app.post(
        "/api/v1/ingest/quick",
        response_model=QuickIngestResponse,
        status_code=status.HTTP_201_CREATED,
    )
    def quick_ingest(
        payload: QuickIngestRequest,
        db_session: SASession = Depends(get_db),
        _: AuthContext = Depends(require_admin_or_service),
    ):
        raw_topic = (
            payload.title or payload.url or (payload.text[:120] if payload.text else "")
        ).strip()
        if not raw_topic:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Must provide at least a title, url, or text for quick ingest.",
            )

        job_id = generate_id("job")
        job = ResearchJob(
            id=job_id,
            topic=raw_topic,
            research_type=payload.research_type,
            research_depth=payload.research_depth,
            status="pending",
            execution_meta={
                "source": "apple_shortcut",
                "input_url": payload.url,
                "input_text": payload.text,
            },
        )
        db_session.add(job)
        db_session.add(
            JobEvent(job_id=job_id, to_status="pending", message="Job created via quick ingest")
        )
        db_session.commit()
        db_session.refresh(job)

        base_url = "https://bugle.gauravs-apps.in"
        return QuickIngestResponse(
            status="queued",
            job_id=job.id,
            topic=job.topic,
            research_depth=job.research_depth,
            view_url=f"{base_url}/#/brief/{job.id}",
            message="Research task queued for Hermes investigation.",
        )

    # ---------------- Research Briefs API ----------------

    def _build_brief_detail_response(brief: Brief) -> BriefDetailRead:
        source_reads = [SourceRead.model_validate(s) for s in brief.sources]
        claim_reads = [
            ClaimRead(
                id=c.id,
                brief_id=c.brief_id,
                statement=c.statement,
                status=c.status,
                evidence_summary=c.evidence_summary,
                source_ids=[s.id for s in c.sources],
            )
            for c in brief.claims
        ]
        return BriefDetailRead(
            id=brief.id,
            job_id=brief.job_id,
            title=brief.title,
            summary=brief.summary,
            content_markdown=brief.content_markdown,
            category=brief.category,
            subcategory=brief.subcategory,
            tags=brief.tags or [],
            confidence=brief.confidence,
            visibility=brief.visibility,
            research_type=brief.research_type,
            research_depth=brief.research_depth,
            source_count=brief.source_count,
            claim_count=brief.claim_count,
            cost_usd=brief.cost_usd,
            cost_inr=brief.cost_inr,
            cost_exchange_rate=brief.cost_exchange_rate,
            duration_seconds=brief.duration_seconds,
            model=brief.model,
            token_usage=brief.token_usage,
            total_tokens=brief.total_tokens,
            execution_meta=brief.execution_meta or {},
            research_started_at=brief.research_started_at,
            research_completed_at=brief.research_completed_at,
            published_at=brief.published_at,
            created_at=brief.created_at,
            updated_at=brief.updated_at,
            sources=source_reads,
            claims=claim_reads,
        )

    @app.post(
        "/api/v1/briefs",
        response_model=BriefDetailRead,
        status_code=status.HTTP_201_CREATED,
    )
    def publish_brief(
        payload: BriefCreate,
        response: Response,
        db_session: SASession = Depends(get_db),
        _: AuthContext = Depends(require_admin_or_service),
    ):
        # Idempotency Guarantee: If a brief with this job_id already exists, return it (HTTP 200)
        if payload.job_id:
            existing = db_session.scalar(
                select(Brief)
                .options(
                    selectinload(Brief.sources),
                    selectinload(Brief.claims).selectinload(Claim.sources),
                )
                .where(Brief.job_id == payload.job_id)
            )
            if existing:
                response.status_code = status.HTTP_200_OK
                return _build_brief_detail_response(existing)

        # Generate Brief ID
        date_prefix = datetime.now(UTC).strftime("%Y%m%d")
        slug = slugify(payload.title)
        brief_id = f"brief_{date_prefix}_{slug}_{generate_id()[:6]}"

        brief = Brief(
            id=brief_id,
            job_id=payload.job_id,
            title=payload.title,
            summary=payload.summary,
            content_markdown=payload.content_markdown,
            category=payload.category,
            subcategory=payload.subcategory,
            tags=payload.tags,
            confidence=payload.confidence,
            visibility=payload.visibility,
            research_type=payload.research_type,
            research_depth=payload.research_depth,
            cost_usd=payload.cost_usd,
            cost_inr=cost_inr_for(payload.cost_usd, settings),
            cost_exchange_rate=settings.usd_to_inr_rate if payload.cost_usd is not None else None,
            duration_seconds=payload.duration_seconds,
            model=payload.model,
            token_usage=payload.token_usage,
            execution_meta=payload.execution_meta,
            research_started_at=payload.research_started_at,
            research_completed_at=payload.research_completed_at,
            source_count=len(payload.sources),
            claim_count=len(payload.claims),
        )
        db_session.add(brief)
        db_session.flush()

        # Insert Sources and track temp_id mappings
        source_temp_map: dict[str, Source] = {}
        for s_in in payload.sources:
            src = Source(
                brief_id=brief.id,
                title=s_in.title,
                url=s_in.url,
                publisher=s_in.publisher,
                author=s_in.author,
                source_type=s_in.source_type,
                reliability=s_in.reliability,
                published_at=s_in.published_at,
                retrieved_at=s_in.retrieved_at or now_utc(),
                relevance=s_in.relevance,
            )
            db_session.add(src)
            db_session.flush()
            if s_in.temp_id:
                source_temp_map[s_in.temp_id] = src

        # Insert Claims and link Claim <-> Source many-to-many
        for c_in in payload.claims:
            claim = Claim(
                brief_id=brief.id,
                statement=c_in.statement,
                status=c_in.status,
                evidence_summary=c_in.evidence_summary,
            )
            # Map linked sources
            linked_sources: list[Source] = []
            for tid in c_in.source_temp_ids:
                if tid in source_temp_map:
                    linked_sources.append(source_temp_map[tid])
            for sid in c_in.source_ids:
                existing_src = db_session.get(Source, sid)
                if existing_src and existing_src not in linked_sources:
                    linked_sources.append(existing_src)

            claim.sources = linked_sources
            db_session.add(claim)

        # Mark linked ResearchJob completed if present
        if payload.job_id:
            job = db_session.get(ResearchJob, payload.job_id)
            if job and job.status != "completed":
                job.status = "completed"
                if not job.completed_at:
                    job.completed_at = now_utc()
                if payload.cost_usd is not None and job.cost_usd is None:
                    job.cost_usd = payload.cost_usd
                    job.cost_inr = cost_inr_for(payload.cost_usd, settings)
                    job.cost_exchange_rate = settings.usd_to_inr_rate
                if payload.duration_seconds is not None and job.duration_seconds is None:
                    job.duration_seconds = payload.duration_seconds
                if payload.model is not None and job.model is None:
                    job.model = payload.model
                if payload.token_usage is not None and job.token_usage is None:
                    job.token_usage = payload.token_usage

        db_session.commit()

        # Re-fetch with loaded relationships
        persisted = db_session.scalar(
            select(Brief)
            .options(
                undefer(Brief.content_markdown),
                selectinload(Brief.sources).undefer(Source.relevance),
                selectinload(Brief.claims).selectinload(Claim.sources),
            )
            .where(Brief.id == brief.id)
        )
        return _build_brief_detail_response(persisted)

    @app.get("/api/v1/briefs", response_model=BriefListRead)
    def list_briefs(
        search: str | None = None,
        category: str | None = None,
        subcategory: str | None = None,
        tag: str | None = None,
        visibility: str | None = None,
        limit: int = 50,
        offset: int = 0,
        db_session: SASession = Depends(get_db),
        auth: AuthContext = Depends(get_auth_context),
    ):
        base = select(Brief)

        # Strict-by-default server-side authorization filter
        if not auth.is_admin:
            if not settings.public_enabled:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Public access is currently disabled.",
                )
            base = base.where(Brief.visibility == "public")
        else:
            if visibility in ("private", "public"):
                base = base.where(Brief.visibility == visibility)

        # Search filter
        if search and search.strip():
            term = f"%{search.strip()}%"
            base = base.where(
                or_(
                    Brief.title.ilike(term),
                    Brief.summary.ilike(term),
                    Brief.content_markdown.ilike(term),
                )
            )

        # Category & Subcategory filter
        if category:
            base = base.where(Brief.category == category)
        if subcategory:
            base = base.where(Brief.subcategory == subcategory)

        # Tag filter via json_each
        if tag:
            tag_values = func.json_each(Brief.tags).table_valued("value").alias("tag_values")
            base = base.where(
                exists(select(1).select_from(tag_values).where(tag_values.c.value == tag))
            )

        total = db_session.scalar(select(func.count()).select_from(base.subquery())) or 0
        rows = db_session.scalars(
            base.order_by(Brief.published_at.desc(), Brief.id.desc()).limit(limit).offset(offset)
        ).all()

        return {"briefs": rows, "total": total, "limit": limit, "offset": offset}

    @app.get("/api/v1/briefs/{brief_id}", response_model=BriefDetailRead)
    def get_brief(
        brief_id: str,
        db_session: SASession = Depends(get_db),
        auth: AuthContext = Depends(get_auth_context),
    ):
        brief = db_session.scalar(
            select(Brief)
            .options(
                undefer(Brief.content_markdown),
                selectinload(Brief.sources).undefer(Source.relevance),
                selectinload(Brief.claims).selectinload(Claim.sources),
            )
            .where(Brief.id == brief_id)
        )
        if not brief:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Brief not found",
            )
        # Security check: Never leak private brief existence to anonymous
        if not auth.is_admin:
            if not settings.public_enabled:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Public access is currently disabled.",
                )
            if brief.visibility != "public":
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Brief not found",
                )

        return _build_brief_detail_response(brief)

    @app.get("/api/v1/briefs/{brief_id}/revisions", response_model=list[BriefRevisionRead])
    def get_brief_revisions(
        brief_id: str,
        db_session: SASession = Depends(get_db),
        auth: AuthContext = Depends(get_auth_context),
    ):
        brief = db_session.get(Brief, brief_id)
        if not brief:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Brief not found",
            )
        if not auth.is_admin:
            if not settings.public_enabled:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Public access is currently disabled.",
                )
            if brief.visibility != "public":
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Brief not found",
                )
        return db_session.scalars(
            select(BriefRevision)
            .where(BriefRevision.brief_id == brief_id)
            .order_by(BriefRevision.created_at.desc(), BriefRevision.id.desc())
        ).all()

    @app.patch("/api/v1/briefs/{brief_id}", response_model=BriefDetailRead)
    def update_brief(
        brief_id: str,
        payload: BriefUpdate,
        db_session: SASession = Depends(get_db),
        _: AuthContext = Depends(require_admin),
    ):
        brief = db_session.scalar(
            select(Brief)
            .options(
                undefer(Brief.content_markdown),
                selectinload(Brief.sources).undefer(Source.relevance),
                selectinload(Brief.claims).selectinload(Claim.sources),
            )
            .where(Brief.id == brief_id)
        )
        if not brief:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Brief not found",
            )
        if any(value is not None for value in payload.model_dump().values()):
            db_session.add(
                BriefRevision(
                    brief_id=brief.id,
                    title=brief.title,
                    summary=brief.summary,
                    content_markdown=brief.content_markdown,
                    claims_snapshot=[
                        {
                            "statement": claim.statement,
                            "status": claim.status,
                            "evidence_summary": claim.evidence_summary,
                            "source_ids": [source.id for source in claim.sources],
                        }
                        for claim in brief.claims
                    ],
                )
            )
        if payload.title is not None:
            brief.title = payload.title
        if payload.summary is not None:
            brief.summary = payload.summary
        if payload.content_markdown is not None:
            brief.content_markdown = payload.content_markdown
        if payload.category is not None:
            brief.category = payload.category
        if payload.subcategory is not None:
            brief.subcategory = payload.subcategory
        if payload.tags is not None:
            brief.tags = payload.tags
        if payload.confidence is not None:
            brief.confidence = payload.confidence
        if payload.visibility is not None:
            brief.visibility = payload.visibility
        if payload.cost_usd is not None:
            brief.cost_usd = payload.cost_usd
            brief.cost_inr = cost_inr_for(payload.cost_usd, settings)
            brief.cost_exchange_rate = settings.usd_to_inr_rate
        if payload.duration_seconds is not None:
            brief.duration_seconds = payload.duration_seconds
        if payload.model is not None:
            brief.model = payload.model
        if payload.token_usage is not None:
            brief.token_usage = payload.token_usage
        if payload.execution_meta is not None:
            brief.execution_meta = payload.execution_meta

        db_session.commit()
        db_session.refresh(brief)
        return _build_brief_detail_response(brief)

    @app.delete("/api/v1/briefs/{brief_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_brief(
        brief_id: str,
        db_session: SASession = Depends(get_db),
        _: AuthContext = Depends(require_admin),
    ):
        brief = db_session.get(Brief, brief_id)
        if not brief:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Brief not found",
            )
        db_session.delete(brief)
        db_session.commit()

    @app.get("/api/v1/taxonomies", response_model=TaxonomiesRead)
    def get_taxonomies(
        db_session: SASession = Depends(get_db),
        auth: AuthContext = Depends(get_auth_context),
    ):
        visibility_filter = []
        if not auth.is_admin:
            if not settings.public_enabled:
                return TaxonomiesRead(categories=[], tags=[])
            visibility_filter = [Brief.visibility == "public"]

        category_rows = db_session.execute(
            select(Brief.category, func.count())
            .where(*visibility_filter)
            .group_by(Brief.category)
            .order_by(func.count().desc())
        ).all()
        subcategory_rows = db_session.execute(
            select(Brief.category, Brief.subcategory)
            .where(*visibility_filter, Brief.subcategory != "")
            .distinct()
        ).all()
        cat_subcats: dict[str, set[str]] = {}
        for cat, subcat in subcategory_rows:
            cat_subcats.setdefault(cat or "General", set()).add(subcat)

        categories = [
            TaxonomyCategory(
                name=cat or "General",
                count=count,
                subcategories=sorted(cat_subcats.get(cat or "General", set())),
            )
            for cat, count in category_rows
        ]

        tag_values = func.json_each(Brief.tags).table_valued("value").alias("taxonomy_tags")
        tag_rows = db_session.execute(
            select(tag_values.c.value, func.count())
            .select_from(Brief)
            .join(tag_values, true())
            .where(*visibility_filter)
            .group_by(tag_values.c.value)
            .order_by(func.count().desc())
        ).all()
        tags = [TaxonomyTag(name=t, count=count) for t, count in tag_rows if t]

        total_spend, avg_duration, total_briefs = db_session.execute(
            select(
                func.coalesce(func.sum(Brief.cost_usd), 0.0),
                func.coalesce(func.avg(Brief.duration_seconds), 0.0),
                func.count(),
            ).where(*visibility_filter)
        ).one()

        return TaxonomiesRead(
            categories=categories,
            tags=tags,
            total_spend_usd=round(float(total_spend), 6),
            avg_duration_seconds=round(float(avg_duration), 2),
            total_briefs=total_briefs,
        )

    # ---------------- Legacy / Backward Compatible Endpoints ----------------

    @app.get("/api/posts", response_model=PostList)
    def legacy_list_posts(
        limit: int = 100,
        offset: int = 0,
        db_session: SASession = Depends(get_db),
        auth: AuthContext = Depends(get_auth_context),
    ):
        base = select(Brief)
        if not auth.is_admin:
            base = base.where(Brief.visibility == "public")
        total = db_session.scalar(select(func.count()).select_from(base.subquery())) or 0
        rows = db_session.scalars(
            base.order_by(Brief.published_at.desc()).limit(limit).offset(offset)
        ).all()
        legacy_rows = [
            PostRead(
                id=r.id,
                title=r.title,
                body=r.summary or r.content_markdown,
                visibility=r.visibility,
                created_at=r.created_at,
                updated_at=r.updated_at,
            )
            for r in rows
        ]
        return {"posts": legacy_rows, "total": total}

    # ---------------- Static frontend (SPA fallback) ----------------
    static_dir = settings.static_dir_path
    if static_dir.is_dir():
        assets_dir = static_dir / "assets"
        if assets_dir.is_dir():
            app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

        @app.get("/{full_path:path}", include_in_schema=False)
        def spa(full_path: str, request: Request):
            candidate = (static_dir / full_path).resolve()
            root = static_dir.resolve()
            if os.path.commonpath([str(root), str(candidate)]) == str(root) and candidate.is_file():
                if candidate.name == "index.html":
                    return FileResponse(
                        candidate,
                        headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
                    )
                return FileResponse(candidate)
            index = static_dir / "index.html"
            if index.is_file():
                return FileResponse(
                    index,
                    headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
                )
            return JSONResponse({"detail": "Not found"}, status_code=404)

    return app


# Module-level singleton for `uvicorn bugle.app:app`
app = create_app()
