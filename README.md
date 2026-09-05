# 🎺 Bugle
*Personal Research Intelligence Platform*

> **"Hermes investigates. Bugle publishes and remembers."**

Bugle turns interesting signals into durable, evidence-backed research. When you encounter an interesting development—a product launch, company announcement, research paper, GitHub repository, technical claim, or media story—Hermes investigates across multiple sources, verifies assertions against primary evidence, identifies contradictions, and publishes a structured research brief to Bugle.

Bugle is the durable archive, indexing, and presentation layer.

```
                         ┌───────────────┐
                         │   TELEGRAM    │  (Incoming signal / topic of interest)
                         └───────┬───────┘
                                 │
                                 ▼
                         ┌───────────────┐
                         │    HERMES     │
                         │               │
                         │ Interpretation│
                         │ Research      │
                         │ Verification  │
                         │ Synthesis     │
                         └───────┬───────┘
                                 │
               ┌─────────────────┴─────────────────┐
               │                                   │
     1. POST /api/v1/jobs                2. POST /api/v1/briefs
        (Async Job Init)                    (Idempotent Publication)
               │                                   │
               │    Bearer BUGLE_SERVICE_TOKEN     │
               ▼                                   ▼
┌──────────────────────────────────────────────────────────┐
│                          BUGLE                           │
│        FastAPI · SQLite (WAL) · React 19 (launchd)       │
│                                                          │
│  • Jobs Lifecycle          • Claim ↔ Source Evidence Map │
│  • Briefs Archive          • Research Taxonomies         │
│  • Provenance Audit        • Safe Markdown Rendering     │
└────────────────────────────┬─────────────────────────────┘
                             │
              Strict Invariant: Origin binds to
                   127.0.0.1:<port> ONLY.
              Never exposed directly to Internet.
                             │
                             ▼
               ┌───────────────────────────┐
               │     CLOUDFLARE TUNNEL     │
               └─────────────┬─────────────┘
                             │
                             ▼
               ┌───────────────────────────┐
               │     CLOUDFLARE ACCESS     │
               │  (bugle.gauravs-apps.in)  │
               └─────────────┬─────────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
    ┌───────────────────┐         ┌───────────────────┐
    │  HUMAN OPERATOR   │         │ ANONYMOUS PUBLIC  │
    │ Cloudflare Access │         │ Public Briefs Only│
    │  Identity Header  │         │ (or 403 in P1)    │
    └───────────────────┘         └───────────────────┘
```

---

## Stack

| Layer | Tech | Purpose |
| :--- | :--- | :--- |
| **Backend** | Python 3.13 · FastAPI · SQLAlchemy | Research API, schema enforcement, auth invariants |
| **Storage** | SQLite (WAL mode) on disk | Local-first, durable zero-cloud relational store |
| **Frontend** | React 19 · Vite 6 · TypeScript | Reading-focused research archive & evidence viewer |
| **Markdown** | `react-markdown` · `remark-gfm` | Tables, code blocks, claims callouts, safe links |
| **Supervision**| macOS `launchd` daemon | Auto-starting local background daemon on Mac Mini |
| **Network** | Cloudflare Tunnel + Cloudflare Access | Zero-open-port ingress with SSO identity gating |

---

## Domain Model

- **`ResearchJob`**: An asynchronous investigation commissioned to Hermes (`pending` → `running` → `completed` | `failed`).
- **`Brief`**: The primary research synthesis with title, executive summary, full Markdown body, confidence rating, research depth, and provenance metrics.
- **`Source`**: Primary and secondary evidence documents cited in the brief (capturing publisher, URL, publication date, retrieval date, reliability, and relevance).
- **`Claim`**: Core assertions extracted from the investigation and verified (`verified`, `contradicted`, `unverified`).
- **`ClaimSource`**: Many-to-many association mapping linking each claim to supporting or contradicting sources.

### Research Depth Targets
- **Fast**: ~3–5 sources. Official primary sources, quick verification, concise synthesis.
- **Standard**: ~5–10 sources. Primary + credible secondary, claim verification, contradiction checking.
- **Deep**: 10+ sources. Multiple primary sources, historical context, independent corroboration, full claim ↔ source mapping, explicit uncertainty analysis.

---

## Security & Authentication

Bugle enforces three distinct access classes:

1. **Hermes Agent (Machine Ingestion)**:
   - Authenticated via `Authorization: Bearer <BUGLE_SERVICE_TOKEN>`.
   - Authorized to commission jobs and idempotently publish briefs.
2. **Human Operator (Browser UI)**:
   - Fronted by Cloudflare Access.
   - Evaluates `Cf-Access-Authenticated-User-Email` against `BUGLE_ADMIN_EMAIL`.
   - Grants full access to private and public briefs, tag filtering, and deletion.
   - Zero API tokens stored in browser `localStorage`.
3. **Anonymous Public**:
   - Strictly restricted on the database query level to `visibility == "public"`.
   - Never exposes private briefs regardless of query parameters.
   - Disabled by default in Phase 1 (`BUGLE_PUBLIC_ENABLED=false`).

---

## Layout

```
bugle/
├── docs/                 # Architecture & migration specifications
├── src/bugle/            # FastAPI app: models, schemas, endpoints, migration
│   ├── app.py            # API routes & auth dependency injection
│   ├── config.py         # Settings & environment variables
│   ├── db.py             # SQLAlchemy models (Jobs, Briefs, Sources, Claims)
│   ├── db_migrate.py     # SQLite backup & schema migration utility
│   └── schemas.py        # Pydantic request/response schemas
├── web/                  # React 19 + Vite 6 frontend
│   ├── src/App.tsx       # Research archive feed & detail document view
│   └── src/style.css     # Clean monospace-accented typography & styling
├── scripts/
│   ├── run_server.sh     # Launchd daemon process entrypoint
│   ├── install_launchd.sh# Provisions ~/Library/LaunchAgents/com.personal.bugle.plist
│   └── trigger_deploy.sh # Hardened deploy script with backup, migration & health check
├── tests/                # Automated pytest suite (Jobs, Auth, Idempotency, Invariants)
└── data/                 # Durable SQLite database (WAL) & timestamped backups
```

---

## Run Locally

```bash
# Backend setup & tests
python3.13 -m venv .venv
./.venv/bin/pip install -e ".[dev]"
./.venv/bin/pytest -q

# Run database migrations
./.venv/bin/python -m bugle.db_migrate

# Start backend server (:8480)
./.venv/bin/python -m bugle

# Start frontend dev server (:5180, proxies /api -> :8480)
cd web && npm install && npm run dev

# Or build frontend for production static serving
cd web && npm ci && npm run build
```

---

## Run as a macOS Daemon

```bash
# Install and register launchd service
scripts/install_launchd.sh

# Restart or kickstart service
launchctl kickstart -k "gui/$(id -u)/com.personal.bugle"

# Inspect daemon output logs
tail -f ~/Library/Logs/bugle/stdout.log
tail -f ~/Library/Logs/bugle/stderr.log
```

---

## Deployment Target

Mirrors the MyMonee deployment pattern:
- Daemon listens exclusively on localhost (`127.0.0.1:8480`).
- Cloudflare Tunnel connects origin loopback to `bugle.gauravs-apps.in`.
- Cloudflare Access enforces authentication before traffic ever touches the local network.
- Deployments are executed via `scripts/trigger_deploy.sh`.