"""Pydantic request/response models for the Bugle API."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class PostCreate(BaseModel):
    title: str = Field(default="", max_length=200)
    body: str = Field(default="", max_length=50_000)
    visibility: str = "private"  # private | public


class PostUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    body: str | None = None
    visibility: str | None = None


class PostRead(BaseModel):
    id: int
    title: str
    body: str
    visibility: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PostList(BaseModel):
    posts: list[PostRead]
    total: int