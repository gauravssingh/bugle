"""Comprehensive tests for the Bugle v1 API.

Covers:
- Health check & auth identity resolution
- Research job lifecycle (pending -> running -> completed)
- Idempotent research brief publication
- Claim <-> Source many-to-many evidence mapping
- Strict server-side security invariants (no private data leaks to anonymous)
- Cloudflare Access and Service Token authentication
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from bugle.app import create_app
from bugle.config import Settings

ADMIN_EMAIL = "gaurav.singh.86@gmail.com"
SERVICE_TOKEN = "hermes_secret_token_123"


@pytest.fixture()
def settings(tmp_path):
    return Settings(
        data_dir=str(tmp_path),
        static_dir=str(tmp_path / "dist"),
        service_token=SERVICE_TOKEN,
        admin_email=ADMIN_EMAIL,
        public_enabled=False,
        dev_mode=False,
    )


@pytest.fixture()
def client(settings):
    app = create_app(settings)
    return TestClient(app)


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["app"] == "bugle"
    assert r.json()["status"] == "ok"


def test_auth_me_resolution(client):
    # Anonymous
    r = client.get("/api/v1/auth/me")
    assert r.status_code == 200
    assert r.json()["role"] == "anonymous"
    assert r.json()["is_admin"] is False
    assert r.json()["is_service"] is False

    # Hermes Service Token
    r = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {SERVICE_TOKEN}"},
    )
    assert r.status_code == 200
    assert r.json()["role"] == "service"
    assert r.json()["is_service"] is True
    assert r.json()["is_admin"] is True

    # Cloudflare Access Operator
    r = client.get(
        "/api/v1/auth/me",
        headers={"Cf-Access-Authenticated-User-Email": ADMIN_EMAIL},
    )
    assert r.status_code == 200
    assert r.json()["role"] == "admin"
    assert r.json()["email"] == ADMIN_EMAIL
    assert r.json()["is_admin"] is True


def test_research_job_lifecycle(client):
    service_headers = {"Authorization": f"Bearer {SERVICE_TOKEN}"}

    # 1. Commission new job
    r = client.post(
        "/api/v1/jobs",
        json={
            "topic": "DeepSeek R1 Training Pipeline",
            "research_type": "technical_topic",
            "research_depth": "deep",
            "execution_meta": {"initiated_via": "telegram", "requester": "gaurav"},
        },
        headers=service_headers,
    )
    assert r.status_code == 201, r.text
    job = r.json()
    job_id = job["id"]
    assert job["status"] == "pending"
    assert job["topic"] == "DeepSeek R1 Training Pipeline"

    # 2. Update job to running
    r = client.patch(
        f"/api/v1/jobs/{job_id}",
        json={"status": "running"},
        headers=service_headers,
    )
    assert r.status_code == 200
    assert r.json()["status"] == "running"

    # 3. Retrieve job
    r = client.get(f"/api/v1/jobs/{job_id}", headers=service_headers)
    assert r.status_code == 200
    assert r.json()["status"] == "running"


def test_idempotent_brief_publication_with_claims_and_sources(client):
    service_headers = {"Authorization": f"Bearer {SERVICE_TOKEN}"}
    admin_headers = {"Cf-Access-Authenticated-User-Email": ADMIN_EMAIL}

    # Commission job first
    r_job = client.post(
        "/api/v1/jobs",
        json={"topic": "Liquid Foundation Models", "research_depth": "standard"},
        headers=service_headers,
    )
    job_id = r_job.json()["id"]

    brief_payload = {
        "job_id": job_id,
        "title": "Liquid Foundation Models (LFMs) Evaluation",
        "summary": "Evaluation of continuous-time neural models developed by Liquid AI.",
        "content_markdown": "# LFMs Overview\n\nContinuous-time neural architectures...",
        "category": "Technology",
        "subcategory": "Artificial Intelligence",
        "tags": ["liquid-ai", "continuous-time", "edge-ai"],
        "confidence": "high",
        "visibility": "private",
        "research_type": "technical_topic",
        "research_depth": "standard",
        "sources": [
            {
                "temp_id": "src_1",
                "title": "Liquid AI 1B/3B Release",
                "url": "https://liquid.ai/blog/lfm",
                "publisher": "Liquid AI",
                "source_type": "blog",
                "reliability": "primary",
            },
            {
                "temp_id": "src_2",
                "title": "Continuous-Time Models in Practice",
                "url": "https://arxiv.org/abs/2401.00000",
                "publisher": "arXiv",
                "source_type": "paper",
                "reliability": "primary",
            },
        ],
        "claims": [
            {
                "statement": "LFMs demonstrate superior memory efficiency over standard Transformers in long sequences.",
                "status": "verified",
                "evidence_summary": "Benchmarked in Section 4.2 with sub-quadratic memory footprint.",
                "source_temp_ids": ["src_1", "src_2"],
            }
        ],
    }

    # First publication attempt -> 201 Created
    r1 = client.post("/api/v1/briefs", json=brief_payload, headers=service_headers)
    assert r1.status_code == 201, r1.text
    brief1 = r1.json()
    brief_id = brief1["id"]
    assert brief1["title"] == "Liquid Foundation Models (LFMs) Evaluation"
    assert brief1["source_count"] == 2
    assert brief1["claim_count"] == 1
    assert len(brief1["sources"]) == 2
    assert len(brief1["claims"]) == 1
    # Verify Claim <-> Source mapping
    claim = brief1["claims"][0]
    assert len(claim["source_ids"]) == 2

    # Verify linked job transitioned to completed
    r_job_check = client.get(f"/api/v1/jobs/{job_id}", headers=service_headers)
    assert r_job_check.json()["status"] == "completed"

    # Second publication attempt with same job_id (IDEMPOTENCY TEST) -> Returns 200 with same brief
    r2 = client.post("/api/v1/briefs", json=brief_payload, headers=service_headers)
    assert r2.status_code == 200, r2.text
    brief2 = r2.json()
    assert brief2["id"] == brief_id

    # Verify total briefs count in admin list is exactly 1 (no duplicate)
    r_list = client.get("/api/v1/briefs", headers=admin_headers)
    assert r_list.status_code == 200
    assert r_list.json()["total"] == 1


def test_strict_security_invariants_no_private_leak(client, settings):
    service_headers = {"Authorization": f"Bearer {SERVICE_TOKEN}"}
    admin_headers = {"Cf-Access-Authenticated-User-Email": ADMIN_EMAIL}

    # Create 1 private brief and 1 public brief
    r_priv = client.post(
        "/api/v1/briefs",
        json={
            "title": "Confidential Intelligence Brief",
            "summary": "Sensitive private data.",
            "visibility": "private",
            "category": "Security",
        },
        headers=service_headers,
    )
    priv_id = r_priv.json()["id"]

    r_pub = client.post(
        "/api/v1/briefs",
        json={
            "title": "Public AI News",
            "summary": "Publicly shareable synthesis.",
            "visibility": "public",
            "category": "Technology",
        },
        headers=service_headers,
    )
    pub_id = r_pub.json()["id"]

    # 1. Anonymous with public_enabled=False -> 403 Forbidden
    r_anon = client.get("/api/v1/briefs")
    assert r_anon.status_code == 403

    # 2. Enable public surface
    settings.public_enabled = True

    # Anonymous listing must ONLY contain the public brief
    r_anon_list = client.get("/api/v1/briefs")
    assert r_anon_list.status_code == 200
    assert r_anon_list.json()["total"] == 1
    assert r_anon_list.json()["briefs"][0]["id"] == pub_id

    # Anonymous attempting to bypass via query params (?visibility=private or ?visibility=all)
    r_bypass_priv = client.get("/api/v1/briefs?visibility=private")
    assert r_bypass_priv.json()["total"] == 1
    assert r_bypass_priv.json()["briefs"][0]["id"] == pub_id  # Invariant held!

    r_bypass_all = client.get("/api/v1/briefs?visibility=all")
    assert r_bypass_all.json()["total"] == 1
    assert r_bypass_all.json()["briefs"][0]["id"] == pub_id  # Invariant held!

    # Anonymous querying private brief by ID -> Returns 404 (does not leak existence)
    r_anon_id = client.get(f"/api/v1/briefs/{priv_id}")
    assert r_anon_id.status_code == 404

    # Anonymous querying public brief by ID -> Returns 200
    r_anon_pub = client.get(f"/api/v1/briefs/{pub_id}")
    assert r_anon_pub.status_code == 200
    assert r_anon_pub.json()["id"] == pub_id

    # Admin querying private brief -> Returns 200
    r_admin_priv = client.get(f"/api/v1/briefs/{priv_id}", headers=admin_headers)
    assert r_admin_priv.status_code == 200
    assert r_admin_priv.json()["id"] == priv_id

    # Admin querying list sees all briefs (total = 2)
    r_admin_list = client.get("/api/v1/briefs", headers=admin_headers)
    assert r_admin_list.json()["total"] == 2


def test_anonymous_write_and_delete_denied(client):
    # Anonymous POST /api/v1/jobs -> 401
    assert client.post("/api/v1/jobs", json={"topic": "test"}).status_code == 401

    # Anonymous POST /api/v1/briefs -> 401
    assert client.post("/api/v1/briefs", json={"title": "test"}).status_code == 401

    # Anonymous DELETE /api/v1/briefs/123 -> 401
    assert client.delete("/api/v1/briefs/123").status_code == 401


def test_taxonomies(client):
    admin_headers = {"Cf-Access-Authenticated-User-Email": ADMIN_EMAIL}
    service_headers = {"Authorization": f"Bearer {SERVICE_TOKEN}"}

    client.post(
        "/api/v1/briefs",
        json={
            "title": "Quantum Computing Milestones",
            "category": "Technology",
            "subcategory": "Quantum",
            "tags": ["hardware", "qubits"],
        },
        headers=service_headers,
    )

    r = client.get("/api/v1/taxonomies", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert len(data["categories"]) >= 1
    assert any(c["name"] == "Technology" for c in data["categories"])
    assert any(t["name"] == "qubits" for t in data["tags"])


def test_search_and_filters(client):
    admin_headers = {"Cf-Access-Authenticated-User-Email": ADMIN_EMAIL}
    service_headers = {"Authorization": f"Bearer {SERVICE_TOKEN}"}

    client.post(
        "/api/v1/briefs",
        json={
            "title": "OpenAI o3-mini Reasoning Evaluation",
            "summary": "Benchmarking o3-mini coding and math capability.",
            "content_markdown": "Deep dive into o3-mini benchmark results...",
            "category": "Technology",
            "subcategory": "AI",
            "tags": ["openai", "reasoning", "benchmarks"],
        },
        headers=service_headers,
    )
    client.post(
        "/api/v1/briefs",
        json={
            "title": "Federal Reserve Rate Decision",
            "summary": "Macroeconomic implications of the latest FOMC meeting.",
            "content_markdown": "Inflation targets and policy outlook...",
            "category": "Business",
            "subcategory": "Finance",
            "tags": ["macro", "rates"],
        },
        headers=service_headers,
    )

    # Search by keyword
    r_search = client.get("/api/v1/briefs?search=o3-mini", headers=admin_headers)
    assert r_search.json()["total"] == 1
    assert "o3-mini" in r_search.json()["briefs"][0]["title"]

    # Filter by category
    r_cat = client.get("/api/v1/briefs?category=Business", headers=admin_headers)
    assert r_cat.json()["total"] == 1
    assert r_cat.json()["briefs"][0]["category"] == "Business"

    # Filter by tag
    r_tag = client.get("/api/v1/briefs?tag=reasoning", headers=admin_headers)
    assert r_tag.json()["total"] == 1
    assert "openai" in r_tag.json()["briefs"][0]["tags"]


def test_update_and_delete_brief(client):
    admin_headers = {"Cf-Access-Authenticated-User-Email": ADMIN_EMAIL}
    service_headers = {"Authorization": f"Bearer {SERVICE_TOKEN}"}

    # Create brief with sources and claims
    r = client.post(
        "/api/v1/briefs",
        json={
            "title": "Draft Brief",
            "summary": "Work in progress",
            "visibility": "private",
            "sources": [{"title": "Doc 1", "url": "https://example.com"}],
            "claims": [{"statement": "Draft claim", "status": "unverified"}],
        },
        headers=service_headers,
    )
    brief_id = r.json()["id"]

    # Operator patches brief
    r_patch = client.patch(
        f"/api/v1/briefs/{brief_id}",
        json={"title": "Final Brief", "visibility": "public"},
        headers=admin_headers,
    )
    assert r_patch.status_code == 200
    assert r_patch.json()["title"] == "Final Brief"
    assert r_patch.json()["visibility"] == "public"

    # Operator deletes brief
    r_del = client.delete(f"/api/v1/briefs/{brief_id}", headers=admin_headers)
    assert r_del.status_code == 204

    # Verification: brief is gone
    r_check = client.get(f"/api/v1/briefs/{brief_id}", headers=admin_headers)
    assert r_check.status_code == 404


def test_legacy_posts_compatibility(client):
    admin_headers = {"Cf-Access-Authenticated-User-Email": ADMIN_EMAIL}
    service_headers = {"Authorization": f"Bearer {SERVICE_TOKEN}"}

    client.post(
        "/api/v1/briefs",
        json={
            "title": "Legacy Test Entry",
            "summary": "Summary text",
            "visibility": "private",
        },
        headers=service_headers,
    )

    r = client.get("/api/posts", headers=admin_headers)
    assert r.status_code == 200
    posts = r.json()["posts"]
    assert len(posts) >= 1
    assert posts[0]["title"] == "Legacy Test Entry"


def test_quick_ingest(client):
    service_headers = {"Authorization": f"Bearer {SERVICE_TOKEN}"}

    r = client.post(
        "/api/v1/ingest/quick",
        json={
            "url": "https://arxiv.org/abs/2501.12948",
            "title": "DeepSeek R1 Paper",
            "text": "Check claims regarding GRPO memory savings",
            "research_depth": "deep",
        },
        headers=service_headers,
    )
    assert r.status_code == 201
    data = r.json()
    assert "bugle.gauravs-apps.in" in data["view_url"]


def test_cost_and_execution_metadata(client):
    service_headers = {"Authorization": f"Bearer {SERVICE_TOKEN}"}
    admin_headers = {"Cf-Access-Authenticated-User-Email": ADMIN_EMAIL}

    # 1. Publish brief with cost, duration, model, token usage
    r = client.post(
        "/api/v1/briefs",
        json={
            "title": "Quantum Error Correction Benchmark",
            "summary": "Deep dive into surface codes and logical qubit fidelity.",
            "visibility": "private",
            "cost_usd": 0.00345,
            "duration_seconds": 7.82,
            "model": "deepseek/deepseek-v4-flash-0731",
            "token_usage": {
                "input": 45100,
                "output": 820,
                "reasoning": 210,
                "total": 45920,
            },
            "execution_meta": {
                "provider": "openrouter",
                "tool_calls_count": 3,
            },
        },
        headers=service_headers,
    )
    assert r.status_code == 201
    brief = r.json()
    assert brief["cost_usd"] == 0.00345
    assert brief["duration_seconds"] == 7.82
    assert brief["model"] == "deepseek/deepseek-v4-flash-0731"
    assert brief["total_tokens"] == 45920
    assert brief["token_usage"]["input"] == 45100
    assert brief["execution_meta"]["tool_calls_count"] == 3

    # 2. Verify summary list includes cost, duration, model, total_tokens
    r_list = client.get("/api/v1/briefs", headers=admin_headers)
    assert r_list.status_code == 200
    items = r_list.json()["briefs"]
    matched = next((b for b in items if b["id"] == brief["id"]), None)
    assert matched is not None
    assert matched["cost_usd"] == 0.00345
    assert matched["duration_seconds"] == 7.82
    assert matched["model"] == "deepseek/deepseek-v4-flash-0731"
    assert matched["total_tokens"] == 45920

    # 3. Verify taxonomies aggregate stats
    r_tax = client.get("/api/v1/taxonomies", headers=admin_headers)
    assert r_tax.status_code == 200
    tax = r_tax.json()
    assert tax["total_spend_usd"] >= 0.00345
    assert tax["avg_duration_seconds"] > 0
    assert tax["total_briefs"] >= 1


def test_system_status_and_db_health(client):
    admin_headers = {"Cf-Access-Authenticated-User-Email": ADMIN_EMAIL}

    status_response = client.get("/api/v1/system/status", headers=admin_headers)
    assert status_response.status_code == 200
    status_data = status_response.json()
    assert status_data["status"] == "ok"
    assert "briefs" in status_data["database"]
    assert "jobs" in status_data["database"]

    health_response = client.get("/api/v1/system/db-health", headers=admin_headers)
    assert health_response.status_code == 200
    health_data = health_response.json()
    assert health_data["integrity_ok"] is True
    assert health_data["foreign_keys_ok"] is True
    assert health_data["page_count"] >= 1


def test_db_vacuum_endpoint(client):
    admin_headers = {"Cf-Access-Authenticated-User-Email": ADMIN_EMAIL}

    # Anonymous denied
    r_anon = client.post("/api/v1/system/db-vacuum")
    assert r_anon.status_code == 401

    # Admin allowed
    r_admin = client.post("/api/v1/system/db-vacuum", headers=admin_headers)
    assert r_admin.status_code == 200
    data = r_admin.json()
    assert data["status"] == "ok"
    assert "page_count" in data
    assert data["page_count"] >= 1


def test_job_events_lifecycle_tracking(client):
    admin_headers = {"Cf-Access-Authenticated-User-Email": ADMIN_EMAIL}

    # 1. Create job
    create_res = client.post(
        "/api/v1/jobs",
        json={"topic": "Quantum Annealing Benchmarks"},
        headers=admin_headers,
    )
    assert create_res.status_code == 201
    job_id = create_res.json()["id"]

    # 2. Update status: pending -> running
    patch1 = client.patch(
        f"/api/v1/jobs/{job_id}",
        json={"status": "running"},
        headers=admin_headers,
    )
    assert patch1.status_code == 200

    # 3. Update status: running -> completed
    patch2 = client.patch(
        f"/api/v1/jobs/{job_id}",
        json={"status": "completed"},
        headers=admin_headers,
    )
    assert patch2.status_code == 200

    # 4. Fetch job events endpoint
    events_res = client.get(f"/api/v1/jobs/{job_id}/events", headers=admin_headers)
    assert events_res.status_code == 200
    events = events_res.json()
    assert len(events) == 3
    assert events[0]["to_status"] == "pending"
    assert events[1]["from_status"] == "pending"
    assert events[1]["to_status"] == "running"
    assert events[2]["from_status"] == "running"
    assert events[2]["to_status"] == "completed"

    # Also verify events are nested on GET /jobs/{id}
    job_res = client.get(f"/api/v1/jobs/{job_id}", headers=admin_headers)
    assert len(job_res.json()["events"]) == 3


def test_brief_revisions_snapshot_on_update(client):
    service_headers = {"Authorization": f"Bearer {SERVICE_TOKEN}"}
    admin_headers = {"Cf-Access-Authenticated-User-Email": ADMIN_EMAIL}

    # 1. Publish brief
    pub_res = client.post(
        "/api/v1/briefs",
        json={
            "title": "Autonomous Coding Agents Survey",
            "summary": "Original summary v1",
            "content_markdown": "# Original markdown v1",
            "category": "AI",
            "visibility": "public",
            "claims": [
                {
                    "statement": "Coding agents improve task throughput by 30%.",
                    "status": "verified",
                    "evidence_summary": "Empirical benchmark study",
                }
            ],
        },
        headers=service_headers,
    )
    assert pub_res.status_code == 201
    brief_id = pub_res.json()["id"]

    # 2. Update brief as admin
    update_res = client.patch(
        f"/api/v1/briefs/{brief_id}",
        json={
            "title": "Autonomous Coding Agents Survey (2026 Edition)",
            "summary": "Revised summary v2",
            "content_markdown": "# Revised markdown v2",
        },
        headers=admin_headers,
    )
    assert update_res.status_code == 200
    assert update_res.json()["title"] == "Autonomous Coding Agents Survey (2026 Edition)"

    # 3. Retrieve revisions
    rev_res = client.get(f"/api/v1/briefs/{brief_id}/revisions", headers=admin_headers)
    assert rev_res.status_code == 200
    revisions = rev_res.json()
    assert len(revisions) == 1
    assert revisions[0]["title"] == "Autonomous Coding Agents Survey"
    assert revisions[0]["summary"] == "Original summary v1"
    assert revisions[0]["content_markdown"] == "# Original markdown v1"
    assert len(revisions[0]["claims_snapshot"]) == 1
    assert (
        revisions[0]["claims_snapshot"][0]["statement"]
        == "Coding agents improve task throughput by 30%."
    )


def test_idempotent_schema_migration(settings):
    from bugle.db import Database

    # 1. First initialization
    db1 = Database(settings)
    with db1.session() as session:
        conn = session.connection()
        version1 = conn.exec_driver_sql(
            "SELECT value FROM schema_meta WHERE key = 'schema_version'"
        ).scalar()
        assert version1 == "1"

    # 2. Re-run migration / boot second instance on same database
    db2 = Database(settings)
    with db2.session() as session:
        conn = session.connection()
        version2 = conn.exec_driver_sql(
            "SELECT value FROM schema_meta WHERE key = 'schema_version'"
        ).scalar()
        assert version2 == "1"
        # Confirm indexes exist without error
        index_names = {
            row[1]
            for row in conn.exec_driver_sql(
                "SELECT type, name FROM sqlite_master WHERE type = 'index'"
            ).fetchall()
        }
        assert "ix_briefs_visibility_published_at" in index_names
        assert "ix_briefs_published_at" in index_names
        assert "ix_sources_brief_id" in index_names
        assert "ix_claims_brief_id" in index_names
