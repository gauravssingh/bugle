"""Database migration script for Bugle.

Backs up the SQLite database, provisions new tables (research_jobs, briefs,
sources, claims, claim_sources), migrates legacy posts if present, and preserves
an archive of the original schema.
"""

from __future__ import annotations

import shutil
import sqlite3
from datetime import UTC, datetime

from .config import Settings, get_settings
from .db import Base, _build_engine


def backup_database(settings: Settings) -> str | None:
    db_file = settings.db_path
    if not db_file.exists():
        return None

    backup_dir = settings.data_dir_path / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    backup_path = backup_dir / f"bugle-{timestamp}.db"
    shutil.copy2(db_file, backup_path)
    return str(backup_path)


def run_migration(settings: Settings | None = None) -> None:
    settings = settings or get_settings()

    # 1. Backup pre-migration
    backup_file = backup_database(settings)
    if backup_file:
        print(f"[migrate] Backup created at: {backup_file}")

    # 2. Build engine & create new schema tables
    engine = _build_engine(settings)
    Base.metadata.create_all(engine)
    print("[migrate] Created tables: research_jobs, briefs, sources, claims, claim_sources")

    # 3. Check for legacy `posts` table
    db_path = str(settings.db_path)
    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='posts';")
        has_posts_table = cursor.fetchone() is not None

        if has_posts_table:
            cursor.execute("SELECT id, title, body, visibility, created_at, updated_at FROM posts;")
            posts = cursor.fetchall()
            if posts:
                print(f"[migrate] Migrating {len(posts)} legacy post(s) to briefs...")
                now_str = datetime.now(UTC).isoformat()
                for post_id, title, body, visibility, created_at, updated_at in posts:
                    brief_id = f"brief_legacy_{post_id}"
                    summary = (body[:200] + "...") if len(body) > 200 else body
                    cursor.execute(
                        """
                        INSERT OR IGNORE INTO briefs (
                            id, job_id, title, summary, content_markdown,
                            category, subcategory, tags, confidence, visibility,
                            research_type, research_depth, source_count, claim_count,
                            published_at, created_at, updated_at
                        ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?);
                        """,
                        (
                            brief_id,
                            title or "Legacy Entry",
                            summary or "No summary",
                            body or "",
                            "Archived",
                            "Legacy",
                            '["legacy-import"]',
                            "medium",
                            visibility or "private",
                            "general",
                            "fast",
                            created_at or now_str,
                            created_at or now_str,
                            updated_at or now_str,
                        ),
                    )
            # Rename legacy posts table so it doesn't conflict
            cursor.execute("ALTER TABLE posts RENAME TO _legacy_posts;")
            conn.commit()
            print("[migrate] Legacy posts moved to _legacy_posts table.")

    print("[migrate] Migration completed successfully.")


if __name__ == "__main__":
    run_migration()
