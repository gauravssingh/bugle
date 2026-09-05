"""Pydantic request/response schemas for Bugle API v1."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

# ---------------- Auth Context ----------------

class AuthMeResponse(BaseModel):
    role: str  # admin | service | anonymous
    email: str | None = None
    is_admin: bool = False
    is_service: bool = False
    public_enabled: bool = False


# ---------------- Research Jobs ----------------

class JobCreate(BaseModel):
    id: str | None = None
    topic: str = Field(..., max_length=500)
    research_type: str = Field(default="general", max_length=50)
    research_depth: str = Field(default="standard", max_length=50)
    execution_meta: dict[str, Any] = Field(default_factory=dict)
    cost_usd: float | None = None
    duration_seconds: float | None = None
    model: str | None = None
    token_usage: dict[str, Any] | None = None


class JobUpdate(BaseModel):
    status: str | None = None  # pending | running | completed | failed | cancelled
    execution_meta: dict[str, Any] | None = None
    cost_usd: float | None = None
    duration_seconds: float | None = None
    model: str | None = None
    token_usage: dict[str, Any] | None = None
    completed_at: datetime | None = None


class JobRead(BaseModel):
    id: str
    topic: str
    research_type: str
    research_depth: str
    status: str
    execution_meta: dict[str, Any]
    cost_usd: float | None = None
    duration_seconds: float | None = None
    model: str | None = None
    token_usage: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class JobListRead(BaseModel):
    jobs: list[JobRead]
    total: int


class QuickIngestRequest(BaseModel):
    url: str | None = None
    title: str | None = None
    text: str | None = None
    research_depth: str = Field(default="standard", max_length=50)
    research_type: str = Field(default="general", max_length=50)


class QuickIngestResponse(BaseModel):
    status: str
    job_id: str
    topic: str
    research_depth: str
    view_url: str
    message: str


# ---------------- Sources & Claims ----------------

class SourceCreate(BaseModel):
    temp_id: str | None = None  # Client-provided identifier to correlate with claims
    title: str = Field(default="", max_length=300)
    url: str = Field(default="", max_length=1000)
    publisher: str = Field(default="", max_length=200)
    author: str | None = Field(default=None, max_length=200)
    source_type: str = Field(default="general", max_length=50)
    reliability: str = Field(default="secondary", max_length=50)
    published_at: datetime | None = None
    retrieved_at: datetime | None = None
    relevance: str | None = None


class SourceRead(BaseModel):
    id: int
    brief_id: str
    title: str
    url: str
    publisher: str
    author: str | None
    source_type: str
    reliability: str
    published_at: datetime | None
    retrieved_at: datetime
    relevance: str | None

    model_config = ConfigDict(from_attributes=True)


class ClaimCreate(BaseModel):
    statement: str
    status: str = "unverified"  # verified | contradicted | unverified
    evidence_summary: str = ""
    source_temp_ids: list[str] = Field(default_factory=list)
    source_ids: list[int] = Field(default_factory=list)


class ClaimRead(BaseModel):
    id: int
    brief_id: str
    statement: str
    status: str
    evidence_summary: str
    source_ids: list[int] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


# ---------------- Research Briefs ----------------

class BriefCreate(BaseModel):
    job_id: str | None = None
    title: str = Field(..., max_length=300)
    summary: str = Field(default="", max_length=5000)
    content_markdown: str = Field(default="", max_length=500_000)
    category: str = Field(default="Technology", max_length=100)
    subcategory: str = Field(default="", max_length=100)
    tags: list[str] = Field(default_factory=list)
    confidence: str = Field(default="medium", max_length=20)  # high | medium | low
    visibility: str = Field(default="private", max_length=20)  # private | public
    research_type: str = Field(default="general", max_length=50)
    research_depth: str = Field(default="standard", max_length=50)
    cost_usd: float | None = None
    duration_seconds: float | None = None
    model: str | None = None
    token_usage: dict[str, Any] | None = None
    execution_meta: dict[str, Any] = Field(default_factory=dict)
    research_started_at: datetime | None = None
    research_completed_at: datetime | None = None
    sources: list[SourceCreate] = Field(default_factory=list)
    claims: list[ClaimCreate] = Field(default_factory=list)


class BriefUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=300)
    summary: str | None = None
    content_markdown: str | None = None
    category: str | None = None
    subcategory: str | None = None
    tags: list[str] | None = None
    confidence: str | None = None
    visibility: str | None = None  # private | public
    cost_usd: float | None = None
    duration_seconds: float | None = None
    model: str | None = None
    token_usage: dict[str, Any] | None = None
    execution_meta: dict[str, Any] | None = None


class BriefSummaryRead(BaseModel):
    id: str
    job_id: str | None
    title: str
    summary: str
    category: str
    subcategory: str
    tags: list[str]
    confidence: str
    visibility: str
    research_type: str
    research_depth: str
    source_count: int
    claim_count: int
    cost_usd: float | None = None
    duration_seconds: float | None = None
    model: str | None = None
    total_tokens: int | None = None
    published_at: datetime
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BriefDetailRead(BriefSummaryRead):
    content_markdown: str
    token_usage: dict[str, Any] | None = None
    execution_meta: dict[str, Any] = Field(default_factory=dict)
    research_started_at: datetime | None
    research_completed_at: datetime | None
    sources: list[SourceRead] = Field(default_factory=list)
    claims: list[ClaimRead] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class BriefListRead(BaseModel):
    briefs: list[BriefSummaryRead]
    total: int


class TaxonomyCategory(BaseModel):
    name: str
    count: int
    subcategories: list[str] = Field(default_factory=list)


class TaxonomyTag(BaseModel):
    name: str
    count: int


class TaxonomiesRead(BaseModel):
    categories: list[TaxonomyCategory]
    tags: list[TaxonomyTag]
    total_spend_usd: float = 0.0
    avg_duration_seconds: float = 0.0
    total_briefs: int = 0


# ---------------- Backward Compatibility ----------------

class PostCreate(BaseModel):
    title: str = Field(default="", max_length=200)
    body: str = Field(default="", max_length=50_000)
    visibility: str = "private"


class PostRead(BaseModel):
    id: str
    title: str
    body: str
    visibility: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PostList(BaseModel):
    posts: list[PostRead]
    total: int