"""Hermes Integration Simulation Test.

Simulates the end-to-end agentic workflow:
Telegram -> Hermes -> Bugle API (Jobs -> Investigation -> Briefs with ClaimSource mapping -> Idempotent Retries)
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from bugle.app import create_app
from bugle.config import Settings

SERVICE_TOKEN = "hermes_live_token_456"
ADMIN_EMAIL = "gaurav.singh.86@gmail.com"


@pytest.fixture()
def client(tmp_path):
    settings = Settings(
        data_dir=str(tmp_path),
        static_dir=str(tmp_path / "dist"),
        service_token=SERVICE_TOKEN,
        admin_email=ADMIN_EMAIL,
        public_enabled=False,
    )
    app = create_app(settings)
    return TestClient(app)


def test_hermes_end_to_end_investigation_lifecycle(client):
    service_headers = {"Authorization": f"Bearer {SERVICE_TOKEN}"}
    admin_headers = {"Cf-Access-Authenticated-User-Email": ADMIN_EMAIL}

    # Step 1: Hermes receives Telegram trigger and initializes Research Job
    started_at = datetime.now(UTC)
    r_job = client.post(
        "/api/v1/jobs",
        json={
            "topic": "DeepSeek R1 Architecture & Training Innovations",
            "research_type": "research_paper",
            "research_depth": "deep",
            "execution_meta": {
                "source": "telegram",
                "requester": "gauravs",
                "hermes_run_id": "run_987123",
            },
        },
        headers=service_headers,
    )
    assert r_job.status_code == 201
    job_id = r_job.json()["id"]

    # Step 2: Hermes marks job running
    r_running = client.patch(
        f"/api/v1/jobs/{job_id}",
        json={
            "status": "running",
            "execution_meta": {"progress": "crawling_primary_sources"},
        },
        headers=service_headers,
    )
    assert r_running.status_code == 200
    assert r_running.json()["status"] == "running"

    # Step 3: Hermes synthesizes brief with structured sources & claims
    completed_at = datetime.now(UTC)
    brief_payload = {
        "job_id": job_id,
        "title": "DeepSeek R1 Architecture & Training Innovations",
        "summary": "Technical review of GRPO-driven reasoning without supervised warmup.",
        "content_markdown": """# DeepSeek R1 Technical Report

## 1. Key Innovations
- **Group Relative Policy Optimization (GRPO)**: Replaces the critic model in PPO with empirical group baselines.
- **R1-Zero Cold Start**: Disproves the necessity of human SFT warm-up for reasoning.

## 2. Contradiction Analysis
Initial commentary claimed standard SFT was used; ablation analysis disproves this for R1-Zero.
""",
        "category": "Technology",
        "subcategory": "Artificial Intelligence",
        "tags": ["deepseek", "grpo", "reasoning", "open-weights"],
        "confidence": "high",
        "visibility": "private",
        "research_type": "research_paper",
        "research_depth": "deep",
        "research_started_at": started_at.isoformat(),
        "research_completed_at": completed_at.isoformat(),
        "sources": [
            {
                "temp_id": "src_arxiv",
                "title": "DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning",
                "url": "https://arxiv.org/abs/2501.12948",
                "publisher": "arXiv",
                "author": "DeepSeek-AI Team",
                "source_type": "paper",
                "reliability": "primary",
                "published_at": "2025-01-22T00:00:00Z",
                "relevance": "Official research paper containing mathematical formulations and empirical ablations.",
            },
            {
                "temp_id": "src_github",
                "title": "deepseek-ai/DeepSeek-R1 GitHub Repository",
                "url": "https://github.com/deepseek-ai/DeepSeek-R1",
                "publisher": "GitHub",
                "author": "DeepSeek-AI",
                "source_type": "github",
                "reliability": "primary",
                "published_at": "2025-01-22T00:00:00Z",
                "relevance": "Open-weight model checkpoints and evaluation code.",
            },
        ],
        "claims": [
            {
                "statement": "Large-scale pure RL yields emergent reasoning behaviors without prior SFT warm-up.",
                "status": "verified",
                "evidence_summary": "Empirically validated through DeepSeek-R1-Zero benchmark evaluations on AIME and MATH.",
                "source_temp_ids": ["src_arxiv"],
            },
            {
                "statement": "GRPO eliminates the memory overhead of training a critic network.",
                "status": "verified",
                "evidence_summary": "Documented in Section 2.2; critic model omitted and replaced by average reward of group outputs.",
                "source_temp_ids": ["src_arxiv", "src_github"],
            },
        ],
    }

    # Step 4: Hermes publishes research brief
    r_publish = client.post(
        "/api/v1/briefs",
        json=brief_payload,
        headers=service_headers,
    )
    assert r_publish.status_code == 201, r_publish.text
    brief = r_publish.json()
    brief_id = brief["id"]

    assert brief["title"] == "DeepSeek R1 Architecture & Training Innovations"
    assert brief["source_count"] == 2
    assert brief["claim_count"] == 2
    assert brief["confidence"] == "high"
    assert brief["research_depth"] == "deep"

    # Check claim-to-source mappings
    claims = brief["claims"]
    assert len(claims[0]["source_ids"]) == 1
    assert len(claims[1]["source_ids"]) == 2

    # Verify job status automatically updated to completed
    r_job_final = client.get(f"/api/v1/jobs/{job_id}", headers=service_headers)
    assert r_job_final.json()["status"] == "completed"

    # Step 5: Network retry simulation (Idempotency)
    r_retry = client.post(
        "/api/v1/briefs",
        json=brief_payload,
        headers=service_headers,
    )
    assert r_retry.status_code == 200
    assert r_retry.json()["id"] == brief_id

    # Step 6: Operator reads research brief via Cloudflare Access
    r_operator = client.get(
        f"/api/v1/briefs/{brief_id}",
        headers=admin_headers,
    )
    assert r_operator.status_code == 200
    read_brief = r_operator.json()
    assert "# DeepSeek R1 Technical Report" in read_brief["content_markdown"]
    assert len(read_brief["sources"]) == 2
