import { Component, type ErrorInfo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type AuthInfo, type BriefDetail, type BriefSummary, type Taxonomies } from "./api";
import {
  IconArchive,
  IconDatabase,
  IconHome,
  IconSearch,
  IconStar,
  IconUser,
} from "./components/Icons";
import { SystemHealthModal } from "./components/SystemHealthModal";
import { formatModel, getOperatorInitials } from "./format";
import { ArchivePage } from "./pages/ArchivePage";
import { BriefDetailPage } from "./pages/BriefDetailPage";
import { FeedPage } from "./pages/FeedPage";
import { ProfilePage } from "./pages/ProfilePage";
import { SavedPage } from "./pages/SavedPage";
import { SearchPage } from "./pages/SearchPage";

type TabType = "home" | "search" | "saved" | "archive" | "profile";

const SUGGESTIONS = ["AI", "productivity", "markets", "climate", "semiconductor"];

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Bugle UI error", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="app-error-state">
          <h1>Bugle needs a refresh</h1>
          <p>This view encountered an unexpected error.</p>
          <button className="btn-secondary" onClick={() => window.location.reload()}>
            Reload Bugle
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}

function AppContent() {
  const [activeTab, setActiveTab] = useState<TabType>("home");
  const [currentBriefId, setCurrentBriefId] = useState<string | null>(null);
  const [briefs, setBriefs] = useState<BriefSummary[]>([]);
  const [search, setSearch] = useState("");
  const [archiveCategory, setArchiveCategory] = useState<string>("all");
  const [auth, setAuth] = useState<AuthInfo | null>(null);
  const [taxonomies, setTaxonomies] = useState<Taxonomies | null>(null);
  const [showHealthModal, setShowHealthModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Saved bookmarks state
  const [savedIds, setSavedIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("bugle_saved_briefs");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Recent searches state
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("bugle_recent_searches");
      return stored ? JSON.parse(stored) : ["agentic reasoning", "semiconductor", "deepseek"];
    } catch {
      return ["agentic reasoning", "semiconductor", "deepseek"];
    }
  });

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

  // Keyboard shortcut listener: ⌘ K / / to jump to search, Escape to close profile menu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        switchTab("search");
        setTimeout(() => searchInputRef.current?.focus(), 50);
      } else if (
        e.key === "/" &&
        !(
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement ||
          (e.target as HTMLElement)?.isContentEditable
        )
      ) {
        e.preventDefault();
        if (activeTab !== "home" && activeTab !== "search") {
          switchTab("home");
        }
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab]);

  // Handle URL hash routing
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash;
      const [route, queryString = ""] = hash.split("?");
      const params = new URLSearchParams(queryString);
      if (route.startsWith("#/brief/")) {
        const id = route.replace("#/brief/", "").trim();
        setCurrentBriefId(id);
      } else {
        setCurrentBriefId(null);
        if (route === "#/search") {
          setActiveTab("search");
          setSearch(params.get("q") || "");
        } else if (route === "#/saved") {
          setActiveTab("saved");
        } else if (route === "#/archive") {
          setActiveTab("archive");
          setArchiveCategory(params.get("category") || "all");
        } else if (route === "#/profile") {
          setActiveTab("profile");
        } else {
          setActiveTab("home");
        }
      }
    };
    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  // Sync route query params to hash
  useEffect(() => {
    if (currentBriefId) return;
    if (activeTab === "search") {
      const query = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : "";
      window.history.replaceState(null, "", `#/${activeTab}${query}`);
    } else if (activeTab === "archive") {
      const query = archiveCategory !== "all" ? `?category=${encodeURIComponent(archiveCategory)}` : "";
      window.history.replaceState(null, "", `#/${activeTab}${query}`);
    } else if (activeTab === "profile") {
      window.history.replaceState(null, "", `#/profile`);
    }
  }, [activeTab, archiveCategory, currentBriefId, search]);

  // Fetch Auth context
  useEffect(() => {
    api
      .getAuth()
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
  const loadBriefs = useCallback(async (query: string = "", signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getBriefs({ search: query }, signal);
      setBriefs(Array.isArray(data.briefs) ? data.briefs : []);
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : String(e));
      setBriefs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load Taxonomies
  const loadTaxonomies = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await api.getTaxonomies(signal);
      setTaxonomies(data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadTaxonomies();
  }, [loadTaxonomies]);

  // Debounced search
  useEffect(() => {
    if (currentBriefId) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      loadBriefs(search, controller.signal);
      if (search.trim().length >= 3) {
        recordSearch(search);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, currentBriefId, loadBriefs]);

  // Decoupled refresh via CustomEvent
  useEffect(() => {
    const handleRefresh = () => {
      void loadBriefs(search);
      void loadTaxonomies();
    };
    window.addEventListener("bugle:refresh", handleRefresh);
    return () => window.removeEventListener("bugle:refresh", handleRefresh);
  }, [loadBriefs, loadTaxonomies, search]);

  const openBrief = (id: string) => {
    window.location.hash = `#/brief/${id}`;
  };

  const goHome = () => {
    setCurrentBriefId(null);
    setActiveTab("home");
    setSearch("");
    window.location.hash = "";
  };

  const switchTab = (tab: TabType) => {
    setCurrentBriefId(null);
    setActiveTab(tab);
    if (tab === "home") {
      window.location.hash = "";
    } else {
      window.location.hash = `#/${tab}`;
    }
  };

  const handleShare = async (b: BriefSummary) => {
    const shareUrl = `${window.location.origin}/#/brief/${b.id}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: b.title,
          text: b.summary,
          url: shareUrl,
        });
      } catch {
        // Fallback to clipboard
        void navigator.clipboard.writeText(shareUrl);
        alert("Link copied to clipboard!");
      }
    } else {
      void navigator.clipboard.writeText(shareUrl);
      alert("Link copied to clipboard!");
    }
  };

  // Derive categories & filtered lists
  const categories = useMemo(() => {
    const cats = taxonomies?.categories.map((c) => c.name) || [];
    const unique = Array.from(new Set(cats));
    return ["all", ...unique];
  }, [taxonomies]);

  const savedBriefs = useMemo(() => {
    return briefs.filter((b) => savedIds.includes(b.id));
  }, [briefs, savedIds]);

  const archiveBriefs = useMemo(() => {
    if (archiveCategory === "all") return briefs;
    return briefs.filter(
      (b) => b.category.toLowerCase() === archiveCategory.toLowerCase()
    );
  }, [briefs, archiveCategory]);

  const topTopics = useMemo(() => {
    if (taxonomies?.tags && taxonomies.tags.length > 0) {
      return taxonomies.tags.slice(0, 6).map((t) => t.name);
    }
    const freq: Record<string, number> = {};
    for (const b of briefs) {
      for (const t of b.tags || []) {
        freq[t] = (freq[t] || 0) + 1;
      }
    }
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([tag]) => tag);
  }, [taxonomies, briefs]);

  const totalSpend = useMemo(() => {
    if (taxonomies?.total_spend_usd) return taxonomies.total_spend_usd;
    return briefs.reduce((acc, b) => acc + (b.cost_usd || 0), 0);
  }, [taxonomies, briefs]);

  const operatorEmail = auth?.email || "gaurav.singh.86@gmail.com";
  const operatorInitials = getOperatorInitials(operatorEmail);

  const modelInfo = useMemo(() => {
    const briefWithModel = briefs.find((b) => Boolean(b.model));
    const raw = briefWithModel?.model || "deepseek/deepseek-v4-flash-0731";
    const formatted = formatModel(raw) || raw;
    const provider = raw.includes("/") ? raw.split("/")[0] : "hermes";
    return { raw, formatted, provider };
  }, [briefs]);

  return (
    <div className="app-container">
      {/* Persistent Desktop Sidebar */}
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
        </div>

        {/* Sidebar Operator Profile Footer */}
        <div className="sidebar-profile-footer">
          <button
            className={`sidebar-profile-btn ${activeTab === "profile" && !currentBriefId ? "active" : ""}`}
            onClick={() => switchTab("profile")}
            aria-label={`Open profile: ${operatorEmail}`}
          >
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
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="app-main-area">
        <main className={`wrap ${currentBriefId ? "in-detail-view" : ""}`}>
          {/* Mobile Header (Hidden in detail view so back bar docks cleanly at top) */}
          {!currentBriefId && (
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
            </header>
          )}

          {/* Desktop Top Header Bar (Shown on top-level tabs) */}
          {!currentBriefId && (
            <div className="desktop-top-bar">
              <div className="desktop-page-info">
                <h2 className="desktop-page-title">
                  {activeTab === "home"
                    ? "Intelligence Feed"
                    : activeTab === "search"
                    ? "Archive Search"
                    : activeTab === "saved"
                    ? "Saved Bookmarks"
                    : activeTab === "archive"
                    ? "Research Catalogue"
                    : "Operator Profile & System"}
                </h2>
                <p className="desktop-page-desc">
                  {activeTab === "home"
                    ? "Latest autonomous research briefs synthesized by Hermes engine"
                    : activeTab === "search"
                    ? "Semantic keyword and taxonomy discovery across all investigations"
                    : activeTab === "saved"
                    ? "Your saved investigations bookmarked for quick reference"
                    : activeTab === "archive"
                    ? "Comprehensive archive catalogued by category domain"
                    : "System metrics, AI engine configuration & research spend analytics"}
                </p>
              </div>

              <div className="desktop-top-actions">
                <button
                  className="btn-icon-action"
                  onClick={() => setShowHealthModal(true)}
                  title="View Database & System Health"
                  aria-label="View Database & System Health"
                >
                  <IconDatabase />
                </button>
              </div>
            </div>
          )}

          {error && <div className="error-banner">{error}</div>}

          {/* VIEW: Single Brief Detail or Tabs */}
          {currentBriefId ? (
            <BriefDetailPage
              briefId={currentBriefId}
              onBack={goHome}
              savedIds={savedIds}
              onToggleSave={toggleSave}
              isAdmin={auth?.is_admin || false}
              onVisibilityToggled={(updated) => {
                setBriefs((prev) =>
                  prev.map((b) => (b.id === updated.id ? { ...b, visibility: updated.visibility } : b))
                );
                window.dispatchEvent(new CustomEvent("bugle:refresh"));
              }}
              onBriefDeleted={(id) => {
                setBriefs((prev) => prev.filter((b) => b.id !== id));
                window.location.hash = "";
                window.dispatchEvent(new CustomEvent("bugle:refresh"));
              }}
            />
          ) : (
            <div className="tabs-container">
              {activeTab === "home" && (
                <FeedPage
                  briefs={briefs}
                  loading={loading}
                  error={error}
                  search={search}
                  onSearchChange={setSearch}
                  suggestions={SUGGESTIONS}
                  savedIds={savedIds}
                  onOpenBrief={openBrief}
                  onToggleSave={toggleSave}
                  onShare={handleShare}
                  onRecordSearch={recordSearch}
                  searchInputRef={searchInputRef}
                />
              )}

              {activeTab === "search" && (
                <SearchPage
                  briefs={briefs}
                  loading={loading}
                  search={search}
                  onSearchChange={setSearch}
                  onRecordSearch={recordSearch}
                  topTopics={topTopics}
                  recentSearches={recentSearches}
                  onClearRecentSearches={() => {
                    setRecentSearches([]);
                    localStorage.removeItem("bugle_recent_searches");
                  }}
                  savedIds={savedIds}
                  onOpenBrief={openBrief}
                  onToggleSave={toggleSave}
                  onShare={handleShare}
                  searchInputRef={searchInputRef}
                />
              )}

              {activeTab === "saved" && (
                <SavedPage
                  savedBriefs={savedBriefs}
                  savedIds={savedIds}
                  onOpenBrief={openBrief}
                  onToggleSave={toggleSave}
                  onShare={handleShare}
                  onExplore={() => switchTab("home")}
                />
              )}

              {activeTab === "archive" && (
                <ArchivePage
                  archiveBriefs={archiveBriefs}
                  categories={categories}
                  archiveCategory={archiveCategory}
                  onSelectCategory={setArchiveCategory}
                  totalSpend={totalSpend}
                  savedIds={savedIds}
                  onOpenBrief={openBrief}
                  onToggleSave={toggleSave}
                  onShare={handleShare}
                />
              )}

              {activeTab === "profile" && (
                <ProfilePage
                  auth={auth}
                  modelInfo={modelInfo}
                  totalSpend={totalSpend}
                  briefsCount={briefs.length}
                  savedCount={savedIds.length}
                  categoriesCount={Math.max(1, categories.length - 1)}
                  topTopics={topTopics}
                  recentSearches={recentSearches}
                  onClearRecentSearches={() => {
                    setRecentSearches([]);
                    localStorage.removeItem("bugle_recent_searches");
                  }}
                  onOpenHealthModal={() => setShowHealthModal(true)}
                  onSwitchTab={switchTab}
                />
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

        <button
          className={`bottom-nav-item ${activeTab === "profile" && !currentBriefId ? "active" : ""}`}
          onClick={() => switchTab("profile")}
          aria-label="Profile"
        >
          <IconUser className="nav-svg" />
          <span className="nav-label">Profile</span>
        </button>
      </nav>

      {/* System Health Modal */}
      <SystemHealthModal
        isOpen={showHealthModal}
        onClose={() => setShowHealthModal(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AppContent />
    </AppErrorBoundary>
  );
}
