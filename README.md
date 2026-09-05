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
│  • Provenance Audit        • Reading-First Design System │
│  • PRAGMA Diagnostics      • Safe-Area iOS Mobile reader │
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
| **Backend** | Python 3.13 · FastAPI · SQLAlchemy 2.0 | Research API, schema enforcement, auth invariants, telemetry |
| **Storage** | SQLite (WAL mode) on disk | Local-first, durable zero-cloud relational store with PRAGMA optimization |
| **Frontend** | React 19 · Vite 6 · TypeScript | Reading-first research archive, modular pages & evidence viewer |
| **Design System** | Strict Badge Taxonomy + Inline Metadata | Unified 22px badges (Category, Status, Technical, Access), subdued metrics |
| **Markdown** | `react-markdown` · `remark-gfm` | Tables, code blocks, executive synthesis callouts, safe links |
| **Supervision**| macOS `launchd` daemon | Auto-starting local background daemon on Mac Mini (`com.personal.bugle`) |
| **Network** | Cloudflare Tunnel + Cloudflare Access | Zero-open-port ingress with SSO identity gating |

---

## Key Capabilities

### 1. Reading-First Editorial UI
The investigation card is the primary hero element. Badges and metadata support the content rather than competing with it:
- **Strict Badge Taxonomy**: Unified dimensions (`height: 22px`, `border-radius: 5px`, `padding: 0 8px`) across 4 semantic categories:
  - **Category**: Gold/amber accent (`#e3b341`) for topic domains (`Technology`, `AI`, `Markets`, `Security`).
  - **Status**: Green accent (`#3fb950`) with indicator dot for lifecycle states (`Latest Dispatch`, `High confidence`).
  - **Technical**: Neutral blue-gray (`#8b949e`) monospace typography for models (`deepseek-v4-flash`), depth (`standard`), and taxonomy.
  - **Access**: Neutral gray for Public; muted red/pink (`#f85149`) with lock icon for Private.
- **Inline Supporting Metadata**:
  - **Cost**: Quiet inline coin icon + USD amount + converted INR (e.g. `💰 $0.0049 (₹0.47)`). No oversized colored pills.
  - **Reading**: Subdued text with dot dividers (`1 min read · 5 hours ago`).
  - **Evidence**: Quiet supporting text (`3 sources · 3 claims`).
- **Anchored Detail View**: Sticky back bar docks flush at `top: 0` on desktop and mobile with notch safe-area padding (`var(--sat)`).

### 2. Multi-View Modular Frontend
Bugle organizes research into five dedicated, responsive views:
1. **Intelligence Feed (`#/`)**: Clean blog-style stream with featured lead investigation.
2. **Archive Search (`#/search`)**: Dedicated full-page search with frequency-capped topic chips, debounced search, and recent queries.
3. **Saved Bookmarks (`#/saved`)**: Quick-reference collection stored in browser `localStorage`.
4. **Research Archive (`#/archive`)**: Comprehensive catalogue filtered by topic taxonomy with spend metrics.
5. **Operator Profile (`#/profile`)**: Comprehensive system dashboard with responsive cards for operator identity, AI model engine, spend analytics, intelligence activity, and database diagnostics.

### 3. Database Engine & PRAGMA Discipline
Learnings from high-throughput local daemons:
- **Concurrency PRAGMAs**: `journal_mode=WAL`, `synchronous=NORMAL`, `busy_timeout=5000` (prevents locked errors), `cache_size=-64000` (64MB page cache), `temp_store=MEMORY`.
- **Index Discipline**: Multi-column index on `(visibility, published_at)`, plus indexes on `published_at`, `sources.brief_id`, `claims.brief_id`.
- **Self-Healing Startup**: Idempotent additive schema migration creating columns, indexes, and `schema_meta` version tracking on boot.
- **Diagnostic Telemetry**: `GET /api/v1/system/db-health` runs live `PRAGMA integrity_check`, `PRAGMA foreign_key_check`, measures file size on disk, and reports schema version.

### 4. SPA Cache Invariance
- `GET /{full_path:path}` serves `index.html` with `Cache-Control: no-cache, no-store, must-revalidate` so mobile browsers (iOS Safari, Android Chrome) never get stuck on stale bundles when new builds are deployed.
- Hashed assets in `/assets/` remain cache-friendly.

---

## Domain Model

- **`ResearchJob`**: An asynchronous investigation commissioned to Hermes (`pending` → `running` → `completed` | `failed`).
- **`Brief`**: The primary research synthesis with title, executive summary, full Markdown body, confidence rating, research depth, and provenance metrics.
- **`Source`**: Primary and secondary evidence documents cited in the brief (capturing publisher, URL, publication date, retrieval date, reliability, and relevance).
- **`Claim`**: Core assertions extracted from the investigation and verified (`verified`, `contradicted`, `unverified`).
- **`ClaimSource`**: Many-to-many association mapping linking each claim to supporting or contradicting sources.
- **`BriefRevision`**: Complete immutable snapshot of prior brief versions for auditing.

### Research Depth Targets
- **Fast**: ~3–5 sources. Official primary sources, quick verification, concise synthesis.
- **Standard**: ~5–10 sources. Primary + credible secondary, claim verification, contradiction checking.
- **Deep**: 10+ sources. Multiple primary sources, historical context, independent corroboration, full claim ↔ source mapping, explicit uncertainty analysis.

---

## Security & Authentication

Bugle enforces three distinct access classes:

1. **Hermes Agent (Machine Ingestion)**:
   - Authenticated via `Authorization: Bearer <BUGLE_SERVICE_TOKEN>`.
   - Authorized to commission jobs, update status, and idempotently publish briefs.
2. **Human Operator (Browser UI)**:
   - Fronted by Cloudflare Access SSO.
   - Evaluates `Cf-Access-Authenticated-User-Email` against `BUGLE_ADMIN_EMAIL`.
   - Grants full access to private and public briefs, tag filtering, visibility toggles, and deletion.
   - Zero API tokens stored in browser `localStorage`.
3. **Anonymous Public**:
   - Strictly restricted on the database query level to `visibility == "public"`.
   - Never exposes private briefs regardless of query parameters.
   - Disabled by default in Phase 1 (`BUGLE_PUBLIC_ENABLED=false`).

---

## Repository Layout

```
bugle/
├── docs/                         # Architecture, learnings & Apple Shortcuts setup
│   ├── APPLE_SHORTCUTS_SETUP.md  # iOS action extension & Siri triggers
│   ├── ARCHITECTURE_AND_MIGRATION_PLAN.md # Deep technical specification & contracts
│   └── learnings.md              # Database & architecture learnings from MyMonee
├── src/bugle/                    # FastAPI backend: models, schemas, endpoints
│   ├── app.py                    # REST API, auth dependency injection & SPA routing
│   ├── config.py                 # Settings & environment configuration
│   ├── db.py                     # SQLAlchemy models & SQLite engine configuration
│   ├── db_migrate.py             # SQLite backup & automated schema migration utility
│   └── schemas.py                # Pydantic request/response validation schemas
├── web/                          # React 19 + Vite 6 frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── Badge.tsx         # Unified Badge taxonomy & inline metadata system
│   │   │   ├── BriefCard.tsx     # Reading-first investigation card
│   │   │   ├── Icons.tsx         # Optical SVG icons
│   │   │   ├── RevisionsDrawer.tsx # Historical revision audit drawer
│   │   │   └── SystemHealthModal.tsx # Real-time SQLite PRAGMA health modal
│   │   ├── pages/
│   │   │   ├── FeedPage.tsx      # Main intelligence feed
│   │   │   ├── SearchPage.tsx    # Dedicated search tab
│   │   │   ├── SavedPage.tsx     # Saved bookmarks list
│   │   │   ├── ArchivePage.tsx   # Topic catalogue & spend metrics
│   │   │   ├── ProfilePage.tsx   # Operator profile & system diagnostics
│   │   │   └── BriefDetailPage.tsx # Editorial detail reading view
│   │   ├── api.ts                # Type-safe API client
│   │   ├── format.ts             # Currency, relative time & model formatters
│   │   ├── App.tsx               # Root shell & navigation controller
│   │   └── style.css             # Comprehensive design system stylesheet
├── scripts/
│   ├── run_server.sh             # Launchd daemon process entrypoint
│   ├── install_launchd.sh        # Provisions ~/Library/LaunchAgents/com.personal.bugle.plist
│   └── trigger_deploy.sh         # Deploy script with backup, build, migration & healthcheck
├── tests/                        # Automated pytest suite (Jobs, Auth, Idempotency, Cache)
└── data/                         # Durable SQLite database (WAL) & timestamped backups
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

Mirrors the production single-tenant deployment pattern:
- Daemon listens exclusively on localhost (`127.0.0.1:8480`).
- Cloudflare Tunnel connects origin loopback to `bugle.gauravs-apps.in`.
- Cloudflare Access enforces authentication before traffic ever touches the local network.
- Deployments are executed via `scripts/trigger_deploy.sh`.

---

## Documentation

- **[Frontend Design System & UI/UX Guidelines](FRONTEND.md)**: Reading-first approach, badge taxonomy, typography tokens, mobile safe-area patterns.
- **[Architecture & Migration Plan](docs/ARCHITECTURE_AND_MIGRATION_PLAN.md)**: Detailed technical specification, relational schema, and API contracts.
- **[Learnings & Best Practices](docs/learnings.md)**: SQLite PRAGMAs, index discipline, and performance insights.
- **[Apple Shortcuts Setup](docs/APPLE_SHORTCUTS_SETUP.md)**: Configuration guide for iOS action extension and voice triggers.