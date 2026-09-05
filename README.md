# 🎺 Bugle

**Local-first personal announcement / journal board.** A small self-hosted web
app for posting short personal updates — "sound the bugle." Hosted privately on
your own machine and exposed via a personal subdomain (planned: `bugle.gauravs-apps.in`).

Built as a sibling to [MyMonee](https://github.com/gauravssingh/my-monee), sharing
its deployment DNA: a FastAPI + SQLite core and a React/Vite/TypeScript frontend
served as a static `dist` from the same process, supervised by a macOS `launchd`
daemon and fronted by Cloudflare.

> **Status:** scaffolding + MVP. The board does create/list/update/delete posts
> with `private`/`public` visibility. Feature direction is still open — see
> [What's next](#whats-next).

## Stack

| Layer      | Tech                                                        |
| ---------- | ----------------------------------------------------------- |
| Backend    | Python 3.13 · FastAPI · SQLAlchemy · SQLite (WAL ledger)     |
| Frontend   | React 19 · Vite 6 · TypeScript                               |
| Deploy     | macOS `launchd` daemon · Cloudflare on `*.gauravs-apps.in`   |

## Layout

```
bugle/
├── src/bugle/        # FastAPI app: config, db, schemas, endpoints
├── web/              # React + Vite frontend (built into web/dist)
├── scripts/          # run_server, install_launchd, trigger_deploy
├── tests/            # API smoke tests (pytest)
└── data/             # durable SQLite db (gitignored)
```

## Run it locally

```bash
# backend
python3.13 -m venv .venv && ./.venv/bin/pip install -e ".[dev]"
./.venv/bin/python -m pytest -q          # tests
./.venv/bin/python -m bugle              # serves :8480

# frontend (dev, proxies /api -> :8480)
cd web && npm install && npm run dev     # :5180
# or build for production
cd web && npm run build                   # -> web/dist, served by backend at /
```

## Run as a macOS daemon

```bash
scripts/install_launchd.sh      # installs com.personal.bugle, auto-restarts
launchctl kickstart -k gui/$(id -u)/com.personal.bugle   # restart
tail -f ~/Library/Logs/bugle/stdout.log
```

## Write protection

Set `BUGLE_WRITE_TOKEN` in a `.env` (or launchd env) to require a `Bearer` token
for the mutating `/api/posts` endpoints. Reads stay open (useful for a public
posting board fronted by Cloudflare Access).

## What's next

This is where you steer. Plausible directions given the name:

- **Announcements / "now" page** — public-facing posts, pinned items, Markdown bodies.
- **Private journal** — no public surface at all, just a personal wall you open.
- **Reminder / alert tooter** — scheduled items that "bugle" via notification.

Tell me which one (or something else) and the scaffold grows into it.

## Deployment target

Mirror of `my-monee.gauravs-apps.in`: the daemon listens on a localhost port
(currently `8480`), Cloudflare Access + a tunnel/forward proxy puts it on
`bugle.gauravs-apps.in`. See `~/projects/cloudflare.txt` for the account.
Domain forwarding/TLS setup is in your infra, not this repo.