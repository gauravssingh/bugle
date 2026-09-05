# Bugle — Learnings from MyMonee

> Everything worth copying from `my-monee` (FastAPI · SQLite WAL · SQLAlchemy 2.0 · React + Vite)
> into Bugle's identical stack. Source references point into `~/projects/my-monee` so you can
> open the exact file when implementing.

Every section ends with **→ Bugle** notes that are actionable for the current Bugle codebase
(`src/bugle/`, `web/src/`).

---

## 1. Database Optimizations (SQLite + SQLAlchemy)

### 1.1 SQLite PRAGMAs — set all of them, once, on every connection

MyMonee registers an `@event.listens_for(engine, "connect")` that runs on **every** new
connection (`src/mymonee/db/session.py`):

```python
cursor.execute("PRAGMA foreign_keys=ON")
cursor.execute("PRAGMA journal_mode=WAL")
cursor.execute("PRAGMA synchronous=NORMAL")
cursor.execute("PRAGMA busy_timeout=5000")
cursor.execute("PRAGMA cache_size=-64000")     # 64MB page cache (negative = KiB)
cursor.execute("PRAGMA mmap_size=268435456")   # 256MB mmap
cursor.execute("PRAGMA temp_store=MEMORY")
```

Why each one matters for a local daemon that reads while a background writer (scheduler/ingestion)
writes:

| PRAGMA | Purpose |
| :--- | :--- |
| `journal_mode=WAL` | Readers never block the writer; crash-safe. |
| `synchronous=NORMAL` | WAL checkpoint frequency tuned for a local single-user app — much faster commits than FULL, still durable enough on macOS. |
| `busy_timeout=5000` | Turns `database is locked` errors into retries. **Critical** if Bugle ever has concurrent writers (Hermes publish + UI ops). |
| `cache_size=-64000` | Bigger page cache = dramatically faster range scans (your brief list / taxonomies). |
| `mmap_size` | Lets SQLite memory-map the DB on 64-bit macOS. |
| `temp_store=MEMORY` | Temp sorts (ORDER BY on large sets) stay in RAM. |

**→ Bugle**: `src/bugle/db.py::_build_engine` currently sets only `journal_mode=WAL` and
`foreign_keys=ON`. Add the rest — especially `busy_timeout` and `cache_size`. Also switch to
`create_engine(..., future=True)` and add `connect_args={"check_same_thread": False}` if you keep it.

### 1.2 Indexes — Bugle's single biggest gap

MyMonee has **two** layers of index discipline:

1. **Model-level `Index(...)` inside `__table_args__`** for every FK join path and every
   filterable/sortable column (`src/mymonee/db/models.py`). Examples:
   - `transactions`: `transaction_date`, `category_id`, `merchant_entity_id`, `needs_review`,
     `source_email_id`, composite `(source, source_email_id, reference_number)`, plus a
     `UniqueConstraint(source, fingerprint)` for idempotent ingestion.
   - `data_issue_flags`: composite `(transaction_id, status)` so group-by-status queries are O(index).
   - Every to-many child has an index on its parent FK (`merchant_aliases.merchant_id`,
     `ingestion_events.run_id`, `statement_transactions.statement_id`, …).
2. **On-startup additive migration** `_migrate_indexes` (`db/session.py`) that re-runs
   `CREATE INDEX IF NOT EXISTS ...` for indexes added after the schema was first created —
   so deployed databases get new indexes without a destructive migration.

Indexes added when a query starts feeling slow (async) versus at schema time (sync) is the
difference between a snappy local app and a daemon that pegs CPU on every list page.
Also note: `PRAGMA optimize` is run at startup after migrations to let SQLite rebuild
query-plan stats.

**→ Bugle**: `src/bugle/db.py` has **zero indexes** today. With `briefs.*ilike('%term%')` search,
`order_by(published_at desc)`, and `visibility` filtering, add at minimum:
- `Brief.published_at` (feed order) — likely a composite `(visibility, published_at)` since every
  anonymous query filters visibility first.
- `Brief.job_id` (already UNIQUE — good, UNIQUE implies index).
- FK indexes: `Source.brief_id`, `Claim.brief_id`, `claim_sources.claim_id/source_id` (SQLite does
  **not** auto-index FKs unless `PRAGMA foreign_keys` creates them — it doesn't for indexes).
- `ResearchJob.status` if you ever filter the jobs page by status.
Follow the `_migrate_indexes` pattern so you can add indexes without touching prod.

### 1.3 Column design: money as Numeric, blobs as deferred, extensibility via JSON

- **Money is never `Float`.** Every amount is `Numeric(18, 4)` in the model and converted to float
  only at the API boundary (`_as_float` in `services/transactions.py`, `services/dashboard.py`).
  This kills floating-point drift in sums. (`cost_usd` in Bugle is `Float` — fine for
  telemetry-shaped numbers, but any amount that will be summed/charted should be `Numeric`.)
- **Deferred (lazy) TEXT columns.** `Email.body_text` / `body_html` are
  `mapped_column(Text, deferred=True)` (`db/models.py`), so list queries never drag multi-KB HTML
  bodies across the wire or into memory. SQLAlchemy emits a second SELECT only when the attribute
  is touched.
  **→ Bugle**: `Brief.content_markdown` and `Source.relevance` are big `Text` columns loaded on
  every list query. Either `deferred=True` them, or (better) never select them in the list
  endpoint (see §2.2 list/detail split).
- **JSON columns for schema evolution.** `extra_json`, `metadata_json`, `match_json`,
  `classification_signals` etc. absorb new features without ALTER TABLE. Bugle already does this
  well (`execution_meta`, `token_usage`, `tags`).
- **Denormalize hot read aggregates.** `DataIssueFlag` stores `source`/`merchant_normalized` copies
  at write time so the group-by-triage screen needs zero joins. `IngestionRun` stores every counter
  (`emails_processed`, `transactions_extracted`, …) so the runs table is a dashboard without
  recomputation. **→ Bugle**: you already denormalize `source_count`/`claim_count` onto `Brief`
  (good). Extend that habit: counts shown on list rows should be columns, not `COUNT(*)` joins.

### 1.4 Idempotency & fingerprints — the "already got it" guarantee

- Every transaction gets a `fingerprint = sha256(source_email_id|amount|direction|date|merchant|ref)`
  (`ingestion/fingerprint.py`) with `UniqueConstraint(source, fingerprint)` in the model. The
  pipeline does `SELECT by fingerprint → update-in-place or insert` (`ingestion/pipeline.py`).
  Re-syncing the same email 10× produces the same row.
- Idempotent writes are paired with **explainable matching**: dedupe engine
  (`services/deduplication.py`) records `TransactionLink(kind, confidence, notes)` so every
  pairing is auditable, and refund/transfer pairing is idempotent by first checking
  `existing_links` before creating new ones (`services/reconciliation.py`).

**→ Bugle**: `POST /api/v1/briefs` idempotency via `job_id UNIQUE` + return-existing (HTTP 200) is
already a MyMonee-grade pattern — keep it. If you add ingestion of external content (RSS, PDFs,
GitHub events), add a content fingerprint + `UniqueConstraint(origin, fingerprint)` exactly like
this so re-delivery is free.

### 1.5 Additive migrations & schema versioning

MyMonee runs three steps at startup (`db/session.py::init_db`):
1. `Base.metadata.create_all()` for new installs.
2. `_migrate_columns`: `PRAGMA table_info(...)` → `ALTER TABLE ADD COLUMN` for known gaps
   (additive only — never destructive).
3. `_migrate_indexes`: `CREATE INDEX IF NOT EXISTS`.
4. A `schema_meta` key-value table records `schema_version` for future real migrations
   (Alembic-level tooling remains optional).

**→ Bugle**: `src/bugle/db.py::_auto_migrate_schema` already mirrors this. Add the missing pieces:
write a `schema_meta` version row, and make the migration runner re-entrant/tested — the current
`if not col: ALTER` pattern is safe but there is no test proving a second boot is a no-op.

### 1.6 Aggregate in SQL, never in Python

MyMonee's `services/dashboard.py` and `services/transactions.py` always push aggregation into
SQLite: `func.sum`, `func.count`, `func.coalesce`, `case(...)`, and `SELECT ... FROM subquery`
for the total column. Example from `list_transactions`:

```python
subq = base_filtered_stmt.subquery()
agg_row = session.execute(
    select(
        func.count(),
        func.coalesce(func.sum(subq.c.amount), 0),
        func.coalesce(func.sum(case((subq.c.direction == "debit", subq.c.amount), else_=0)), 0),
    ).select_from(subq)
).one()
```

**→ Bugle (watch out)**: `get_taxonomies` in `src/bugle/app.py` currently loads **every**
`Brief` row into Python and aggregates counts there, and `list_briefs` filters `tags` in Python.
At personal scale this is harmless today; as the archive grows it's the first thing that will
go slow. Replace with `GROUP BY category`, `fun.count`, `json_each(tags)`-style SQL (or a cached
denormalized `taxonomies` snapshot), and add a `PRAGMA optimize` + index on `published_at` first.

### 1.7 Pagination that never reshuffles

MyMonee's sorted queries always append a stable tiebreak:
```python
return stmt.order_by(primary, Transaction.id.asc())
```
and list endpoints return `{total, offset, limit, items}` so the UI can render
"Showing X–Y of Z" and Prev/Next without guessing. The total uses a
`count()` over the **same filtered subquery** as the page — so the number always matches the rows
(`statements.py::list_statements` does `count(subquery)` then `offset/limit` in one query shape).

### 1.8 Relationship loading strategy: joinedload for to-one, selectinload for to-many

- `joinedload` on to-one relationships that are always needed (`Transaction.category`,
  `Transaction.subcategory`) so the serializer never triggers a lazy SELECT per row.
- `selectinload` on to-many for full detail views (Bugle's `_build_brief_detail_response`
  uses `selectinload(Brief.sources), selectinload(Brief.claims).selectinload(Claim.sources)` —
  already the right pattern).
- In list/detail splits, the **list** query uses *no* relationship loading at all and the
  **detail** query opts in to everything. Never configure eager loading globally on the model —
  always per-query.

### 1.9 Session lifecycle

`get_db()` (`db/session.py`) is the FastAPI dependency:

```python
session = get_session_factory()()
try:
    yield session
    session.commit()
except Exception:
    session.rollback()
    raise
finally:
    session.close()
```

Commit in the dependency, not inside routes. Bugle already builds sessions per-request via the
`Database` class (`expire_on_commit=False` — good, keep it; it avoids detatched-attribute errors
when serializing after commit).

### 1.10 DB health, vacuum, and backups are product features

`/api/system/db-health` exposes `page_count`, `freelist_pages`, `fragmentation_pct`,
`wal_size_bytes`, `integrity_ok`, `foreign_keys_ok`; `/api/system/db-vacuum` runs
`PRAGMA wal_checkpoint(TRUNCATE)` + `VACUUM` + `PRAGMA optimize` (`services/backup.py`). Backups
(`services/backup.py`, `routes/backup.py`):
- snapshot using SQLite's online backup API (safe under WAL) after `PRAGMA wal_checkpoint(FULL)`,
- run `PRAGMA integrity_check` + `foreign_key_check` on the **restored** file before reporting
  success,
- write a pre-restore safety backup so every restore is reversible.

**→ Bugle**: you already have `data/` backups + `trigger_deploy.sh` with migration + health check.
Add a `db-health` endpoint with fragmentation + integrity checks; it makes the daemon observable
and turns "the app feels slow" into a graph.

---

## 2. Lazy Loading (frontend + API contract)

### 2.1 Page-level lazy imports with Suspense + error boundary

`web/src/App.tsx` loads every page with React's `lazy()`:

```tsx
const OverviewPage = lazy(() => import("./pages/OverviewPage"));
...
<Suspense fallback={<div ...>Loading view…</div>}>
  <Routes>...</Routes>
</Suspense>
```

- The initial bundle contains only the shell + nav; large pages (Transactions = 1.8k lines,
  Accounts = 1.4k) compile into separate chunks loaded on demand.
- A custom `ErrorBoundary` class wraps routes so a crash in one view shows a friendly
  "Something went wrong" + Reload button instead of a white screen.

**→ Bugle**: `web/src/App.tsx` is a single 1600-line file. Split the feed, brief-detail, search,
saved, and archive views into `web/src/pages/*.tsx`, lazy-import them, and add the
ErrorBoundary. This alone will cut cold-start and make the app resilient.

### 2.2 List vs detail endpoint split (the contract that enables lazy UI)

The statements feature is the best template (`api/routes/statements.py`):

- `GET /api/statements` (list) → `_format_statement(s)` with `include_transactions=False` — rows
  carry cheap fields + `transaction_count`, `event_count`, `validation_status`. No nested arrays.
- `GET /api/statements/{id}` (detail) → `include_events=True, include_transactions=True` — one
  joined/selectin query returning everything for the modal.
- Frontend: the list page shows a light table; opening a statement fires one detail fetch.

Everything in MyMonee follows this shape: `api.ts` types even flag which fields live on the list
row vs. detail. **→ Bugle**: `GET /api/v1/briefs` should stop returning `content_markdown`
(or make the summary endpoint separate); keep `content_markdown` for
`GET /api/v1/briefs/{id}` only. The index list page will load dramatically faster and the payload
for a feed of 50 briefs drops from MBs to KBs.

### 2.3 Detail-on-demand modals (never precompute what isn't visible)

- Modal components are **conditionally rendered** (`{detailOpen && <TransactionDetailModal…/>}`)
  and their data is fetched *inside* the open handler with its own `loading` flag:
  ```tsx
  async function openEmail(tx) {
    setViewerLoading(true);
    const msg = await api.fetchGmailMessage(tx.source_email_id);
    ...
  }
  ```
- Trend charts (FinancialTrendModal) fetch `financialTrends(12, ...)` only when the modal opens —
  the Overview page itself never pays for chart payloads.
- Result: page-level responses stay small, and heavy widgets are paid for only by users who
  actually open them.

**→ Bugle**: brief-detail (claims + sources + markdown) should be fetched when a brief is opened,
not embedded in the feed. Same for source previews.

### 2.4 Abort stale requests + debounced search

`TransactionsPage.tsx`:
- Every filter/search/sort change rebuilds the query; the old in-flight request is cancelled via
  `AbortController` passed to `fetch` as `AbortSignal`: `api.transactions(params, signal)`.
- Search input is debounced 250ms (`setTimeout` → `setDebouncedQ`, clearing the prior timer) so a
  keystroke storm produces exactly one request.
- When a "sync completed" event fires, the page reloads its data.

**→ Bugle**: add an `api.ts` client where every GET accepts an optional `AbortSignal` and use the
same debounce pattern on the feed search. This prevents the classic "older response overwrites
newer response" bug on fast typing / rapid filter changes.

### 2.5 Decoupled cross-page refresh via window events

After a Gmail sync, `App.tsx` dispatches:

```ts
window.dispatchEvent(new CustomEvent("mymonee:sync-completed", { detail: result }));
```

Every open page listens for it and refreshes its own data (`TransactionsPage`, `OverviewPage`,
`AccountsPage`…). No websockets, no polling, no global state — just a broadcast event. This is a
great fit for Bugle: after `POST /api/v1/briefs` (Hermes publication) or a manual re-tag, pages
that care re-fetch.

---

## 3. UI / UX

### 3.1 Design tokens — CSS custom properties, one stylesheet

MyMonee's entire visual language lives in `web/src/styles.css` as variables (`--bg`, `--surface`,
`--line`, `--ink`, `--ink-muted`, `--danger`, `--credit`, `--radius-*`, `--space-*`) with
`data-theme` switching on `<html>` (see `useTheme.ts`). Components reference tokens, never raw
hex. Bugle's `FRONTEND.md` already defines a token set (GitHub Dark + Bugle Gold) — the exact
same discipline is in place; keep it and don't let inline colors sneak in.

### 3.2 Modal chrome & a11y (`useModalChrome.ts`)

One reusable hook gives every modal:
- scroll-lock without scroll jump (stores `window.scrollY`, restores on close),
- Escape-to-close (`window.addEventListener("keydown")`),
- focus-on-open with `preventScroll: true`,
- backdrop click-to-close with a 120ms arming delay so the click that **opened** the modal
  doesn't immediately close it (`useBackdropClose`),
- `role="dialog"`, `aria-modal="true"`, labeled close buttons.

**→ Bugle**: Bugle's reader UI will live or die on modal/reader-pane ergonomics. Extract the same
hook and apply it to brief detail, claim evidence panels, and share sheets.

### 3.3 Two-step destructive confirm (`useConfirm.ts`)

First click **arms** the button ("Delete?"); a second click inside 2.5s executes. Prevents
accidental one-click deletes while staying faster than a JS `confirm()` dialog. Use for
`DELETE /briefs`, "reset", and bulk tag removal.

### 3.4 Optimistic updates — mutate the row, don't refetch

After classifying a transaction, `TransactionsPage` doesn't reload the page for the common case:

```tsx
setItems((prev) => prev.map((t) => ids.includes(t.id) ? {...t, category_id, category: chosenCat?.name, needs_review: false} : t));
```

It only refetches when the change alters page membership (e.g. removing rows from Needs Review →
`applyRemoved(ids)`). Feels instant on a localhost API. **→ Bugle**: after re-tagging a brief or
toggling visibility, patch the local row; refetch only for membership-changing actions
(delete, filter).

### 3.5 URL-synced filters (deep-linkable, back-button-safe)

Transaction filters (`q`, `category_ids`, `account`, dates) are read from and written to the URL
search params (`useSearchParams`), so views are shareable and the browser back button works.
Changing a filter resets `offset` to 0. **→ Bugle**: implement feed search + tag/category filters
as URL params (`#/archive?tag=ai`) — cheap, and matches the hash-router already in FRONTEND.md.

### 3.6 Loading / error / empty states on every view

Every page has all three, without exception: a `loading` flag → skeleton/spinner text, an `error`
string → error block (with retry), and empty state copy ("No transactions match your filters").
`api.ts::request` normalizes failures to a single `Error(detail)` so pages share one catch shape.

### 3.7 Single typed API client (`web/src/api.ts`)

One 1287-line module defines **all** request/response TypeScript interfaces and one
`request<T>(path, init)` wrapper that:
- injects auth (`Authorization` header from localStorage) + `Accept: application/json`,
- parses `{detail}` error bodies into thrown `Error`s,
- passes through `RequestInit` (method, body, `AbortSignal`).

Pages import typed functions (`api.briefs(...)`, `api.updateBrief(...)`) and never touch `fetch`.
**→ Bugle**: `web/src/App.tsx` currently calls `fetch` in several places. Extract `web/src/api.ts`
with typed interfaces for `ResearchJob`, `Brief`, `Source`, `Claim`, `Taxonomies` — the payoff is
type-checked API evolution as the schema grows.

### 3.8 Formatting lives in one place (`web/src/format.ts`)

Money/date/source labels are centralized: locale-aware `Intl.NumberFormat`, compact formats
(`1.2L`, `3.4Cr`), `formatDate`, `formatDateTime`, label map lookups with safe fallbacks. The UI
gains consistency for free. **→ Bugle**: extract `formatBriefDate`, `formatConfidence`,
`formatCostUsd` (with the `Cr/k` compaction if you chart spend) into one module.

### 3.9 Mobile-responsive in the app shell

Desktop nav + a separate mobile drawer (hamburger → full-screen drawer with section titles,
backdrop, close button, `role="dialog"`), sticky topbar, and a dedicated mobile sync button.
Tables degrade to horizontal scroll or card lists rather than hiding columns. Bugle's
mobile/desktop split is already documented in FRONTEND.md — MyMonee confirms the two-nav
pattern works in practice with the same token system.

### 3.10 Keyboard shortcuts & power-user details

- `/` anywhere focuses the search box (unless typing in another input).
- Row selection checkboxes + bulk actions with `Set<string>` state, `toggleAll` with
  partial-selection (someSelected) affordance.
- `SortHeader` component emits `aria-sort` and renders ▲/▼ — accessible sortable tables.

---

## 4. Backend & API architecture

### 4.1 Thin routes, services with the logic

Routes validate and serialize; all logic lives in `src/mymonee/services/*.py`
(`transactions.py`, `dashboard.py`, `deduplication.py`, `reconciliation.py`, …).
Serializers are plain functions (`serialize_transaction`) colocated with their service — no
magic ORM-to-JSON. Routes are one-file-per-resource under `api/routes/` and mounted in
`app.py` via `include_router`. **→ Bugle**: split `app.py`'s single function into
`api/routes/jobs.py`, `briefs.py`, `taxonomies.py`, `auth.py` + a `services/` layer when it
grows past ~15 routes.

### 4.2 Validate at the boundary

Pydantic models with `Field(min_length=1)`, `Query(ge=1, le=200)` bounds, regex `pattern`
constraints on enums, and `response_model=` on every route. Bulk endpoints validate the
"master" entity once up-front (category exists) before looping rows — no partial-apply surprises.

### 4.3 Auth as middleware + dependency

- An HTTP middleware (`app.py::enforce_auth`) gates every `/api/*` path against session
  tokens, with explicit exempt lists (`/api/health`, `/api/auth/*`, `/api/onboarding/*`).
- Route-level `Depends(get_auth_context)` / `require_admin` give per-endpoint roles.
- CORS middleware is added **after** the auth middleware intentionally so preflight OPTIONS
  is never blocked (`app.add_middleware(CORSMiddleware, ...)` after the `@app.middleware("http")`).
- Client tokens never hit `localStorage`-only storage; Bearer is accepted in headers, session
  cookies used as primary.

**→ Bugle**: your three-role model (service/admin/anonymous) is already superior (DB-level
`visibility == "public"` filter, constant-time 404 for private briefs). Keep the
fail-closed pattern: never leak *existence* of a private brief to anonymous (it returns 404, not
403).

### 4.4 SPA serving with path-traversal protection

`app.py::spa_fallback` resolves the requested path and verifies `candidate.is_relative_to(dist)`
before serving; unknown paths fall back to `index.html`. Bugle's `app.py` already has a similar
`commonpath` guard — keep it, and add the `/assets` mount with
`StaticFiles(directory=assets_dir)` (correctly done in both projects).

### 4.5 Observable health & status

`/api/health` plus richer `/api/system/status` (db counts, last sync, scheduler/gmail booleans)
exposed in a `/status` UI page. Critical for the launchd daemon workflow: the deploy script
polls a health endpoint after restart (`scripts/deploy_local.sh`).
**→ Bugle**: keep `/api/health` and add `/api/v1/system/status` with last-job info, DB size,
and counts — it turns `trigger_deploy.sh`'s health check into something meaningful.

---

## 5. Domain-modeling patterns worth copying into a research domain

### 5.1 State machines persisted in the DB, with an audit trail

`CreditCardStatement.status` walks `DISCOVERED → DOWNLOADED → UNLOCKED → EXTRACTED(→ VALIDATED)`
and every transition writes a `StatementProcessingEvent(stage, status, message, started_at,
completed_at)`. `ResearchJob` already has `pending → running → completed|failed|cancelled` —
the missing half is an **event log** (`job_events`) recording each transition with message +
timestamp, so "why did this fail?" answers itself from the DB, not log files.

### 5.2 Correction/audit tables, not destructive updates

`ClassificationCorrection` snapshots **previous vs. new** labels before every user correction
("this is the training-pair source, not just an audit log"). `DataIssueFlag` is purely additive —
flagging never mutates the transaction. For Bugle: when an admin edits a brief's claims, or Hermes
re-publishes a revision, snapshot the old `content_markdown`/`claims` into a `brief_revisions`
table. The archive's whole value proposition is provenance — make every edit reversible.

### 5.3 Canonical-truth axiom & derived projections

ARCHITECTURE.md's law: *source data is evidence, the ledger is the truth, and every downstream
projection (analytics, balances, statements) is derived*. MyMonee rebuilds derived state
(reconciliations, balance projections) from canonical rows on demand; nothing is trusted from
an import. **→ Bugle**: `Brief` is canonical; rendered markdown, taxonomies, and stats are
projections — recompute, don't carry forward unverified state from Hermes payloads.

---

## 6. Reliability, tests & ops

### 6.1 Test discipline

- 46 test files with purpose-built names (`test_domain_invariants.py`,
  `test_financial_integrity_remediation.py`, `test_deduplication_and_anomalies.py`).
- Invariant tests verify *rules that must never break* (salary attribution, transfers not
  double-counted, credit-card payments not expenses). These are the tests that catch regressions
  before money math silently changes.
- Bug-fix workflow: reproduce with a test → fix → run targeted test → run suite.
- `pytest -q -m "not hermes"` as the fast pre-push gate; a separate `-m hermes` marker for
  live/eval tests that never run in CI. **→ Bugle**: add a `test_domain_invariants.py` covering
  idempotent publication (same job_id → one brief), anonymous-never-sees-private, and
  claim↔source mapping integrity.

### 6.2 Quality gates & deployment

- Pre-push hook: `ruff check` + `ruff format --check` + fast pytest (4s).
- Feature-level QA script (`scripts/qa_mcp_hermes.sh`) for cross-cutting work.
- Release deploy (`scripts/deploy_local.sh`): verify clean tree + remote in sync → build
  frontend → restart launchd → poll health.
- Webhook-triggered CD on PR merge into `main` with strict-tree-cleanliness guardrails.
- Frontend changes are only "done" after `cd web && npm run build` — the FastAPI app serves the
  built bundle, so a source-only change is incomplete. Bugle's `trigger_deploy.sh` already follows
  this shape.

### 6.3 Operational hygiene

- All ad-hoc scripts live in `scripts/`; data-mutating scripts need dry-run + logging + reversible
  defaults.
- Secret hygiene: credentials, `.env`, SQLite files, and launchd plists never enter git; a
  safe example template is committed instead.
- Config via `pydantic-settings` + YAML with local override file (`config/local.example.yaml`) —
  human-editable, no code changes needed for behavior tuning. **→ Bugle**: your `config.py` env
  vars work; consider the layered YAML + env merge once config options multiply.

---

## 7. Priority-ordered action checklist for Bugle

**P0 — DB (Completed)**
- [x] 1. Add missing PRAGMAs in `_build_engine` (`journal_mode=WAL`, `synchronous=NORMAL`, `busy_timeout=5000`, `cache_size=-64000`, `temp_store=MEMORY`). (§1.1)
- [x] 2. Add indexes: `briefs(visibility, published_at)`, `sources.brief_id`, `claims.brief_id`, `claim_sources(claim_id)/(source_id)`; migrate existing DBs with `CREATE INDEX IF NOT EXISTS` at startup. (§1.2)
- [x] 3. Add `schema_meta` versioning + an idempotent-migration test (`test_idempotent_schema_migration`). (§1.5)

**P1 — Lazy loading & Frontend Modularization (Completed)**
- [x] 4. Split `GET /api/v1/briefs` to return lightweight `BriefSummary` without large markdown; dedicated `GET /api/v1/briefs/{id}` loads full markdown, claims, and sources. (§2.2)
- [x] 5. Split monolithic `App.tsx` into modular pages (`FeedPage`, `SearchPage`, `SavedPage`, `ArchivePage`, `ProfilePage`, `BriefDetailPage`) wrapped in `AppErrorBoundary`. (§2.1)
- [x] 6. Extract `web/src/api.ts` typed client with `AbortSignal` support; debounce feed search. (§2.3, §3.7)

**P2 — UI/UX & Design System (Completed)**
- [x] 7. Extract `useModalChrome` + `useConfirm` hooks for brief-detail and deletion flows. (§3.2, §3.3)
- [x] 8. URL-synced hash routing for home, search, saved, archive, and profile. (§3.5)
- [x] 9. Central `format.ts` for dates, relative time, model name, and USD/INR currency conversions. (§3.8)
- [x] 10. Implement strict Reading-First Badge Taxonomy (`web/src/components/Badge.tsx`) and eliminate colored pills for non-badge metadata (cost, reading duration, evidence).

**P3 — Architecture & Diagnostics (Completed)**
- [x] 11. Add `brief_revisions` table and snapshot-on-edit drawer (`RevisionsDrawer.tsx`). (§5.2)
- [x] 12. Add `GET /api/v1/system/db-health` diagnostic endpoint (`PRAGMA integrity_check`, `PRAGMA foreign_key_check`, file size, schema version) and surface in `SystemHealthModal.tsx` and `ProfilePage.tsx`. (§1.10)
- [x] 13. Add `Cache-Control: no-cache, no-store, must-revalidate` for SPA fallback `index.html` to prevent stale mobile browser caching.
- [x] 14. Add domain-invariant automated tests (`test_api.py`, 19 passing tests). (§6.1)

---

## Appendix — MyMonee files to open while implementing

| Pattern | File in my-monee |
| :--- | :--- |
| SQLite PRAGMAs, engine, additive migrations | `src/mymonee/db/session.py` |
| Schema discipline, indexes, deferred columns, money | `src/mymonee/db/models.py` |
| Default seeds (idempotent) | `src/mymonee/db/seed.py` |
| SQL-side pagination + filters + totals | `src/mymonee/services/transactions.py` |
| Aggregation in SQL (overview, trends) | `src/mymonee/services/dashboard.py` |
| Idempotent fingerprint ingestion | `src/mymonee/ingestion/fingerprint.py`, `ingestion/pipeline.py` |
| Dedup + refund/transfer pairing | `src/mymonee/services/deduplication.py`, `services/reconciliation.py` |
| List-vs-detail API contract | `src/mymonee/api/routes/statements.py` |
| Auth middleware + CORS ordering + SPA fallback | `src/mymonee/app.py` |
| Page lazy-loading + error boundary + sync event | `web/src/App.tsx` |
| Debounce/abort/optimistic update/pagination UI | `web/src/pages/TransactionsPage.tsx` |
| Modal chrome & a11y hooks | `web/src/hooks/useModalChrome.ts`, `useConfirm.ts`, `useToast.tsx` |
| Typed API client | `web/src/api.ts` |
| Central formatting | `web/src/format.ts` |
| Backup + integrity + vacuum | `src/mymonee/services/backup.py` |
| Domain rules that must never break | `CLAUDE.md`, `ARCHITECTURE.md`, `tests/test_domain_invariants.py` |