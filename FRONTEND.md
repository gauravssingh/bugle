# Bugle — Frontend Design System, UI/UX Guidelines & Architecture

> **Personal Research Intelligence Web Application**  
> Living documentation of the Bugle frontend architecture, visual design system, mobile/desktop split UX patterns, and component guidelines.

---

## 1. Product & Design Philosophy: Reading First

Bugle transforms multi-source web investigations and automated research syntheses into an authoritative, elegant, personal intelligence briefing.

### Core Principles

1. **Reading-First Experience (The Investigation is the Hero)**
   - The primary objective of the interface is **uninterrupted, comfortable reading**.
   - The investigation title, executive synthesis, and narrative prose are the dominant elements.
   - Badges, pills, and metadata must **support the content, not compete with it**.
   - The eye should always flow naturally:
     $$\text{CATEGORY} \longrightarrow \text{TITLE} \longrightarrow \text{SUMMARY} \longrightarrow \text{READ}$$
     *(Never: Badge $\rightarrow$ Badge $\rightarrow$ Price $\rightarrow$ Icon $\rightarrow$ Title!)*

2. **Kill the Pills for Non-Badges**
   - Reading duration, relative time, generation cost, and evidence counts are **supporting metadata**, NOT badges.
   - They are rendered as subdued inline text with subtle dot dividers, never enclosed in high-contrast colored pills.

3. **Radical Provenance & Transparency**
   - Every brief prominently exposes its underlying verification audit: verified claims, supporting citations, publisher reliability ratings, token expenditure, and model engine attribution.

4. **Contextual Multi-Device Strategy**
   - **Desktop (Cockpit Mode)**: Multi-column layout with persistent sidebar navigation, quick-nav exploration tiles, aggregate spend metrics, and split-screen narrative + claims audit sidebar. Flush sticky back bar with zero top padding gap.
   - **Mobile (Reader Mode)**: Distraction-free feed with a sticky blurred header, persistent thumb-friendly bottom navigation bar, safe-area inset compliance (`var(--sat)`, `var(--sab)`) for notched/Dynamic Island iPhones, edge-to-edge docked sticky back bar, and a dedicated compact search tab.

5. **Speed & Zero Friction**
   - Pure client-side hash routing (`#/`, `#/search`, `#/saved`, `#/archive`, `#/profile`, `#/brief/:id`).
   - Instant optimistic bookmarking and search history synced to `localStorage`.
   - Native Web Share API integration for iOS/Android sharing.
   - `Cache-Control: no-cache, no-store, must-revalidate` for `index.html` so mobile browsers never get stuck on stale bundles.

---

## 2. Visual Design System & Design Tokens

Bugle utilizes a refined dark theme designed for extended evening reading sessions, reminiscent of high-end editorial and developer intelligence tools (GitHub Dark Modern + Readwise Reader + Financial Times).

### 2.1 Color Tokens

```css
:root {
  /* Surface Layers */
  --bg: #0d1117;           /* Deep Canvas (App background) */
  --bg-secondary: #161b22; /* Card surfaces, header bars, inputs */
  --bg-tertiary: #21262d;  /* Interactive hover states, secondary tiles */

  /* Structural Borders */
  --border: #30363d;       /* Standard borders, card dividers */
  --border-muted: #21262d; /* Subtle internal separators */
  --border-hover: #444c56; /* Active border hover highlight */

  /* Typography Colors */
  --ink: #e6edf3;          /* Primary body & headline text (high contrast) */
  --ink-secondary: #8b949e;/* Excerpts, secondary metadata, subtitles */
  --ink-muted: #6e7681;    /* Timestamps, labels, keyboard hints */

  /* Brand Accent: Bugle Gold */
  --accent: #d29922;       /* Brand highlight, bookmark stars, action buttons */
  --accent-dim: rgba(210, 153, 34, 0.15); /* Accent backgrounds, chip active */
  --accent-glow: rgba(210, 153, 34, 0.25);

  /* Semantic Status */
  --status-ready: #3fb950;  /* Emerald: Verified claim, daemon active */
  --status-warn: #d29922;   /* Amber: Supported claim, processing */
  --status-danger: #f85149; /* Red: Disputed claim, delete actions */
  --status-muted: #6e7681;  /* Gray: Unverified claim */

  /* Safe Area Insets (iOS Notches & Home Bars) */
  --sat: env(safe-area-inset-top, 0px);
  --sab: env(safe-area-inset-bottom, 0px);
  --sal: env(safe-area-inset-left, 0px);
  --sar: env(safe-area-inset-right, 0px);
}
```

---

## 3. Strict Badge Taxonomy & Metadata System

All badges throughout Bugle are generated from a single unified component: `<Badge variant="..." />`.

### 3.1 Shared Badge Geometry
All badge variants share the exact same physical dimensions:
- **Height**: `22px`
- **Border-radius**: `5px`
- **Padding**: `0 8px`
- **Font-size**: `0.72rem` (`500` weight)
- **Alignment**: `inline-flex; align-items: center; justify-content: center; gap: 5px; line-height: 1;`
- **Box-sizing**: `border-box; white-space: nowrap; user-select: none;`

### 3.2 Semantic Variants

| Variant Component | Purpose | Palette & Typography | Visual Treatment | Examples |
| :--- | :--- | :--- | :--- | :--- |
| `<CategoryBadge />` | Investigation topic domain | Gold / amber (`#e3b341`) | Tinted `rgba(210,153,34,0.1)`, 1px border | `Technology`, `AI`, `Markets`, `Security` |
| `<StatusBadge />` | Lifecycle / freshness state | Emerald green (`#3fb950`) | Tinted `rgba(63,185,80,0.12)`, 5px status dot | `Latest Dispatch`, `High confidence` |
| `<TechnicalTag />` | Model engine, depth, taxonomy | Neutral blue-gray (`#8b949e`) | Monospace, `rgba(110,118,129,0.1)`, quiet border | `deepseek-v4-flash`, `standard`, `web` |
| `<AccessBadge />` | Visibility & security | Neutral gray (Public) or Muted Red (`#f85149`, Private) | Lock SVG icon on Private, quiet gray for Public | `🔒 Private`, `Public` |

### 3.3 Non-Badge Inline Metadata Components

| Component | Semantic Role | Rendering Specification | Example |
| :--- | :--- | :--- | :--- |
| `<CostMetadata />` | Generation spend | Quiet inline coin icon + USD amount + converted INR | `💰 $0.0049 (₹0.47)` |
| `<ReadingMetadata />` | Reading & time meta | Subdued inline text with dot separators | `1 min read · 5 hours ago · 💰 $0.0049` |
| `<EvidenceMetadata />` | Verification counts | Quiet supporting text at card bottom | `3 sources · 3 claims` |

---

## 4. Responsive Architecture: Desktop vs. Mobile

### 4.1 Desktop Cockpit (`>= 900px`)
- **Fixed Left Sidebar (270px)**: Brand title, navigation tabs (`Feed`, `Search`, `Saved`, `Full Catalogue`), topic filter taxonomy chips, and operator identity footer card.
- **Top Bar**: Contextual page title, descriptive subtitle, and direct DB & System Health modal trigger. (Hidden on detail view to dock the back bar flush at `top: 0`).
- **Main Canvas**: Centered max-width 1240px container. In detail view, `.wrap.in-detail-view` eliminates top padding so the sticky back bar anchors cleanly with zero dead space.

### 4.2 Mobile Reader (`< 900px`)
- **Clean Reading Experience**: No desktop quick-nav or aggregate cards above the fold; users land directly on the featured dispatch.
- **Top Brand Header**: Positioned sticky with safe-area notch padding (`calc(12px + var(--sat))`). **Automatically hidden** when viewing an investigation so the back bar becomes the sole top bar.
- **Edge-to-Edge Sticky Back Bar**: Negative margins (`0 -16px 16px -16px`) and safe-area padding (`calc(10px + var(--sat, 0px)) 16px 10px`) dock the back bar seamlessly from physical edge to physical edge under the iPhone notch with a frosted glass backdrop filter.
- **Persistent Bottom Navigation**: 5 touch-optimized tabs:
  - **Home**: Main feed.
  - **Search**: Dedicated search tab.
  - **Saved**: Bookmarked investigations with small 15px count indicator.
  - **Archive**: Historical catalogue with category filters.
  - **Profile**: Operator profile dashboard and system health.

---

## 5. Navigation & Tab System

| Tab ID | Hash Route | Component | Description |
| :--- | :--- | :--- | :--- |
| `home` | `#/` | [`FeedPage.tsx`](file:///Users/gauravsingh/projects/bugle/web/src/pages/FeedPage.tsx) | Clean blog-style stream with featured lead investigation. |
| `search` | `#/search` | [`SearchPage.tsx`](file:///Users/gauravsingh/projects/bugle/web/src/pages/SearchPage.tsx) | Full-page search with frequency-capped topic chips, debounced search, and recent queries. |
| `saved` | `#/saved` | [`SavedPage.tsx`](file:///Users/gauravsingh/projects/bugle/web/src/pages/SavedPage.tsx) | Curated bookmark collection stored in `localStorage`. |
| `archive` | `#/archive` | [`ArchivePage.tsx`](file:///Users/gauravsingh/projects/bugle/web/src/pages/ArchivePage.tsx) | Complete archive catalogued by category domain with spend metrics. |
| `profile` | `#/profile` | [`ProfilePage.tsx`](file:///Users/gauravsingh/projects/bugle/web/src/pages/ProfilePage.tsx) | Responsive operator dashboard: identity, model engine, spend analytics, and DB telemetry. |
| `brief` | `#/brief/:id` | [`BriefDetailPage.tsx`](file:///Users/gauravsingh/projects/bugle/web/src/pages/BriefDetailPage.tsx) | Editorial detail document view with markdown body, claims matrix, and primary sources. |

---

## 6. Investigation Card Architecture ([`BriefCard.tsx`](file:///Users/gauravsingh/projects/bugle/web/src/components/BriefCard.tsx))

```
┌────────────────────────────────────────────────────────────────────────┐
│ [Technology] [● Latest Dispatch]                     [ ★ ]  [ ↗ ]     │
│ 1 min read  ·  5 hours ago  ·  💰 $0.0049 (₹0.47)                      │
│                                                                        │
│ Project HydraFusion: GitHub Copilot's Multi-Model Orchestration        │
│ Up to 67% Lower Cost                                                   │
│                                                                        │
│ In-depth investigation into Copilot's dynamic router balancing         │
│ low-latency tasks and complex reasoning pipelines...                   │
│                                                                        │
│ [deepseek-v4-flash]  [standard]  [ai-routing]                          │
│ ────────────────────────────────────────────────────────────────────── │
│ 3 sources · 3 claims                              Read investigation → │
└────────────────────────────────────────────────────────────────────────┘
```

1. **Row 1 (Top Badges & Actions)**: `<CategoryBadge />` and optional `<StatusBadge />` / `<AccessBadge />` on left; bookmark star & share buttons on right.
2. **Row 2 (Inline Metadata)**: Subdued `<ReadingMetadata />` (`read duration · time ago · cost`).
3. **Row 3 (Hero Headline)**: Large, high-contrast, dominant title (`1.32rem` featured / `1.10rem` standard).
4. **Row 4 (Summary)**: 2–3 line clamped narrative excerpt with comfortable `1.6` line-height.
5. **Row 5 (Technical Tags)**: Secondary, quiet `<TechnicalTag />` elements for model engine, research depth, and subcategories.
6. **Row 6 (Footer)**: Quiet `<EvidenceMetadata />` on the left; gold `Read investigation →` CTA on the right.

---

## 7. Frontend Codebase Layout

```
web/src/
├── components/
│   ├── Badge.tsx           # Reusable Badge design system & inline metadata components
│   ├── BriefCard.tsx       # Reading-first investigation card
│   ├── Icons.tsx           # Optical SVG icons (Home, Search, Star, Archive, Coins, Lock, etc.)
│   ├── RevisionsDrawer.tsx # Slide-out audit drawer for historical brief revisions
│   └── SystemHealthModal.tsx # Real-time SQLite PRAGMA checks & schema diagnostics
├── pages/
│   ├── FeedPage.tsx        # Intelligence feed stream
│   ├── SearchPage.tsx      # Dedicated full-page search tab
│   ├── SavedPage.tsx       # Saved bookmarks view
│   ├── ArchivePage.tsx     # Full topic catalogue with spend stats
│   ├── ProfilePage.tsx     # Operator profile dashboard & system metrics
│   └── BriefDetailPage.tsx # Editorial detail reading view
├── hooks/
│   ├── useConfirm.ts       # Accessible confirmation dialog hook
│   └── useModalChrome.ts   # Modal keyboard & backdrop dismissal hook
├── api.ts                  # Type-safe Fetch API client for Bugle backend
├── format.ts               # Currency, duration, relative time & model name formatters
├── App.tsx                 # Root application shell, state management & routing
└── style.css               # Complete stylesheet enforcing the design system
```

---

## 8. Build & Verification Commands

```bash
# Type check and build frontend bundle into web/dist
cd web
npm run build

# Run backend unit & integration tests
cd ..
./.venv/bin/pytest -q

# Restart live macOS launchd service
launchctl kickstart -k "gui/$(id -u)/com.personal.bugle"
```
