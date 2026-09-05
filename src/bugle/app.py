"""FastAPI application for Bugle.

Serves a small JSON API (announcement/journal posts, SQLite-backed) and, when a
built frontend exists in `web/dist`, serves it statically from the root — the
same FastAPI + static-dist pattern MyMonee uses.
"""

from __future__ import annotations

import os

from fastapi import Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select
from sqlalchemy.orm import Session as SASession

from . import __version__
from .config import Settings, get_settings
from .db import Database, Post
from .schemas import PostCreate, PostList, PostRead, PostUpdate


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    db = Database(settings)

    app = FastAPI(title="Bugle", version=__version__)
    app.state.db = db
    app.state.settings = settings

    def get_db() -> SASession:
        return db.session()

    def require_auth(authorization: str | None = Header(default=None)) -> None:
        """Bearer-token gate on mutating endpoints; no-op when no token set."""
        expected = settings.write_token
        if not expected:
            return
        if authorization != f"Bearer {expected}":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unauthorized. Provide an admin bearer token.",
            )

    def not_found() -> HTTPException:
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    # ---------------- API ----------------
    @app.get("/api/health")
    def health():
        return {"status": "ok", "app": "bugle", "version": __version__}

    @app.get("/api/posts", response_model=PostList)
    def list_posts(
        visibility: str = "private",
        limit: int = 100,
        offset: int = 0,
        session: SASession = Depends(get_db),
    ):
        base = select(Post)
        if visibility in ("private", "public"):
            base = base.where(Post.visibility == visibility)
        total = session.scalar(select(func.count()).select_from(base.subquery())) or 0
        rows = session.scalars(
            base.order_by(Post.created_at.desc()).limit(limit).offset(offset)
        ).all()
        return {"posts": rows, "total": total}

    @app.post(
        "/api/posts", response_model=PostRead, status_code=status.HTTP_201_CREATED
    )
    def create_post(
        payload: PostCreate,
        db: SASession = Depends(get_db),
        _: str | None = Depends(require_auth),
    ):
        post = Post(
            title=payload.title, body=payload.body, visibility=payload.visibility
        )
        db.add(post)
        db.commit()
        db.refresh(post)
        return post

    @app.get("/api/posts/{post_id}", response_model=PostRead)
    def get_post(post_id: int, db: SASession = Depends(get_db)):
        post = db.get(Post, post_id)
        if post is None:
            raise not_found()
        return post

    @app.patch("/api/posts/{post_id}", response_model=PostRead)
    def update_post(
        post_id: int,
        payload: PostUpdate,
        db: SASession = Depends(get_db),
        _: str | None = Depends(require_auth),
    ):
        post = db.get(Post, post_id)
        if post is None:
            raise not_found()
        if payload.title is not None:
            post.title = payload.title
        if payload.body is not None:
            post.body = payload.body
        if payload.visibility is not None:
            post.visibility = payload.visibility
        db.commit()
        db.refresh(post)
        return post

    @app.delete("/api/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_post(
        post_id: int,
        db: SASession = Depends(get_db),
        _: str | None = Depends(require_auth),
    ):
        post = db.get(Post, post_id)
        if post is None:
            raise not_found()
        db.delete(post)
        db.commit()
        return None  # status_code=204

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


# Module-level singleton for `uvicorn bugle.app:app` invocations in the daemon.
app = create_app()