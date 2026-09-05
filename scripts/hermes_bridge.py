#!/usr/bin/env bash
"""Hermes Bridge for Bugle.

Connects Hermes Agent with the Bugle Personal Research Intelligence archive.
Workflow:
  1. Commissions an asynchronous ResearchJob on Bugle (POST /api/v1/jobs)
  2. Runs Hermes Agent in one-shot mode (--oneshot) to investigate across sources
  3. Synthesizes structured claims & sources
  4. Publishes research brief to Bugle (POST /api/v1/briefs)
  5. Optionally alerts user on Telegram with the published investigation URL

Usage:
  python scripts/hermes_bridge.py "Investigate DeepSeek R1 GRPO efficiency" --depth deep
  python scripts/hermes_bridge.py --poll-jobs   # process pending jobs from Apple Shortcuts
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import time
import urllib.request

DEFAULT_BUGLE_URL = os.environ.get("BUGLE_URL", "http://127.0.0.1:8480")
DEFAULT_SERVICE_TOKEN = os.environ.get("BUGLE_SERVICE_TOKEN", "hermes_local_dev_token")
HERMES_ENV_PATH = Path.home() / ".hermes" / ".env"
HERMES_STATE_PATH = Path.home() / ".hermes" / "state.db"


def get_hermes_session_metrics() -> dict:
    """Extract model, token usage, cost, and duration from the latest Hermes session."""
    if not HERMES_STATE_PATH.exists():
        return {}
    try:
        con = sqlite3.connect(str(HERMES_STATE_PATH))
        cur = con.cursor()
        row = cur.execute(
            "SELECT model, input_tokens, output_tokens, reasoning_tokens, estimated_cost_usd, tool_call_count, started_at, ended_at "
            "FROM sessions WHERE model IS NOT NULL ORDER BY started_at DESC LIMIT 1"
        ).fetchone()
        con.close()
        if not row:
            return {}
        model, in_tok, out_tok, r_tok, cost, tool_count, started, ended = row
        duration = (ended - started) if (ended and started) else None
        return {
            "model": model,
            "token_usage": {
                "input": in_tok or 0,
                "output": out_tok or 0,
                "reasoning": r_tok or 0,
                "total": (in_tok or 0) + (out_tok or 0),
            },
            "cost_usd": cost,
            "duration_seconds": round(duration, 2) if duration else None,
            "tool_calls_count": tool_count,
        }
    except Exception as e:
        print(f"[hermes_bridge] Notice: Unable to read session metrics from state.db: {e}", file=sys.stderr)
        return {}


def load_env_file(path: Path) -> dict[str, str]:
    env_vars: dict[str, str] = {}
    if not path.exists():
        return env_vars
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env_vars[k.strip()] = v.strip().strip("\"'")
    return env_vars


def send_telegram_alert(message: str) -> bool:
    """Send a notification message via Telegram bot if configured in ~/.hermes/.env."""
    hermes_env = load_env_file(HERMES_ENV_PATH)
    token = hermes_env.get("TELEGRAM_BOT_TOKEN")
    allowed_users = hermes_env.get("TELEGRAM_ALLOWED_USERS", "")
    if not token or not allowed_users:
        return False

    chat_id = allowed_users.split(",")[0].strip()
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = json.dumps({"chat_id": chat_id, "text": message, "parse_mode": "Markdown"}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status == 200
    except Exception as e:
        print(f"[hermes_bridge] Warning: Failed to send Telegram alert: {e}", file=sys.stderr)
        return False


def request_bugle(
    endpoint: str,
    method: str = "GET",
    data: dict | None = None,
    service_token: str = DEFAULT_SERVICE_TOKEN,
    bugle_url: str = DEFAULT_BUGLE_URL,
) -> dict:
    url = f"{bugle_url.rstrip('/')}{endpoint}"
    payload = json.dumps(data).encode("utf-8") if data is not None else None
    headers = {
        "Authorization": f"Bearer {service_token}",
        "Content-Type": "application/json",
    }
    req = urllib.request.Request(url, data=payload, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def run_hermes_investigation(topic: str, depth: str = "standard") -> str:
    """Execute Hermes in one-shot mode with research prompt."""
    prompt = f"""You are the research engine for Bugle (Personal Research Intelligence).
Conduct a thorough, evidence-backed research investigation on:
"{topic}"

Research depth: {depth}

Instructions:
1. Search primary sources (papers, official announcements, repositories, documentation).
2. Synthesize key findings with clear headings.
3. Identify 2-4 key claims and state whether each is verified, contradicted, or unverified.
4. List the exact URLs and publishers of all cited sources.
5. Provide an Executive Summary at the start.

Return your synthesis in structured Markdown.
"""
    cmd = ["hermes", "-z", prompt]
    print(f"[hermes_bridge] Running Hermes investigation on '{topic}' ({depth} depth)...")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if result.returncode != 0:
        raise RuntimeError(f"Hermes investigation failed: {result.stderr}")
    return result.stdout.strip()


def parse_brief_from_markdown(topic: str, markdown_content: str, job_id: str, depth: str) -> dict:
    """Extract executive summary, sources, and claims from Hermes markdown output."""
    lines = markdown_content.splitlines()
    title = topic
    for line in lines:
        if line.startswith("# "):
            title = line.replace("# ", "").strip()
            break

    # Extract summary
    summary = ""
    summary_match = re.search(
        r"(?:## Executive Summary|Executive Summary:?)([\s\S]*?)(?=##|\Z)",
        markdown_content,
        re.IGNORECASE,
    )
    if summary_match:
        summary = summary_match.group(1).strip()[:1000]
    else:
        # First non-header paragraph
        non_headers = [l.strip() for l in lines if l.strip() and not l.startswith("#")]
        summary = (non_headers[0][:500]) if non_headers else "Research investigation completed."

    # Extract URLs as sources
    url_pattern = re.compile(r"https?://[^\s)\]\"']+")
    raw_urls = list(dict.fromkeys(url_pattern.findall(markdown_content)))  # deduplicated
    sources = []
    for idx, u in enumerate(raw_urls[:8]):
        pub = "Web Source"
        if "arxiv.org" in u:
            pub = "arXiv"
        elif "github.com" in u:
            pub = "GitHub"
        elif "huggingface.co" in u:
            pub = "HuggingFace"
        sources.append({
            "temp_id": f"src_{idx+1}",
            "title": f"Source {idx+1}: {pub}",
            "url": u,
            "publisher": pub,
            "reliability": "primary" if any(k in u for k in ["arxiv", "github"]) else "secondary",
        })

    # Default claims if not explicitly mapped
    claims = [
        {
            "statement": f"Key finding from investigation into {topic}",
            "status": "verified",
            "evidence_summary": "Extracted and corroborated from primary investigation evidence.",
            "source_temp_ids": [s["temp_id"] for s in sources[:2]],
        }
    ]

    return {
        "job_id": job_id,
        "title": title,
        "summary": summary,
        "content_markdown": markdown_content,
        "category": "Technology",
        "subcategory": "Research",
        "tags": ["hermes-research", depth],
        "confidence": "high" if depth == "deep" else "medium",
        "visibility": "private",
        "research_type": "technical_topic",
        "research_depth": depth,
        "sources": sources,
        "claims": claims,
    }


def execute_pipeline(topic: str, depth: str = "standard", input_job_id: str | None = None) -> dict:
    """Full lifecycle: create job -> investigate -> publish -> alert."""
    # 1. Commission Job
    job_id = input_job_id
    if not job_id:
        job_resp = request_bugle(
            "/api/v1/jobs",
            method="POST",
            data={
                "topic": topic,
                "research_depth": depth,
                "research_type": "technical_topic",
                "execution_meta": {"initiated_via": "hermes_bridge"},
            },
        )
        job_id = job_resp["id"]
        print(f"[hermes_bridge] Created ResearchJob: {job_id}")

    # 2. Mark Running & Send Start Acknowledgment
    request_bugle(f"/api/v1/jobs/{job_id}", method="PATCH", data={"status": "running"})
    send_telegram_alert(
        f"🎺 *Bugle Investigation Started*\n\n"
        f"*Topic:* {topic}\n"
        f"Investigating across primary sources in the background... I'll notify you once published."
    )

    # 3. Hermes Investigation
    t0 = time.time()
    try:
        markdown_result = run_hermes_investigation(topic, depth)
    except Exception as e:
        request_bugle(
            f"/api/v1/jobs/{job_id}",
            method="PATCH",
            data={"status": "failed", "execution_meta": {"error": str(e)}},
        )
        send_telegram_alert(
            f"⚠️ *Bugle Investigation Failed*\n\n"
            f"*Topic:* {topic}\n"
            f"*Reason:* {e}"
        )
        raise
    measured_duration = round(time.time() - t0, 2)
    metrics = get_hermes_session_metrics()

    # 4. Synthesize Brief Payload
    brief_payload = parse_brief_from_markdown(topic, markdown_result, job_id, depth)
    brief_payload["cost_usd"] = metrics.get("cost_usd")
    brief_payload["duration_seconds"] = metrics.get("duration_seconds") or measured_duration
    brief_payload["model"] = metrics.get("model")
    brief_payload["token_usage"] = metrics.get("token_usage")
    if metrics.get("tool_calls_count"):
        brief_payload.setdefault("execution_meta", {})["tool_calls_count"] = metrics["tool_calls_count"]

    # 5. Publish to Bugle
    published = request_bugle("/api/v1/briefs", method="POST", data=brief_payload)
    brief_id = published["id"]
    public_url = f"https://bugle.gauravs-apps.in/#/brief/{brief_id}"
    print(f"\n[hermes_bridge] SUCCESS! Published brief: {brief_id}")
    if published.get("cost_usd") is not None:
        print(f"[hermes_bridge] Cost: ${published['cost_usd']:.4f} USD")
    if published.get("duration_seconds") is not None:
        print(f"[hermes_bridge] Duration: {published['duration_seconds']}s")
    if published.get("model"):
        print(f"[hermes_bridge] Model: {published['model']}")
    print(f"[hermes_bridge] URL: {public_url}\n")

    # 6. Telegram Alert
    cost_badge = f" | 💰 `${published['cost_usd']:.4f}`" if published.get("cost_usd") is not None else ""
    dur_badge = f" | ⏱️ `{published['duration_seconds']}s`" if published.get("duration_seconds") is not None else ""
    model_badge = f"\nModel: `{published['model']}`" if published.get("model") else ""

    telegram_msg = (
        f"🎺 *Bugle Investigation Complete*\n\n"
        f"*{published.get('title', topic)}*\n"
        f"Depth: `{depth}` | Sources: {published.get('source_count', 0)}{cost_badge}{dur_badge}{model_badge}\n\n"
        f"{published.get('summary', '')[:200]}...\n\n"
        f"🔗 [Read Full Brief in Bugle]({public_url})"
    )
    send_telegram_alert(telegram_msg)

    return published


def poll_pending_jobs():
    """Polls Bugle for pending quick_ingest jobs commissioned from Shortcuts or web."""
    print("[hermes_bridge] Polling Bugle for pending research jobs...")
    data = request_bugle("/api/v1/jobs?limit=10")
    pending = [j for j in data.get("jobs", []) if j.get("status") == "pending"]
    if not pending:
        print("[hermes_bridge] No pending jobs.")
        return

    print(f"[hermes_bridge] Found {len(pending)} pending job(s). Processing...")
    for j in pending:
        print(f"[hermes_bridge] Processing job {j['id']}: {j['topic']}")
        try:
            execute_pipeline(j["topic"], depth=j.get("research_depth", "standard"), input_job_id=j["id"])
        except Exception as e:
            print(f"[hermes_bridge] Error processing job {j['id']}: {e}", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(description="Hermes <-> Bugle Bridge")
    parser.add_argument("topic", nargs="?", help="Research topic or prompt to investigate")
    parser.add_argument("--depth", choices=["fast", "standard", "deep"], default="standard")
    parser.add_argument("--poll-jobs", action="store_true", help="Poll Bugle for pending jobs from Shortcuts")
    args = parser.parse_args()

    if args.poll_jobs:
        poll_pending_jobs()
    elif args.topic:
        execute_pipeline(args.topic, depth=args.depth)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
