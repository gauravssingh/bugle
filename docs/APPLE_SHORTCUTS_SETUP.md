# 📲 Bugle: Apple Shortcuts & iOS Share Sheet Setup

With this Apple Shortcut, you can highlight text, share an article from Safari, or tap a widget on your iPhone, iPad, or Mac to commission an investigation in Bugle.

---

## Architecture

```
iPhone / iPad / Mac (Safari Share Sheet)
                  │
                  ▼
         Apple Shortcut ("Bugle It")
                  │
                  ▼ POST https://bugle.gauravs-apps.in/api/v1/ingest/quick
          Cloudflare Access (Service Token)
                  │
                  ▼
          Cloudflare Tunnel (d20ef937)
                  │
                  ▼
       Bugle Daemon (Mac Mini :8480)
                  │
                  ▼
   ResearchJob Queued for Hermes Investigation
```

---

## 1. Quick Shortcut Setup (Manual 2-Minute Steps)

Open the **Shortcuts app** on your Mac or iPhone:

1. Tap **+** to create a new shortcut.
2. Name it: **Sound the Bugle** (or **Bugle It**).
3. Tap the (i) / Details button:
   - Turn **ON** `Show in Share Sheet`.
   - Set **Share Sheet Types** to: `URLs`, `Safari web pages`, and `Text`.

4. Add Action: **Get Contents of URL**
   - **URL**: `https://bugle.gauravs-apps.in/api/v1/ingest/quick`
   - **Method**: `POST`
   - **Headers**:
     | Key | Value |
     | :--- | :--- |
     | `CF-Access-Client-Id` | `a803d06b3df9090ce44e901fd3cb798c.access` |
     | `CF-Access-Client-Secret` | `cfast_59DHSjjJ6QPGmKhM4UiMEdwi0y411ZOGkPZqltzC6bffdde3` |
     | `Authorization` | `Bearer hermes_local_dev_token` |
     | `Content-Type` | `application/json` |
   - **Request Body**: `JSON`
     - `url` (Text): `Shortcut Input`
     - `title` (Text): `Shortcut Input`
     - `research_depth` (Text): `standard` (or prompt for `fast`, `standard`, `deep`)

5. Add Action: **Get Dictionary Value**
   - Get `message` from `Contents of URL`.

6. Add Action: **Show Notification**
   - Title: `🎺 Bugle Queued`
   - Body: `Dictionary Value`

---

## 2. Test It via Terminal / Webhook

You can test the exact shortcut payload anytime from your terminal:

```bash
curl -X POST \
  -H "CF-Access-Client-Id: a803d06b3df9090ce44e901fd3cb798c.access" \
  -H "CF-Access-Client-Secret: cfast_59DHSjjJ6QPGmKhM4UiMEdwi0y411ZOGkPZqltzC6bffdde3" \
  -H "Authorization: Bearer hermes_local_dev_token" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://arxiv.org/abs/2501.12948",
    "title": "DeepSeek-R1 Technical Paper",
    "research_depth": "deep"
  }' \
  https://bugle.gauravs-apps.in/api/v1/ingest/quick
```

**Response:**
```json
{
  "status": "queued",
  "job_id": "job_...",
  "topic": "DeepSeek-R1 Technical Paper",
  "research_depth": "deep",
  "view_url": "https://bugle.gauravs-apps.in/#/brief/job_...",
  "message": "Research task queued for Hermes investigation."
}
```

---

## 3. Hermes Autonomous Processing

To process queued jobs:
```bash
python3 scripts/hermes_bridge.py --poll-jobs
```
Hermes will investigate the queued link, publish the synthesis, and send a Telegram alert when ready.
