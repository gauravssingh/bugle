"""`python -m bugle` entrypoint — starts the FastAPI server.

Usage:
    python -m bugle                 # reads settings from env/.env, default :8480
    python -m bugle --port 8480
"""

from __future__ import annotations

import argparse

import uvicorn

from .app import app
from .config import get_settings


def main() -> None:
    settings = get_settings()

    parser = argparse.ArgumentParser(prog="bugle")
    parser.add_argument("--host", default=settings.host)
    parser.add_argument("--port", type=int, default=settings.port)
    parser.add_argument("--reload", action="store_true", help="auto-reload during dev")
    args = parser.parse_args()

    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level="info",
    )


if __name__ == "__main__":
    main()
