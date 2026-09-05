# Bugle — Frontend Design System, UI/UX Guidelines & Architecture

> **Personal Research Intelligence Web Application**  
> Living documentation of the Bugle frontend architecture, visual design system, mobile/desktop split UX patterns, and component guidelines.

---

## 1. Product & Design Philosophy

Bugle transforms multi-source web investigations and automated research syntheses (powered by Hermes and Google Antigravity) into an authoritative, elegant, personal intelligence feed.

### Core Tenets

1. **Reading-First Experience**
   - The primary objective of the interface is **uninterrupted, comfortable long-form reading**.
   - UI chrome and metadata remain secondary to the narrative prose.
   - Mobile page load immediately presents the latest investigation without above-the-fold dashboard clutter.

2. **Radical Provenance & Transparency**
   - Every brief prominently exposes its underlying verification audit: verified claims, supporting citations, author/publisher reliability ratings, token expenditure, and model engine attribution.

3. **Contextual Multi-Device Strategy (Desktop vs. Mobile)**
   - **Desktop (Workstation Mode)**: Multi-column research cockpit with persistent sidebar navigation, quick-nav exploration tiles, aggregate spend metrics, and split-screen narrative + claims audit sidebar.
   - **Mobile (Reader Mode)**: Clean, distraction-free blog-feed view with a sticky blurred header, persistent thumb-friendly bottom navigation bar, safe-area inset compliance for notched iPhones, and a dedicated compact search tab.

4. **Speed & Zero Friction**
   - Pure client-side hash routing (`#/`, `#/search`, `#/saved`, `#/archive`, `#/brief/:id`).
   - Instant optimistic bookmarking and search history synced to `localStorage`.
   - Native Web Share API integration for iOS/Android sharing.

---

## 2. Visual Design System & Design Tokens

Bugle utilizes a refined dark theme designed for extended evening reading sessions, reminiscent of high-end editorial and developer intelligence tools (GitHub Dark Modern + Readwise Reader + Financial Times).

### 2.1 Color Tokens

```css
:root {
  /* Surface Layers */
  --bg: #0d1117;           /* Deep Canvas (App background) */
  --bg-secondary: #161b22; /* Card surfaces, header bars, inputs */
  --bg-tertiary: #21262d;  /* Pills, interactive hover states, chips */

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

### 2.2 Typography Scale

| Token / Context | Font Family | Size | Weight | Line Height | Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **App Title** | System Sans | `1.15rem` | 700 | 1.2 | Header branding, modal titles |
| **Headline (Featured)** | System Sans | `1.30rem` (mobile: `1.15rem`) | 700 | 1.3 | First dispatch on home feed |
| **Headline (Standard)** | System Sans | `1.05rem` | 600 | 1.35 | Investigation titles in feed |
| **Editorial Narrative** | Editorial Serif (`Merriweather`, `Georgia`) | `1.02rem` | 400 | 1.68 | Deep research brief body text |
| **UI Secondary** | System Sans | `0.85rem` | 400 | 1.5 | Excerpts, descriptions |
| **Micro Labels & Badges** | System Sans | `0.72rem – 0.78rem` | 600 | 1.0 | Category pills, topic chips, depth tags |
| **Data & Shortcuts** | Monospace (`SFMono-Regular`, `Menlo`) | `0.72rem` | 500 | 1.0 | Cost tags (`$0.014`), `⌘ K`, model name |

---

## 3. Responsive Architecture: Desktop vs. Mobile

The interface dynamically adapts its structure based on screen width (`@media (min-width: 900px)`):

```
+-----------------------------------------------------------------------------------+
|                                 DESKTOP VIEW (>= 900px)                           |
+----------------------+------------------------------------------------------------+
|  PERSISTENT SIDEBAR  |  MAIN CONTENT COLUMN                                       |
|  - Brand & Logo      |  - Top Search Bar with [⌘ K] shortcut                      |
|  - Home              |  - Suggested Topic Chips                                   |
|  - Search            |  - 4 Quick-Nav Tiles (Papers, Briefs, Saved, History)      |
|  - Saved Bookmarks   |  - Aggregate Stat Cards (Briefs Count, Spend $)           |
|  - Research Archive  |  - Recent Investigations Section Header                    |
|  - Daemon Status     |  - Blog-Style Feed of Investigations                       |
|  - Profile Pill      |    (or Side-by-Side Narrative + Claims Sidebar on Detail) |
+----------------------+------------------------------------------------------------+

+-----------------------------------------------------------------------------------+
|                                 MOBILE VIEW (< 900px)                             |
+-----------------------------------------------------------------------------------+
|  [Sticky Mobile Header]  🎺 Bugle (Ready)                       [Operator Pill]   |
+-----------------------------------------------------------------------------------+
|  FEED / CONTENT AREA (Immediate focus, no clutter):                               |
|  ★ Latest Dispatch (Featured Card with read time, model pill, excerpt)            |
|  - Standard Investigation Card 2                                                  |
|  - Standard Investigation Card 3...                                               |
+-----------------------------------------------------------------------------------+
|  [Persistent Bottom Nav] [Home]      [Search]      [Saved (N)]     [Archive]      |
+-----------------------------------------------------------------------------------+
```

### 3.1 Mobile UX Optimizations

1. **Clean Initial Landing**
   - Search bars, quick-nav tiles, and stat cards are hidden on mobile load (`.desktop-only-overview`).
   - The reader immediately lands on the latest dispatch.

2. **Fixed Sticky Header with Blur Backdrop**
   - Positioned sticky with safe-area padding: `top: 0; z-index: 900;`
   - Background: `rgba(13, 17, 23, 0.92)` with `backdrop-filter: blur(12px)`.
   - Respects `var(--sat)` to prevent iOS Dynamic Island and notification cutoffs.

3. **Persistent Bottom Navigation Bar**
   - Four touch-optimized actions: **Home**, **Search**, **Saved**, **Archive**.
   - Active state gold glow (`var(--accent)`).
   - Real-time badge counter for saved bookmarks.
   - Bottom safe area padding: `padding-bottom: calc(6px + var(--sab));`.

4. **iOS Safe Area & WebKit Viewport Rules**
   - `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />`
   - `<meta name="apple-mobile-web-app-status-bar-style" content="default" />` ensures iOS status bar icons remain readable and distinct.
   - Form inputs enforce `font-size: 16px` on mobile viewports to stop iOS Safari from auto-zooming.
   - Body avoids `overflow-x: hidden` to ensure iOS WebKit doesn't break sticky element positioning.

---

## 4. Navigation & Tab System

Bugle is organized around four primary tabs and a full-page detail view:

### 4.1 Tab Structure

| Tab ID | Hash Route | Description |
| :--- | :--- | :--- |
| `home` | `#/` | Clean blog-style research feed; latest dispatch highlighted as featured card. |
| `search` | `#/search` | Dedicated search tab with compact input, topic chips, recent searches, and live feed. |
| `saved` | `#/saved` | Curated bookmark list stored in browser `localStorage`. |
| `archive` | `#/archive` | Complete historical catalogue with category filter pills (AI, Markets, Climate, etc.). |
| `brief` | `#/brief/:id` | Full investigation report with narrative markdown and evidence audit matrix. |

### 4.2 Dedicated Search Tab (`#/search`)

The search experience uses a **dedicated full-page tab** rather than a modal popup to maintain clean scrolling physics, bookmarkability, and zero visual claustrophobia:

1. **Compact Search Bar (`.compact-search-bar`)**:
   - Streamlined 42px height.
   - Magnifying glass icon, clear button (`✕`), and desktop keyboard hint (`⌘ K`).
   - Automatically focuses input on entry.
2. **Horizontal Topic Chips (`.search-topics-bar`)**:
   - Curated & dynamic tags (`#AI`, `#productivity`, `#markets`, `#deep learning`, `#governance`).
   - Tapping any chip immediately filters the live archive and updates the URL.
3. **Recent Search Strip (`.search-recent-strip`)**:
   - Compact inline strip displaying recent search queries.
   - One-tap "Clear" affordance synced to `localStorage`.
4. **Live Results Count & Reset Filter Bar**:
   - Displays total matches and a direct "Reset search" link.

---

## 5. Component Patterns & Guidelines

### 5.1 Blog Card (`.blog-card`)

Used to render investigation briefs across Home, Search, Saved, and Archive tabs:

- **Meta Header Row**:
  - Category badge (`.blog-tag-badge`): Upper-case category pill.
  - Featured tag (`.blog-featured-tag`): `★ Latest Dispatch` on the newest post.
  - Estimated read time (`.blog-read-time`): E.g., `3 min read`.
  - Relative time (`.blog-rel-time`): E.g., `2h ago`, `Yesterday`.
  - Generation cost badge (`.blog-cost-pill`): E.g., `💰 $0.014`.
  - Action buttons: Quick-save star bookmark toggle & native Web Share button.
- **Headline**:
  - Prominent high-contrast title. Hover produces a subtle gold accent color shift.
- **Summary Excerpt**:
  - 2 to 3 line clamped narrative excerpt giving instant context.
- **Provenance Footer**:
  - Model engine pill (e.g. `⚡ gpt-4o-mini`, `⚡ sonnet-3.7`).
  - Research depth badge (`FAST`, `STANDARD`, `DEEP`).
  - Evidence count: `X sources · Y claims`.
  - Action CTA: `Read investigation →`.

### 5.2 Investigation Detail View (`.brief-detail-layout`)

When a user selects a brief (`#/brief/:id`):

1. **Sticky Header (`.brief-detail-nav-bar`)**:
   - "← Back to feed" button (restores previous tab and scroll context).
   - Bookmark and Share action icons.
   - Reading progress indicator.
2. **Executive Summary Card (`.executive-summary-card`)**:
   - Gold border-left callout accent.
   - Quick synthesis designed for 30-second absorption.
3. **Editorial Narrative Prose (`.brief-prose`)**:
   - Rendered using serif typography (`Merriweather`, 1.02rem, line-height 1.68).
   - Markdown headers (`H1`, `H2`, `H3`) with clean letter spacing and subtle divider borders.
   - Blockquotes, formatted code snippets, bullet lists, and bold callouts.
4. **Claims & Verification Audit Rail (`.claims-section`)**:
   - Each audited claim shows:
     - Status pill (`verified`, `supported`, `disputed`, `unverified`).
     - Statement text.
     - Evidence summary extracted from source cross-referencing.
     - Linked primary source references.
5. **Primary Sources Archive (`.sources-section`)**:
   - Direct link out to original papers, articles, and documentation (`↗`).
   - Publisher name, author, publication date, and reliability score.

### 5.3 Operator Profile Menu (`.profile-dropdown-menu`)

Accessible via the operator pill in the top header:
- Authenticated user email (Cloudflare Access / Google).
- System daemon health and daemon runtime metrics.
- Research pipeline capabilities (multi-source claims verification audit, Cloudflare Access Tunnel).
- Quick navigation shortcuts to Saved Bookmarks, Archive, and Search.

---

## 6. Code Style & Technical Conventions

### 6.1 State Management Rules

- **Client Navigation**: Rely strictly on `switchTab(tab)` and hash synchronization. Avoid artificial routing dependencies.
- **Local Storage Keys**:
  - `bugle_saved_briefs`: Array of string brief IDs (`string[]`).
  - `bugle_recent_searches`: Array of unique recent queries (`string[]`), max 10 entries.
- **Keyboard Shortcuts**:
  - `⌘ K` / `Ctrl K`: Navigate to Search Tab and focus search input.
  - `Escape`: Close open dropdown menus and modals.

### 6.2 CSS Best Practices

1. **No Hardcoded Colors**: Always utilize `:root` CSS custom properties (`var(--bg)`, `var(--border)`, `var(--ink)`, `var(--accent)`).
2. **Touch Targets**: All interactive icons, chips, and buttons must have a minimum target of `40px` (or `44px` on mobile nav).
3. **Smooth Micro-interactions**: Hover effects use standard ease transitions: `transition: all 0.15s ease`.
4. **No Content Shift**: Maintain fixed heights or min-heights on icons, buttons, and badges to prevent layout thrashing.
5. **Safe Scroll physics**: Never apply `overflow: hidden` to root `html, body` or parent containers of sticky elements.

---

## 7. Build, Test & Deployment Pipeline

Bugle's frontend is bundled with Vite and served statically by the FastAPI backend:

```bash
# Type check and build frontend bundle into web/dist
cd web
npm run build

# Run backend unit & integration tests
cd ..
.venv/bin/pytest

# Restart daemon via launchd (macOS)
launchctl kickstart -k gui/$(id -u)/com.personal.bugle
```

When building for production:
- TypeScript compilation (`tsc --noEmit`) validates type safety across all React components.
- Vite bundles and minifies CSS and JavaScript into hash-versioned assets in `web/dist/assets/`.
- FastAPI mounts `web/dist` at `/` to serve the single-page application with fallback index routing.
