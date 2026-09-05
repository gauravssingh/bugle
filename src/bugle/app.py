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
from dataclasses import dataclass
from datetime import UTC, datetime

from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response, status
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session as SASession
from sqlalchemy.orm import selectinload

from . import __version__
from .config import Settings, get_settings
from .db import Brief, Claim, Database, ResearchJob, Source, generate_id, now_utc
from .schemas import (
    AuthMeResponse,
    BriefCreate,
    BriefDetailRead,
    BriefListRead,
    BriefUpdate,
    ClaimRead,
    JobCreate,
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

    def get_db() -> SASession:
        return db.session()

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
            duration_seconds=payload.duration_seconds,
            model=payload.model,
            token_usage=payload.token_usage,
        )
        db_session.add(job)
        db_session.commit()
        db_session.refresh(job)
        return job

    @app.get("/api/v1/jobs/{job_id}", response_model=JobRead)
    def get_job(
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
        return job

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
        if payload.status is not None:
            job.status = payload.status
            if payload.status in ("completed", "failed", "cancelled") and not job.completed_at:
                job.completed_at = now_utc()
        if payload.execution_meta is not None:
            job.execution_meta = payload.execution_meta
        if payload.cost_usd is not None:
            job.cost_usd = payload.cost_usd
        if payload.duration_seconds is not None:
            job.duration_seconds = payload.duration_seconds
        if payload.model is not None:
            job.model = payload.model
        if payload.token_usage is not None:
            job.token_usage = payload.token_usage
        if payload.completed_at is not None:
            job.completed_at = payload.completed_at

        db_session.commit()
        db_session.refresh(job)
        return job

    @app.get("/api/v1/jobs", response_model=JobListRead)
    def list_jobs(
        limit: int = 50,
        offset: int = 0,
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
            payload.title
            or payload.url
            or (payload.text[:120] if payload.text else "")
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
                .options(selectinload(Brief.sources), selectinload(Brief.claims).selectinload(Claim.sources))
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
            .options(selectinload(Brief.sources), selectinload(Brief.claims).selectinload(Claim.sources))
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

        total = db_session.scalar(select(func.count()).select_from(base.subquery())) or 0
        rows = db_session.scalars(
            base.order_by(Brief.published_at.desc()).limit(limit).offset(offset)
        ).all()

        # If tag filter is specified, filter in memory or via json contains
        if tag:
            rows = [r for r in rows if tag in (r.tags or [])]
            total = len(rows)

        return {"briefs": rows, "total": total}

    @app.get("/api/v1/briefs/{brief_id}", response_model=BriefDetailRead)
    def get_brief(
        brief_id: str,
        db_session: SASession = Depends(get_db),
        auth: AuthContext = Depends(get_auth_context),
    ):
        brief = db_session.scalar(
            select(Brief)
            .options(selectinload(Brief.sources), selectinload(Brief.claims).selectinload(Claim.sources))
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

    @app.patch("/api/v1/briefs/{brief_id}", response_model=BriefDetailRead)
    def update_brief(
        brief_id: str,
        payload: BriefUpdate,
        db_session: SASession = Depends(get_db),
        _: AuthContext = Depends(require_admin),
    ):
        brief = db_session.scalar(
            select(Brief)
            .options(selectinload(Brief.sources), selectinload(Brief.claims).selectinload(Claim.sources))
            .where(Brief.id == brief_id)
        )
        if not brief:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Brief not found",
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
        base = select(Brief)
        if not auth.is_admin:
            if not settings.public_enabled:
                return TaxonomiesRead(categories=[], tags=[])
            base = base.where(Brief.visibility == "public")

        briefs = db_session.scalars(base).all()

        cat_counts: dict[str, int] = {}
        cat_subcats: dict[str, set[str]] = {}
        tag_counts: dict[str, int] = {}

        for b in briefs:
            cat = b.category or "General"
            cat_counts[cat] = cat_counts.get(cat, 0) + 1
            if b.subcategory:
                cat_subcats.setdefault(cat, set()).add(b.subcategory)
            for t in b.tags or []:
                tag_counts[t] = tag_counts.get(t, 0) + 1

        categories = [
            TaxonomyCategory(
                name=cat,
                count=count,
                subcategories=sorted(cat_subcats.get(cat, set())),
            )
            for cat, count in sorted(cat_counts.items(), key=lambda x: -x[1])
        ]

        tags = [
            TaxonomyTag(name=t, count=count)
            for t, count in sorted(tag_counts.items(), key=lambda x: -x[1])
        ]

        total_spend = sum(b.cost_usd for b in briefs if b.cost_usd is not None)
        durations = [b.duration_seconds for b in briefs if b.duration_seconds is not None]
        avg_duration = (sum(durations) / len(durations)) if durations else 0.0

        return TaxonomiesRead(
            categories=categories,
            tags=tags,
            total_spend_usd=round(total_spend, 6),
            avg_duration_seconds=round(avg_duration, 2),
            total_briefs=len(briefs),
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
            if (
                os.path.commonpath([str(root), str(candidate)]) == str(root)
                and candidate.is_file()
            ):
                return FileResponse(candidate)
            index = static_dir / "index.html"
            if index.is_file():
                return FileResponse(index)
            return JSONResponse({"detail": "Not found"}, status_code=404)

    return app


# Module-level singleton for `uvicorn bugle.app:app`
app = create_app()