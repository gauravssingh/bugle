import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type AuthInfo = {
  role: string;
  email: string | null;
  is_admin: boolean;
  is_service: boolean;
  public_enabled: boolean;
};

type BriefSummary = {
  id: string;
  job_id: string | null;
  title: string;
  summary: string;
  category: string;
  subcategory: string;
  tags: string[];
  confidence: string;
  visibility: string;
  research_type: string;
  research_depth: string;
  source_count: number;
  claim_count: number;
  cost_usd: number | null;
  duration_seconds: number | null;
  model: string | null;
  total_tokens: number | null;
  published_at: string;
  created_at: string;
};

type Source = {
  id: number;
  brief_id: string;
  title: string;
  url: string;
  publisher: string;
  author: string | null;
  source_type: string;
  reliability: string;
  published_at: string | null;
  retrieved_at: string;
  relevance: string | null;
};

type Claim = {
  id: number;
  brief_id: string;
  statement: string;
  status: string;
  evidence_summary: string;
  source_ids: number[];
};

type BriefDetail = BriefSummary & {
  content_markdown: string;
  token_usage: {
    input?: number;
    output?: number;
    reasoning?: number;
    total?: number;
  } | null;
  execution_meta: Record<string, any>;
  research_started_at: string | null;
  research_completed_at: string | null;
  sources: Source[];
  claims: Claim[];
};

type TabType = "home" | "search" | "saved" | "archive";

const SUGGESTIONS = ["AI", "productivity", "markets", "climate", "semiconductor"];

function formatCost(usd: number | null | undefined) {
  if (usd === null || usd === undefined) return null;
  if (usd === 0) return "$0.00";
  if (usd < 0.0001) return "<$0.0001";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
}

function formatDuration(sec: number | null | undefined) {
  if (sec === null || sec === undefined) return null;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const mins = Math.floor(sec / 60);
  const rem = Math.round(sec % 60);
  return `${mins}m ${rem}s`;
}

function formatModel(model: string | null | undefined) {
  if (!model) return null;
  const parts = model.split("/");
  const name = parts[parts.length - 1];
  return name.replace(/-0731|-exp/g, "");
}

function formatTime(iso: string | null) {
  if (!iso) return "Unknown";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatRelativeTime(iso: string | null) {
  if (!iso) return "Recently";
  try {
    const d = new Date(iso);
    const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diffSec < 0) return "Just now";
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) {
      return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
    }
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "Recently";
  }
}

function estimateReadingTime(text?: string | null): string {
  if (!text) return "2 min read";
  const words = text.trim().split(/\s+/).length;
  const minutes = Math.max(1, Math.ceil(words / 160));
  return `${minutes} min read`;
}

function getOperatorInitials(email: string | null | undefined): string {
  if (!email) return "GS";
  const user = email.split("@")[0];
  const segments = user.split(/[._-]/).filter(Boolean);
  if (segments.length >= 2) {
    return (segments[0][0] + segments[1][0]).toUpperCase();
  }
  return user.slice(0, 2).toUpperCase();
}

// Icons
function IconHome({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function IconSearch({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function IconStar({ filled = false, className = "" }: { filled?: boolean; className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill={filled ? "#d29922" : "none"} stroke={filled ? "#d29922" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function IconArchive({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="21 8 21 21 3 21 3 8" />
      <rect x="1" y="3" width="22" height="5" />
      <line x1="10" y1="12" x2="14" y2="12" />
    </svg>
  );
}

function IconPaper({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function IconBriefs({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}

function IconHistory({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 14 14" />
    </svg>
  );
}

function IconCoins({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6" />
      <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
      <path d="M7 6h1v4" />
      <path d="m16.7 13.8.3.2" />
    </svg>
  );
}

function IconArrowRight({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function IconBook({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

function IconShare({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

export default function App() {
  const [auth, setAuth] = useState<AuthInfo | null>(null);
  const [briefs, setBriefs] = useState<BriefSummary[]>([]);
  const [currentBriefId, setCurrentBriefId] = useState<string | null>(null);
  const [currentBrief, setCurrentBrief] = useState<BriefDetail | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("home");
  const [search, setSearch] = useState("");
  const [archiveCategory, setArchiveCategory] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Saved bookmarks state (synced to localStorage)
  const [savedIds, setSavedIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("bugle_saved_briefs");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Recent searches state (synced to localStorage)
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("bugle_recent_searches");
      return stored ? JSON.parse(stored) : ["agentic reasoning", "semiconductor", "deepseek"];
    } catch {
      return ["agentic reasoning", "semiconductor", "deepseek"];
    }
  });

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Keyboard shortcut listener: ⌘ K to jump to Search Tab, Escape to close profile menu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        switchTab("search");
      } else if (e.key === "Escape") {
        setShowProfileMenu(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Persist saved IDs
  useEffect(() => {
    try {
      localStorage.setItem("bugle_saved_briefs", JSON.stringify(savedIds));
    } catch {
      // ignore
    }
  }, [savedIds]);

  const toggleSave = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSavedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Add to search history
  const recordSearch = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setRecentSearches((prev) => {
      const filtered = prev.filter((item) => item.toLowerCase() !== trimmed.toLowerCase());
      const next = [trimmed, ...filtered].slice(0, 8);
      try {
        localStorage.setItem("bugle_recent_searches", JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Parse URL hash for routing: #/brief/:id, #/search, #/saved, #/archive, #/
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash;
      if (hash.startsWith("#/brief/")) {
        const id = hash.replace("#/brief/", "").trim();
        setCurrentBriefId(id);
      } else {
        setCurrentBriefId(null);
        setCurrentBrief(null);
        if (hash === "#/search") {
          setActiveTab("search");
        } else if (hash === "#/saved") {
          setActiveTab("saved");
        } else if (hash === "#/archive") {
          setActiveTab("archive");
        } else {
          setActiveTab("home");
        }
      }
    };
    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  // Fetch Auth context
  useEffect(() => {
    fetch("/api/v1/auth/me")
      .then((r) => r.json())
      .then((data) => setAuth(data))
      .catch(() => {
        setAuth({
          role: "anonymous",
          email: "gaurav.singh.86@gmail.com",
          is_admin: true,
          is_service: false,
          public_enabled: true,
        });
      });
  }, []);

  // Load Briefs Feed
  const loadBriefs = useCallback(async (query: string = "") => {
    setLoading(true);
    setError(null);
    try {
      const url = query.trim()
        ? `/api/v1/briefs?search=${encodeURIComponent(query.trim())}`
        : "/api/v1/briefs";
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error("Private-first archive: Public access is currently restricted.");
        }
        throw new Error(`Failed to load briefs (${res.status})`);
      }
      const data = await res.json();
      setBriefs(Array.isArray(data.briefs) ? data.briefs : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setBriefs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Trigger search with debounce
  useEffect(() => {
    if (currentBriefId) return;
    const timer = setTimeout(() => {
      loadBriefs(search);
      if (search.trim().length >= 3) {
        recordSearch(search);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [search, currentBriefId, loadBriefs]);

  // Load Single Brief Detail
  useEffect(() => {
    if (!currentBriefId) return;
    setLoading(true);
    setError(null);
    fetch(`/api/v1/briefs/${encodeURIComponent(currentBriefId)}`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Brief not found or access restricted (${res.status})`);
        }
        return res.json();
      })
      .then((data: BriefDetail) => {
        setCurrentBrief(data);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setCurrentBrief(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [currentBriefId]);

  const toggleVisibility = async (brief: BriefDetail) => {
    const nextVis = brief.visibility === "private" ? "public" : "private";
    try {
      const res = await fetch(`/api/v1/briefs/${brief.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: nextVis }),
      });
      if (res.ok) {
        const updated = await res.json();
        setCurrentBrief(updated);
      }
    } catch (err) {
      alert(`Error toggling visibility: ${err}`);
    }
  };

  const deleteBrief = async (id: string) => {
    if (!confirm("Are you sure you want to permanently delete this research brief?")) return;
    try {
      const res = await fetch(`/api/v1/briefs/${id}`, { method: "DELETE" });
      if (res.ok) {
        window.location.hash = "";
      }
    } catch (err) {
      alert(`Error deleting brief: ${err}`);
    }
  };

  const openBrief = (id: string) => {
    window.location.hash = `#/brief/${id}`;
  };

  const switchTab = (tab: TabType) => {
    setCurrentBriefId(null);
    setCurrentBrief(null);
    setActiveTab(tab);
    if (tab === "home") {
      window.location.hash = "";
    } else {
      window.location.hash = `#/${tab}`;
    }
    if (tab === "search") {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  };

  const goHome = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    window.location.hash = "";
    setActiveTab("home");
  };

  const totalSpend = useMemo(() => {
    return briefs.reduce((acc, b) => acc + (b.cost_usd || 0), 0);
  }, [briefs]);

  // Derived filtered lists
  const savedBriefs = useMemo(() => {
    return briefs.filter((b) => savedIds.includes(b.id));
  }, [briefs, savedIds]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    briefs.forEach((b) => {
      if (b.category) set.add(b.category);
    });
    return ["all", ...Array.from(set)];
  }, [briefs]);

  const archiveBriefs = useMemo(() => {
    if (archiveCategory === "all") return briefs;
    return briefs.filter((b) => b.category.toLowerCase() === archiveCategory.toLowerCase());
  }, [briefs, archiveCategory]);

  const allTopics = useMemo(() => {
    const curated = ["AI", "productivity", "markets", "climate", "semiconductor", "governance", "deep learning"];
    const set = new Set<string>(curated);
    briefs.forEach((b) => {
      if (b.category && b.category.toLowerCase() !== "general") set.add(b.category);
      if (b.subcategory) set.add(b.subcategory);
      if (Array.isArray(b.tags)) {
        b.tags.forEach((t) => {
          if (t && t.length < 24) set.add(t);
        });
      }
    });
    return Array.from(set);
  }, [briefs]);

  const handleShare = (b: BriefSummary) => {
    const url = `${window.location.origin}/#/brief/${b.id}`;
    if (navigator.share) {
      navigator.share({ title: b.title, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url);
      alert("Brief link copied to clipboard");
    }
  };

  const operatorEmail = auth?.email || "gaurav.singh.86@gmail.com";
  const operatorInitials = getOperatorInitials(operatorEmail);

  // Profile popover state & click outside listener
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
    }
    if (showProfileMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showProfileMenu]);

  // Render Brief Card in reading-friendly blog style
  const renderBriefCard = (b: BriefSummary, index: number) => {
    const isSaved = savedIds.includes(b.id);
    const isFeatured = index === 0 && activeTab === "home";
    const readDuration = estimateReadingTime(b.summary);

    return (
      <li
        key={b.id}
        className={`blog-card ${isFeatured ? "blog-card-featured" : "blog-card-standard"}`}
        onClick={() => openBrief(b.id)}
      >
        {/* Card Header row: Category, read time, relative time, cost, actions */}
        <div className="blog-card-meta-top">
          <span className="blog-tag-badge">{b.category}</span>
          {isFeatured && <span className="blog-featured-tag">★ Latest Dispatch</span>}
          <span className="blog-dot-sep">·</span>
          <span className="blog-read-time">{readDuration}</span>
          <span className="blog-dot-sep">·</span>
          <span className="blog-rel-time">{formatRelativeTime(b.published_at)}</span>
          {b.cost_usd !== null && b.cost_usd !== undefined && (
            <span className="blog-cost-pill" title={`Estimated generation cost: $${b.cost_usd}`}>
              💰 {formatCost(b.cost_usd)}
            </span>
          )}

          <div className="blog-card-actions">
            <button
              className={`btn-icon-action ${isSaved ? "saved" : ""}`}
              onClick={(e) => toggleSave(b.id, e)}
              title={isSaved ? "Remove bookmark" : "Save bookmark"}
              aria-label="Save brief"
            >
              <IconStar filled={isSaved} />
            </button>
            <button
              className="btn-icon-action"
              onClick={(e) => {
                e.stopPropagation();
                handleShare(b);
              }}
              title="Share brief"
              aria-label="Share brief"
            >
              <IconShare />
            </button>
          </div>
        </div>

        {/* Title / Headline */}
        {isFeatured ? (
          <h2 className="blog-headline blog-headline-featured">{b.title}</h2>
        ) : (
          <h3 className="blog-headline blog-headline-standard">{b.title}</h3>
        )}

        {/* Summary Narrative Excerpt */}
        {b.summary && (
          <p className="blog-summary-excerpt">{b.summary}</p>
        )}

        {/* Card Footer: Model engine, Depth, Evidence stats, Read CTA */}
        <div className="blog-card-footer">
          <div className="blog-provenance-pills">
            {b.model && (
              <span className="badge-pill badge-model" title={`Engine: ${b.model}`}>
                ⚡ {formatModel(b.model)}
              </span>
            )}
            <span className={`badge-pill badge-depth badge-depth-${b.research_depth.toLowerCase()}`}>
              {b.research_depth.toUpperCase()}
            </span>
            <span className="blog-evidence-pill">
              {b.source_count} sources · {b.claim_count} claims
            </span>
          </div>
          <span className="blog-read-cta">
            Read investigation <IconArrowRight />
          </span>
        </div>
      </li>
    );
  };

  return (
    <div className="app-container">
      {/* Persistent Desktop Sidebar (Visible on desktop >= 900px) */}
      <aside className="desktop-sidebar" aria-label="Desktop Navigation">
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <a href="#" onClick={goHome} className="sidebar-logo-link">
              <span className="sidebar-brand-icon">🎺</span>
              <span className="sidebar-brand-title">Bugle</span>
            </a>
            <span className="brand-badge">Research</span>
          </div>
          <p className="sidebar-tagline">Autonomous Research Intelligence</p>
        </div>

        <div className="sidebar-content-body">
          <nav className="sidebar-nav">
            <button
              className={`sidebar-nav-item ${activeTab === "home" && !currentBriefId ? "active" : ""}`}
              onClick={() => switchTab("home")}
            >
              <IconHome className="sidebar-nav-icon" />
              <span className="sidebar-nav-label">Home & Feed</span>
            </button>

            <button
              className={`sidebar-nav-item ${activeTab === "search" && !currentBriefId ? "active" : ""}`}
              onClick={() => switchTab("search")}
            >
              <IconSearch className="sidebar-nav-icon" />
              <span className="sidebar-nav-label">Search Archive</span>
            </button>

            <button
              className={`sidebar-nav-item ${activeTab === "saved" && !currentBriefId ? "active" : ""}`}
              onClick={() => switchTab("saved")}
            >
              <div className="sidebar-icon-wrap">
                <IconStar filled={activeTab === "saved"} className="sidebar-nav-icon" />
              </div>
              <span className="sidebar-nav-label">Saved Bookmarks</span>
              {savedIds.length > 0 && <span className="sidebar-badge-pill">{savedIds.length}</span>}
            </button>

            <button
              className={`sidebar-nav-item ${activeTab === "archive" && !currentBriefId ? "active" : ""}`}
              onClick={() => switchTab("archive")}
            >
              <IconArchive className="sidebar-nav-icon" />
              <span className="sidebar-nav-label">Full Catalogue</span>
              <span className="sidebar-badge-muted">{briefs.length}</span>
            </button>
          </nav>

          {/* Sidebar Topics Taxonomy */}
          <div className="sidebar-section">
            <span className="sidebar-section-title">Explore Topics</span>
            <div className="sidebar-topics-grid">
              {categories.map((cat) => (
                <button
                  key={cat}
                  className={`sidebar-topic-btn ${activeTab === "archive" && archiveCategory === cat ? "active" : ""}`}
                  onClick={() => {
                    setArchiveCategory(cat);
                    switchTab("archive");
                  }}
                >
                  {cat === "all" ? "All Topics" : cat}
                </button>
              ))}
            </div>
          </div>

          {/* Sidebar System & Intelligence Metrics */}
          <div className="sidebar-status-box">
            <div className="sidebar-status-row">
              <span className="status-dot online" />
              <span className="sidebar-status-engine">Hermes Core Online</span>
            </div>
            <div className="sidebar-metrics-row">
              <div className="sidebar-metric-item">
                <span className="sidebar-metric-label">Spend</span>
                <span className="sidebar-metric-val highlight-gold">${totalSpend.toFixed(3)}</span>
              </div>
              <div className="sidebar-metric-divider" />
              <div className="sidebar-metric-item">
                <span className="sidebar-metric-label">Briefs</span>
                <span className="sidebar-metric-val">{briefs.length}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar Operator Profile Footer */}
        <div className="sidebar-profile-footer">
          <div className="sidebar-avatar">{operatorInitials}</div>
          <div className="sidebar-operator-details">
            <span className="sidebar-operator-name" title={operatorEmail}>
              {operatorEmail}
            </span>
            <span className="sidebar-operator-status">
              <span className="status-dot online" />
              {auth?.is_admin ? "Operator (Admin)" : "Public View"}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="app-main-area">
        <main className="wrap">
          {/* Mobile Header (visible on mobile < 900px, hidden on desktop) */}
          <header className="mobile-header">
            <div className="header-brand">
              <div className="brand-title-group">
                <h1 className="brand-logo">
                  <a href="#" onClick={goHome} className="brand-link">
                    🎺 Bugle
                  </a>
                </h1>
                <span className="brand-badge">Research</span>
              </div>
              <p className="brand-tagline">Autonomous Research Intelligence</p>
            </div>

            <div className="header-actions" ref={profileRef}>
              <button
                className={`operator-avatar-btn ${showProfileMenu ? "active" : ""}`}
                onClick={() => setShowProfileMenu((prev) => !prev)}
                aria-label={`Operator profile: ${operatorEmail}`}
                title={`Operator: ${operatorEmail} (${auth?.is_admin ? "Admin" : "Public"})`}
              >
                <span className="avatar-initials">{operatorInitials}</span>
                <span className="avatar-status-dot online" />
              </button>

              {showProfileMenu && (
                <div className="profile-dropdown-card">
                  <div className="profile-dropdown-header">
                    <div className="dropdown-avatar">{operatorInitials}</div>
                    <div className="dropdown-meta">
                      <span className="dropdown-email" title={operatorEmail}>
                        {operatorEmail}
                      </span>
                      <span className="dropdown-role">
                        <span className="status-dot online" />
                        {auth?.is_admin ? "Operator (Admin)" : "Public View"}
                      </span>
                    </div>
                    <button
                      className="dropdown-close-btn"
                      onClick={() => setShowProfileMenu(false)}
                      aria-label="Close menu"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Aggregate Stat Grid (Moved from home feed for reading clarity) */}
                  <div className="profile-stats-grid">
                    <div className="profile-stat-box">
                      <span className="profile-stat-number">{briefs.length}</span>
                      <span className="profile-stat-label">Briefs</span>
                    </div>
                    <div className="profile-stat-box highlight-spend">
                      <span className="profile-stat-number">${totalSpend.toFixed(3)}</span>
                      <span className="profile-stat-label">Total Spend</span>
                    </div>
                    <div className="profile-stat-box">
                      <span className="profile-stat-number">{savedIds.length}</span>
                      <span className="profile-stat-label">Saved</span>
                    </div>
                  </div>

                  <div className="profile-dropdown-body">
                    <div className="dropdown-row">
                      <span className="dropdown-label">Engine</span>
                      <span className="dropdown-val">⚡ Hermes Agentic Core</span>
                    </div>
                    <div className="dropdown-row">
                      <span className="dropdown-label">Pipeline</span>
                      <span className="dropdown-val">Multi-source Claims Audit</span>
                    </div>
                    <div className="dropdown-row">
                      <span className="dropdown-label">Network</span>
                      <span className="dropdown-val">Cloudflare Access Tunnel</span>
                    </div>
                  </div>

                  <div className="profile-quick-nav">
                    <button
                      className="profile-nav-action-btn"
                      onClick={() => {
                        setShowProfileMenu(false);
                        switchTab("search");
                      }}
                    >
                      <IconSearch className="action-icon" /> Search Topics & Tags
                    </button>
                    <button
                      className="profile-nav-action-btn"
                      onClick={() => {
                        setShowProfileMenu(false);
                        switchTab("saved");
                      }}
                    >
                      <IconStar filled={false} className="action-icon" /> Saved Bookmarks ({savedIds.length})
                    </button>
                    <button
                      className="profile-nav-action-btn"
                      onClick={() => {
                        setShowProfileMenu(false);
                        switchTab("archive");
                      }}
                    >
                      <IconArchive className="action-icon" /> Research Archive
                    </button>
                  </div>

                  <div className="profile-dropdown-footer">
                    <span>Signed in via Cloudflare Access</span>
                  </div>
                </div>
              )}
            </div>
          </header>

          {/* Desktop Top Header Bar (visible on desktop >= 900px) */}
          <div className="desktop-top-bar">
            <div className="desktop-page-info">
              <h2 className="desktop-page-title">
                {currentBriefId
                  ? "Research Investigation"
                  : activeTab === "home"
                  ? "Intelligence Feed"
                  : activeTab === "search"
                  ? "Archive Search"
                  : activeTab === "saved"
                  ? "Saved Bookmarks"
                  : "Research Catalogue"}
              </h2>
              <p className="desktop-page-desc">
                {currentBriefId
                  ? "Detailed evidence synthesis and claims verification audit"
                  : activeTab === "home"
                  ? "Latest autonomous research briefs synthesized by Hermes engine"
                  : activeTab === "search"
                  ? "Semantic keyword and taxonomy discovery across all investigations"
                  : activeTab === "saved"
                  ? "Your saved investigations bookmarked for quick reference"
                  : "Comprehensive archive catalogued by category domain"}
              </p>
            </div>

            <div className="desktop-top-actions">
              <div className="desktop-auth-chip" title={`Authenticated as ${operatorEmail}`}>
                <span className="status-dot online" />
                <span className="desktop-user-email">{operatorEmail}</span>
                <span className="desktop-user-badge">{auth?.is_admin ? "Operator" : "Public"}</span>
              </div>
            </div>
          </div>

          {error && <div className="error-banner">{error}</div>}

        {/* VIEW: Single Brief Detail */}
        {currentBriefId ? (
          <article className="brief-detail-view">
            <div className="sticky-back-bar">
              <button className="back-btn" onClick={goHome}>
                ← Back to all investigations
              </button>
              {currentBrief && (
                <button
                  className={`btn-icon-action ${savedIds.includes(currentBrief.id) ? "saved" : ""}`}
                  onClick={() => toggleSave(currentBrief.id)}
                  title={savedIds.includes(currentBrief.id) ? "Bookmarked" : "Bookmark this brief"}
                >
                  <IconStar filled={savedIds.includes(currentBrief.id)} />
                </button>
              )}
            </div>

            {loading && <div className="loading-state">Loading research brief…</div>}

            {currentBrief && (
              <div className="detail-layout">
                {/* Left Column: Reading Synthesis & Full Markdown */}
                <div className="detail-main-column">
                  <header className="detail-header">
                    <div className="badge-row">
                      {currentBrief.cost_usd !== null && currentBrief.cost_usd !== undefined && (
                        <span className="badge badge-cost" title={`Cost: $${currentBrief.cost_usd}`}>
                          💰 {formatCost(currentBrief.cost_usd)}
                        </span>
                      )}
                      {currentBrief.duration_seconds && (
                        <span className="badge badge-duration" title={`Duration: ${currentBrief.duration_seconds}s`}>
                          ⏱️ {formatDuration(currentBrief.duration_seconds)}
                        </span>
                      )}
                      {currentBrief.model && (
                        <span className="badge badge-model" title={`Model: ${currentBrief.model}`}>
                          ⚡ {formatModel(currentBrief.model)}
                        </span>
                      )}
                      <span className="badge badge-category">
                        {currentBrief.category}
                        {currentBrief.subcategory ? ` / ${currentBrief.subcategory}` : ""}
                      </span>
                      <span className={`badge badge-depth-${currentBrief.research_depth}`}>
                        {currentBrief.research_depth} Depth
                      </span>
                      <span className="badge badge-category">
                        {currentBrief.confidence} Confidence
                      </span>
                      <span className={`badge badge-${currentBrief.visibility}`}>
                        {currentBrief.visibility === "private" ? "🔒 Private" : "🌐 Public"}
                      </span>
                    </div>

                    <h2 className="detail-title">{currentBrief.title}</h2>
                  </header>

                  {/* Executive Summary Callout */}
                  {currentBrief.summary && (
                    <section className="executive-summary-box">
                      <div className="summary-heading">Executive Synthesis</div>
                      <p className="summary-text">{currentBrief.summary}</p>
                    </section>
                  )}

                  {/* Main Report Body (Markdown) */}
                  <section className="markdown-body">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        a: ({ node, ...props }) => (
                          <a target="_blank" rel="noopener noreferrer" {...props} />
                        ),
                      }}
                    >
                      {currentBrief.content_markdown || "*No detailed report content provided.*"}
                    </ReactMarkdown>
                  </section>
                </div>

                {/* Right Column: Sticky Provenance & Evidence Audit Panel */}
                <aside className="detail-audit-column">
                  {/* Provenance Metadata Card */}
                  <section className="provenance-card">
                    <div className="provenance-card-title">Investigation Provenance</div>
                    <div className="provenance-grid">
                      <div className="provenance-item">
                        <span className="provenance-label">Research Type</span>
                        <span className="provenance-value">{currentBrief.research_type}</span>
                      </div>
                      <div className="provenance-item">
                        <span className="provenance-label">Evidence Base</span>
                        <span className="provenance-value">
                          {currentBrief.source_count} Sources · {currentBrief.claim_count} Claims
                        </span>
                      </div>
                      {currentBrief.cost_usd !== null && currentBrief.cost_usd !== undefined && (
                        <div className="provenance-item">
                          <span className="provenance-label">Generation Cost</span>
                          <span className="provenance-value highlight-success">
                            💰 ${currentBrief.cost_usd.toFixed(4)} USD
                          </span>
                        </div>
                      )}
                      {currentBrief.duration_seconds && (
                        <div className="provenance-item">
                          <span className="provenance-label">Duration</span>
                          <span className="provenance-value">
                            ⏱️ {formatDuration(currentBrief.duration_seconds)} ({currentBrief.duration_seconds}s)
                          </span>
                        </div>
                      )}
                      {currentBrief.model && (
                        <div className="provenance-item">
                          <span className="provenance-label">Model Engine</span>
                          <span className="provenance-value font-mono">
                            ⚡ {currentBrief.model}
                          </span>
                        </div>
                      )}
                      {currentBrief.token_usage && (
                        <div className="provenance-item">
                          <span className="provenance-label">Token Breakdown</span>
                          <span className="provenance-value font-mono">
                            {(currentBrief.token_usage.input || 0).toLocaleString()} in / {(currentBrief.token_usage.output || 0).toLocaleString()} out
                            {currentBrief.total_tokens ? ` (${currentBrief.total_tokens.toLocaleString()} total)` : ""}
                          </span>
                        </div>
                      )}
                      <div className="provenance-item">
                        <span className="provenance-label">Published</span>
                        <span className="provenance-value">
                          {formatTime(currentBrief.published_at)}
                        </span>
                      </div>
                      {currentBrief.job_id && (
                        <div className="provenance-item">
                          <span className="provenance-label">Investigation ID</span>
                          <span className="provenance-value font-mono">
                            {currentBrief.job_id}
                          </span>
                        </div>
                      )}
                    </div>
                  </section>

                  {/* Verified Claims & Evidence Mapping */}
                  {currentBrief.claims && currentBrief.claims.length > 0 && (
                    <section className="claims-section">
                      <h3 className="section-title">
                        <span>Claims & Verification Audit</span>
                        <span className="title-count">({currentBrief.claims.length})</span>
                      </h3>
                      <div className="claims-grid">
                        {currentBrief.claims.map((claim) => (
                          <div key={claim.id} className="claim-card">
                            <div className="claim-header">
                              <span className={`claim-status ${claim.status}`}>{claim.status}</span>
                              <span className="claim-statement">{claim.statement}</span>
                            </div>
                            {claim.evidence_summary && (
                              <div className="claim-evidence">{claim.evidence_summary}</div>
                            )}
                            {claim.source_ids.length > 0 && (
                              <div className="claim-sources-ref">
                                <span>Supported by:</span>
                                {claim.source_ids.map((sid) => {
                                  const s = currentBrief.sources.find((src) => src.id === sid);
                                  return (
                                    <span key={sid} className="tag-pill" title={s?.title || `Source #${sid}`}>
                                      {s?.publisher || `Source #${sid}`}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Primary Sources Archive */}
                  {currentBrief.sources && currentBrief.sources.length > 0 && (
                    <section className="sources-section">
                      <h3 className="section-title">
                        <span>Primary Evidence & Sources</span>
                        <span className="title-count">({currentBrief.sources.length})</span>
                      </h3>
                      <div className="sources-list">
                        {currentBrief.sources.map((source) => (
                          <div key={source.id} className="source-item">
                            <div className="source-top">
                              <a
                                href={source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="source-link"
                              >
                                {source.title || source.url} ↗
                              </a>
                              <span className="badge badge-category">{source.source_type}</span>
                            </div>
                            <div className="source-meta">
                              <span>
                                <strong>Publisher:</strong> {source.publisher || "Unknown"}
                              </span>
                              {source.author && (
                                <span>
                                  <strong>Author:</strong> {source.author}
                                </span>
                              )}
                              <span>
                                <strong>Reliability:</strong> {source.reliability}
                              </span>
                              {source.published_at && (
                                <span>
                                  <strong>Published:</strong> {formatTime(source.published_at)}
                                </span>
                              )}
                            </div>
                            {source.relevance && (
                              <div className="source-relevance">{source.relevance}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Operator Admin Controls */}
                  {auth?.is_admin && (
                    <div className="admin-actions">
                      <button className="btn-secondary" onClick={() => toggleVisibility(currentBrief)}>
                        Toggle Visibility to {currentBrief.visibility === "private" ? "Public" : "Private"}
                      </button>
                      <button className="btn-danger" onClick={() => deleteBrief(currentBrief.id)}>
                        Delete Brief
                      </button>
                    </div>
                  )}
                </aside>
              </div>
            )}
          </article>
        ) : (
          /* MAIN TABS VIEW CONTAINER */
          <div className="tabs-container">
            {/* TAB: HOME */}
            {activeTab === "home" && (
              <section className="home-view">
                {/* Desktop-only Overview: Persistent Search, Quick-Nav Tiles, and Aggregate Stat Cards */}
                <div className="desktop-only-overview">
                  <div className="search-section">
                    <div className="search-input-wrapper">
                      <span className="search-icon">
                        <IconSearch />
                      </span>
                      <input
                        ref={searchInputRef}
                        type="text"
                        className="search-input"
                        placeholder="Search research briefs..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                      {search ? (
                        <button className="search-clear-btn" onClick={() => setSearch("")}>
                          ✕
                        </button>
                      ) : (
                        <span className="search-kbd-chip">⌘ K</span>
                      )}
                    </div>

                    {/* Suggestion Chips */}
                    <div className="suggestion-chips-row">
                      <span className="suggestion-label">Try:</span>
                      {SUGGESTIONS.map((s) => (
                        <button
                          key={s}
                          className={`chip-button ${search.toLowerCase() === s.toLowerCase() ? "active" : ""}`}
                          onClick={() => {
                            setSearch(s);
                            recordSearch(s);
                          }}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 4 Quick-Nav Navigation Tiles */}
                  <div className="quick-nav-grid">
                    <div
                      className="quick-nav-tile tile-papers"
                      onClick={() => {
                        setSearch("paper");
                        switchTab("search");
                      }}
                    >
                      <div className="tile-icon-box icon-papers">
                        <IconPaper />
                      </div>
                      <div className="tile-content">
                        <h4 className="tile-title">Papers</h4>
                        <p className="tile-subtitle">Research papers</p>
                      </div>
                    </div>

                    <div
                      className="quick-nav-tile tile-briefs"
                      onClick={() => switchTab("archive")}
                    >
                      <div className="tile-icon-box icon-briefs">
                        <IconBriefs />
                      </div>
                      <div className="tile-content">
                        <h4 className="tile-title">Briefs</h4>
                        <p className="tile-subtitle">Summaries & insights</p>
                      </div>
                    </div>

                    <div
                      className="quick-nav-tile tile-saved"
                      onClick={() => switchTab("saved")}
                    >
                      <div className="tile-icon-box icon-saved">
                        <IconStar filled={false} />
                      </div>
                      <div className="tile-content">
                        <h4 className="tile-title">Saved</h4>
                        <p className="tile-subtitle">Your bookmarks ({savedIds.length})</p>
                      </div>
                    </div>

                    <div
                      className="quick-nav-tile tile-history"
                      onClick={() => switchTab("search")}
                    >
                      <div className="tile-icon-box icon-history">
                        <IconHistory />
                      </div>
                      <div className="tile-content">
                        <h4 className="tile-title">History</h4>
                        <p className="tile-subtitle">Past searches</p>
                      </div>
                    </div>
                  </div>

                  {/* Aggregate Stat Cards */}
                  <div className="stat-cards-grid">
                    <div className="stat-card">
                      <div className="stat-card-icon icon-briefs-stat">
                        <IconPaper />
                      </div>
                      <div className="stat-card-content">
                        <span className="stat-card-value">{briefs.length} Briefs</span>
                        <span className="stat-card-label">Total researched</span>
                      </div>
                    </div>

                    <div className="stat-card">
                      <div className="stat-card-icon icon-coins-stat">
                        <IconCoins />
                      </div>
                      <div className="stat-card-content">
                        <span className="stat-card-value">${totalSpend.toFixed(3)}</span>
                        <span className="stat-card-label">Total Spend</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section Header Row (Visible on Desktop) */}
                <div className="section-header-row feed-header-row">
                  <div>
                    <h2 className="section-heading">Recent Investigations</h2>
                    <p className="section-subheading">Latest research outputs synthesized by Hermes</p>
                  </div>
                  <button className="view-all-link" onClick={() => switchTab("archive")}>
                    View all archive →
                  </button>
                </div>

                {/* Feed Cards List */}
                {loading && <div className="loading-state">Searching research archive…</div>}

                {!loading && briefs.length === 0 && !error && (
                  <div className="empty-state-card">
                    <p className="empty-title">No investigations found</p>
                    <p className="empty-desc">
                      Send a research topic to Hermes to populate your Bugle archive.
                    </p>
                  </div>
                )}

                <ul className="blog-feed-list">
                  {briefs.map((b, idx) => renderBriefCard(b, idx))}
                </ul>
              </section>
            )}

            {/* TAB: SEARCH */}
            {activeTab === "search" && (
              <section className="search-tab-view">
                <div className="search-tab-header">
                  <div className="search-header-text">
                    <h2 className="section-heading">Search & Explore</h2>
                    <p className="section-subheading">
                      Explore curated topics, claims, tags, and synthesized research briefs
                    </p>
                  </div>

                  {/* Compact Sleek Search Input */}
                  <div className="search-input-wrapper compact-search-bar">
                    <span className="search-icon">
                      <IconSearch />
                    </span>
                    <input
                      ref={searchInputRef}
                      type="text"
                      className="search-input"
                      placeholder="Search keywords, topics, claims..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && search.trim()) {
                          recordSearch(search.trim());
                        }
                      }}
                    />
                    {search ? (
                      <button
                        className="search-clear-btn"
                        onClick={() => setSearch("")}
                        aria-label="Clear search"
                        title="Clear search"
                      >
                        ✕
                      </button>
                    ) : (
                      <span className="search-kbd-chip">⌘ K</span>
                    )}
                  </div>

                  {/* Topic & Tag Filter Chips */}
                  <div className="search-topics-bar">
                    <span className="search-topics-label">Browse Topics:</span>
                    <div className="search-topics-chips">
                      {allTopics.map((tag) => {
                        const isSelected = search.toLowerCase() === tag.toLowerCase();
                        return (
                          <button
                            key={tag}
                            className={`search-topic-chip ${isSelected ? "active" : ""}`}
                            onClick={() => {
                              const nextVal = isSelected ? "" : tag;
                              setSearch(nextVal);
                              if (nextVal) recordSearch(nextVal);
                            }}
                          >
                            #{tag}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Recent Searches Strip */}
                  {recentSearches.length > 0 && !search && (
                    <div className="search-recent-strip">
                      <div className="recent-strip-header">
                        <span className="recent-strip-label">
                          <IconHistory className="recent-strip-icon" /> Recent:
                        </span>
                        <button
                          className="clear-history-link"
                          onClick={() => {
                            setRecentSearches([]);
                            localStorage.removeItem("bugle_recent_searches");
                          }}
                        >
                          Clear
                        </button>
                      </div>
                      <div className="recent-strip-chips">
                        {recentSearches.map((term) => (
                          <button
                            key={term}
                            className="recent-strip-chip"
                            onClick={() => {
                              setSearch(term);
                              recordSearch(term);
                            }}
                          >
                            {term}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Results Status & Count Bar */}
                <div className="search-results-bar">
                  <span className="search-results-count">
                    {search ? (
                      <>
                        Showing investigations for <strong>"{search}"</strong> ({briefs.length}{" "}
                        {briefs.length === 1 ? "brief" : "briefs"})
                      </>
                    ) : (
                      <>All Investigations ({briefs.length})</>
                    )}
                  </span>
                  {search && (
                    <button className="reset-search-link" onClick={() => setSearch("")}>
                      Reset search
                    </button>
                  )}
                </div>

                {loading && <div className="loading-state">Searching research archive…</div>}

                {!loading && briefs.length === 0 && (
                  <div className="empty-state-card">
                    <p className="empty-title">No matching investigations</p>
                    <p className="empty-desc">
                      Try adjusting your keywords, tapping a topic chip above, or resetting the search.
                    </p>
                    {search && (
                      <button className="btn-secondary" onClick={() => setSearch("")}>
                        Clear search
                      </button>
                    )}
                  </div>
                )}

                <ul className="blog-feed-list">
                  {briefs.map((b, idx) => renderBriefCard(b, idx))}
                </ul>
              </section>
            )}

            {/* TAB: SAVED BOOKMARKS */}
            {activeTab === "saved" && (
              <section className="saved-tab-view">
                <div className="section-header-row">
                  <div>
                    <h2 className="section-heading">Saved Bookmarks</h2>
                    <p className="section-subheading">
                      {savedBriefs.length} bookmarked {savedBriefs.length === 1 ? "investigation" : "investigations"}
                    </p>
                  </div>
                </div>

                {savedBriefs.length === 0 ? (
                  <div className="empty-state-card">
                    <div className="empty-icon-gold">
                      <IconStar filled={false} />
                    </div>
                    <p className="empty-title">No saved bookmarks yet</p>
                    <p className="empty-desc">
                      Tap the star icon on any research brief to save it here for offline reading or quick reference.
                    </p>
                    <button className="btn-secondary" onClick={() => switchTab("home")}>
                      Explore Investigations
                    </button>
                  </div>
                ) : (
                  <ul className="blog-feed-list">
                    {savedBriefs.map((b, idx) => renderBriefCard(b, idx))}
                  </ul>
                )}
              </section>
            )}

            {/* TAB: ARCHIVE */}
            {activeTab === "archive" && (
              <section className="archive-tab-view">
                <div className="section-header-row">
                  <div>
                    <h2 className="section-heading">Research Archive</h2>
                    <p className="section-subheading">
                      Comprehensive catalogue · {archiveBriefs.length} records · ${totalSpend.toFixed(3)} spent
                    </p>
                  </div>
                </div>

                {/* Category taxonomy pills */}
                <div className="category-filter-bar">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      className={`cat-filter-btn ${archiveCategory === cat ? "active" : ""}`}
                      onClick={() => setArchiveCategory(cat)}
                    >
                      {cat === "all" ? "All Categories" : cat}
                    </button>
                  ))}
                </div>

                {archiveBriefs.length === 0 ? (
                  <div className="empty-state-card">
                    <p className="empty-title">No briefs in category</p>
                    <p className="empty-desc">Try choosing another category or clearing filters.</p>
                  </div>
                ) : (
                  <ul className="blog-feed-list">
                    {archiveBriefs.map((b, idx) => renderBriefCard(b, idx))}
                  </ul>
                )}
              </section>
            )}
          </div>
        )}
      </main>
    </div>

      {/* Persistent Mobile Bottom Navigation Bar */}
      <nav className="mobile-bottom-nav" aria-label="Bottom Navigation">
        <button
          className={`bottom-nav-item ${activeTab === "home" && !currentBriefId ? "active" : ""}`}
          onClick={() => switchTab("home")}
          aria-label="Home"
        >
          <IconHome className="nav-svg" />
          <span className="nav-label">Home</span>
        </button>

        <button
          className={`bottom-nav-item ${activeTab === "search" && !currentBriefId ? "active" : ""}`}
          onClick={() => switchTab("search")}
          aria-label="Search"
        >
          <IconSearch className="nav-svg" />
          <span className="nav-label">Search</span>
        </button>

        <button
          className={`bottom-nav-item ${activeTab === "saved" && !currentBriefId ? "active" : ""}`}
          onClick={() => switchTab("saved")}
          aria-label="Saved"
        >
          <div className="nav-icon-wrapper">
            <IconStar filled={activeTab === "saved"} className="nav-svg" />
            {savedIds.length > 0 && <span className="nav-badge-count">{savedIds.length}</span>}
          </div>
          <span className="nav-label">Saved</span>
        </button>

        <button
          className={`bottom-nav-item ${activeTab === "archive" && !currentBriefId ? "active" : ""}`}
          onClick={() => switchTab("archive")}
          aria-label="Archive"
        >
          <IconArchive className="nav-svg" />
          <span className="nav-label">Archive</span>
        </button>
      </nav>
    </div>
);
}