import { useCallback, useEffect, useState } from "react";
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
  research_started_at: string | null;
  research_completed_at: string | null;
  sources: Source[];
  claims: Claim[];
};

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

export default function App() {
  const [auth, setAuth] = useState<AuthInfo | null>(null);
  const [briefs, setBriefs] = useState<BriefSummary[]>([]);
  const [currentBriefId, setCurrentBriefId] = useState<string | null>(null);
  const [currentBrief, setCurrentBrief] = useState<BriefDetail | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Parse URL hash for routing: #/brief/:id
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash;
      if (hash.startsWith("#/brief/")) {
        const id = hash.replace("#/brief/", "").trim();
        setCurrentBriefId(id);
      } else {
        setCurrentBriefId(null);
        setCurrentBrief(null);
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
          email: null,
          is_admin: false,
          is_service: false,
          public_enabled: false,
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

  const goHome = () => {
    window.location.hash = "";
  };

  return (
    <main className="wrap">
      {/* Header */}
      <header className="app-header">
        <div>
          <h1 className="brand-title">
            <a href="#" onClick={goHome} className="brand-link">
              🎺 Bugle
            </a>
          </h1>
          <p className="tagline">Personal Research Intelligence · Hermes Archive</p>
        </div>
        {auth && (
          <div className="user-badge">
            <span className="status-dot" />
            <span>
              {auth.is_admin
                ? `${auth.email || "Admin"} (Operator)`
                : "Public View"}
            </span>
          </div>
        )}
      </header>

      {error && <div className="error-banner">{error}</div>}

      {/* VIEW: Single Brief Detail */}
      {currentBriefId ? (
        <article className="brief-detail-view">
          <button className="back-btn" onClick={goHome}>
            ← Back to all investigations
          </button>

          {loading && <div className="loading">Loading research brief…</div>}

          {currentBrief && (
            <>
              <header className="detail-header">
                <div className="badge-row">
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

              {/* Provenance Metadata Bar */}
              <section className="provenance-card">
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
                <div className="provenance-item">
                  <span className="provenance-label">Published</span>
                  <span className="provenance-value">
                    {formatTime(currentBrief.published_at)}
                  </span>
                </div>
                {currentBrief.job_id && (
                  <div className="provenance-item">
                    <span className="provenance-label">Investigation ID</span>
                    <span className="provenance-value" style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>
                      {currentBrief.job_id}
                    </span>
                  </div>
                )}
              </section>

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

              {/* Verified Claims & Evidence Mapping */}
              {currentBrief.claims && currentBrief.claims.length > 0 && (
                <section className="claims-section">
                  <h3 className="section-title">
                    <span>Claims & Verification Audit</span>
                    <span style={{ fontSize: "0.85rem", color: "var(--ink-muted)", fontWeight: "normal" }}>
                      ({currentBrief.claims.length})
                    </span>
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
                    <span style={{ fontSize: "0.85rem", color: "var(--ink-muted)", fontWeight: "normal" }}>
                      ({currentBrief.sources.length})
                    </span>
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
            </>
          )}
        </article>
      ) : (
        /* VIEW: Investigations Feed */
        <section className="feed-view">
          <div className="search-box">
            <input
              type="text"
              className="search-input"
              placeholder="Search research briefs by keyword, paper, company, or claim..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="feed-header">
            <h2 className="feed-title">Recent Investigations</h2>
            <span style={{ fontSize: "0.85rem", color: "var(--ink-muted)" }}>
              {briefs.length} {briefs.length === 1 ? "brief" : "briefs"}
            </span>
          </div>

          {loading && <div className="loading">Searching research archive…</div>}

          {!loading && briefs.length === 0 && !error && (
            <div className="loading">
              No investigations found. Send a research topic to Hermes to populate Bugle.
            </div>
          )}

          <ul className="briefs-list">
            {briefs.map((b) => (
              <li key={b.id} className="brief-card" onClick={() => openBrief(b.id)}>
                <div className="card-top">
                  <h3 className="card-title">{b.title}</h3>
                  <div className="badge-row">
                    <span className="badge badge-category">
                      {b.category}
                      {b.subcategory ? ` / ${b.subcategory}` : ""}
                    </span>
                    <span className={`badge badge-depth-${b.research_depth}`}>
                      {b.research_depth}
                    </span>
                    <span className={`badge badge-${b.visibility}`}>
                      {b.visibility === "private" ? "🔒" : "🌐"}
                    </span>
                  </div>
                </div>

                {b.summary && <p className="card-summary">{b.summary}</p>}

                <div className="card-meta">
                  <span>
                    {b.source_count} sources · {b.claim_count} claims · {b.confidence} confidence
                  </span>
                  <time>{formatTime(b.published_at)}</time>
                </div>

                {b.tags && b.tags.length > 0 && (
                  <div className="tags-row">
                    {b.tags.map((t) => (
                      <span key={t} className="tag-pill">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}