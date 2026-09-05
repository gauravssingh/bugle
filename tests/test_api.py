"""Smoke tests for the Bugle API."""

from __future__ import annotations

import tempfile

import pytest
from fastapi.testclient import TestClient

from bugle.app import create_app
from bugle.config import Settings


@pytest.fixture()
def client(tmp_path):
    settings = Settings(data_dir=str(tmp_path), static_dir="_missing_")
    app = create_app(settings)
    return TestClient(app)


def test_health(client):
    assert client.get("/api/health").json()["app"] == "bugle"


def test_post_crud(client):
    r = client.post(
        "/api/posts", json={"title": "Hello", "body": "first bugle", "visibility": "private"}
    )
    assert r.status_code == 201, r.text
    pid = r.json()["id"]

    got = client.get(f"/api/posts/{pid}")
    assert got.json()["title"] == "Hello"

    listed = client.get("/api/posts?visibility=private")
    assert listed.json()["total"] == 1

    r = client.patch(f"/api/posts/{pid}", json={"body": "updated"})
    assert r.json()["body"] == "updated"

    assert client.delete(f"/api/posts/{pid}").status_code == 204
    assert client.get(f"/api/posts/{pid}").status_code == 404


def test_write_token_enforced(tmp_path):
    settings = Settings(data_dir=str(tmp_path), static_dir=str(tmp_path), write_token="sekret")
    app = create_app(settings)
    client = TestClient(app)

    # Read is open.
    assert client.get("/api/posts").status_code == 200

    # Write without token -> 401.
    assert client.post("/api/posts", json={"body": "x"}).status_code == 401

    # Write with token -> 201.
    r = client.post(
        "/api/posts", json={"body": "x"}, headers={"Authorization": "Bearer sekret"}
    )
    assert r.status_code == 201