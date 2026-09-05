import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api, type BriefDetail } from "../api";
import { IconHistory, IconStar } from "../components/Icons";
import { RevisionsDrawer } from "../components/RevisionsDrawer";
import { formatCost, formatDateTimeParts, formatDuration, formatInr, formatModel, formatTime } from "../format";
import { useConfirm } from "../hooks/useConfirm";

interface BriefDetailPageProps {
  briefId: string;
  onBack: () => void;
  savedIds: string[];
  onToggleSave: (id: string) => void;
  isAdmin: boolean;
  onVisibilityToggled: (brief: BriefDetail) => void;
  onBriefDeleted: (id: string) => void;
}

export function BriefDetailPage({
  briefId,
  onBack,
  savedIds,
  onToggleSave,
  isAdmin,
  onVisibilityToggled,
  onBriefDeleted,
}: BriefDetailPageProps) {
  const [loading, setLoading] = useState(false);
  const [brief, setBrief] = useState<BriefDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revisionsOpen, setRevisionsOpen] = useState(false);
  const { isArmed, trigger: triggerDelete } = useConfirm(2500);

  useEffect(() => {
    if (!briefId) return;
    setLoading(true);
    setError(null);
    const controller = new AbortController();

    api
      .getBrief(briefId, controller.signal)
      .then((data) => setBrief(data))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : String(err));
        setBrief(null);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [briefId]);

  const handleToggleVisibility = async () => {
    if (!brief) return;
    const nextVis = brief.visibility === "private" ? "public" : "private";
    try {
      const updated = await api.updateBrief(brief.id, { visibility: nextVis });
      setBrief(updated);
      onVisibilityToggled(updated);
    } catch (err: unknown) {
      alert(`Failed to update visibility: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDelete = () => {
    if (!brief) return;
    triggerDelete(brief.id, async () => {
      try {
        await api.deleteBrief(brief.id);
        onBriefDeleted(brief.id);
      } catch (err: unknown) {
        alert(`Failed to delete brief: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  };

  const publishedAt = formatDateTimeParts(brief?.published_at || null);
  const isSaved = brief ? savedIds.includes(brief.id) : false;

  return (
    <article className="brief-detail-view">
      <div className="sticky-back-bar detail-back-bar">
        <button className="back-btn" onClick={onBack}>
          ← Back to all investigations
        </button>
        {brief && (
          <div className="detail-top-actions">
            <button
              className="btn-icon-action"
              onClick={() => setRevisionsOpen(true)}
              title="Audit Revisions"
              aria-label="Audit Revisions"
            >
              <IconHistory />
            </button>
            <button
              className={`btn-icon-action ${isSaved ? "saved" : ""}`}
              onClick={() => onToggleSave(brief.id)}
              title={isSaved ? "Bookmarked" : "Bookmark this brief"}
              aria-label={isSaved ? "Remove bookmark" : "Bookmark this brief"}
              aria-pressed={isSaved}
            >
              <IconStar filled={isSaved} />
            </button>
          </div>
        )}
      </div>

      {loading && <div className="loading-state">Loading research brief…</div>}
      {error && <div className="callout callout-error">{error}</div>}

      {brief && (
        <div className="detail-layout">
          {/* Left Column: Reading Synthesis & Full Markdown */}
          <div className="detail-main-column">
            <header className="detail-header">
              <div className="badge-row">
                {brief.cost_usd !== null && brief.cost_usd !== undefined && (
                  <span
                    className="badge badge-cost"
                    title={`Cost: $${brief.cost_usd.toFixed(4)} USD${brief.cost_inr !== null ? ` ≈ ${formatInr(brief.cost_inr)} INR (@ ₹${brief.cost_exchange_rate || 95.56}/$)` : ""}`}
                  >
                    💰 {formatCost(brief.cost_usd)}{brief.cost_inr !== null ? ` · ${formatInr(brief.cost_inr)}` : ""}
                  </span>
                )}
                {brief.duration_seconds && (
                  <span className="badge badge-duration" title={`Duration: ${brief.duration_seconds}s`}>
                    ⏱️ {formatDuration(brief.duration_seconds)}
                  </span>
                )}
                {brief.model && (
                  <span className="badge badge-model" title={`Model: ${brief.model}`}>
                    {formatModel(brief.model)}
                  </span>
                )}
                <span className="badge badge-category">
                  {brief.category}
                  {brief.subcategory ? ` / ${brief.subcategory}` : ""}
                </span>
                <span className={`badge badge-depth-${brief.research_depth}`}>
                  {brief.research_depth} Depth
                </span>
                <span className="badge badge-category">
                  {brief.confidence} Confidence
                </span>
                <span className={`badge badge-${brief.visibility}`}>
                  {brief.visibility === "private" ? "🔒 Private" : "🌐 Public"}
                </span>
              </div>

              <h2 className="detail-title">{brief.title}</h2>
            </header>

            {/* Executive Summary Callout */}
            {brief.summary && (
              <section className="executive-summary-box">
                <div className="summary-heading">Executive Synthesis</div>
                <p className="summary-text">{brief.summary}</p>
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
                {brief.content_markdown || "*No detailed report content provided.*"}
              </ReactMarkdown>
            </section>
          </div>

          {/* Right Column: Sticky Provenance & Evidence Audit Panel */}
          <aside className="detail-audit-column">
            {/* Provenance Metadata Card */}
            <section className="provenance-card" aria-labelledby="provenance-title">
              <div className="provenance-card-header">
                <div>
                  <span className="provenance-eyebrow">Audit trail</span>
                  <h3 id="provenance-title" className="provenance-card-title">Investigation Provenance</h3>
                </div>
                <span className="provenance-confidence">{brief.confidence} confidence</span>
              </div>
              <div className="provenance-summary">
                <div className="provenance-summary-stat">
                  <strong>{brief.source_count}</strong>
                  <span>Sources</span>
                </div>
                <div className="provenance-summary-stat">
                  <strong>{brief.claim_count}</strong>
                  <span>Claims</span>
                </div>
                <div className="provenance-summary-stat">
                  <strong>{brief.research_depth}</strong>
                  <span>Depth</span>
                </div>
              </div>
              <div className="provenance-grid">
                <div className="provenance-item">
                  <span className="provenance-label">Research Type</span>
                  <span className="provenance-value">{brief.research_type}</span>
                </div>
                {brief.cost_usd !== null && brief.cost_usd !== undefined && (
                  <div className="provenance-item">
                    <span className="provenance-label">Generation Cost</span>
                    <span className="provenance-value provenance-stack highlight-success">
                      <span>${brief.cost_usd.toFixed(4)} USD</span>
                      {brief.cost_inr !== null && (
                        <span>
                          {formatInr(brief.cost_inr)} INR{" "}
                          <span style={{ fontSize: "0.72rem", color: "var(--ink-muted)" }}>
                            (@ ₹{brief.cost_exchange_rate || 95.56}/$)
                          </span>
                        </span>
                      )}
                    </span>
                  </div>
                )}
                {brief.duration_seconds && (
                  <div className="provenance-item">
                    <span className="provenance-label">Duration</span>
                    <span className="provenance-value">
                      ⏱️ {formatDuration(brief.duration_seconds)} ({brief.duration_seconds}s)
                    </span>
                  </div>
                )}
                {brief.model && (
                  <div className="provenance-item">
                    <span className="provenance-label">Model Engine</span>
                    <span className="provenance-value font-mono">{brief.model}</span>
                  </div>
                )}
                {brief.token_usage && (
                  <div className="provenance-item">
                    <span className="provenance-label">Token Breakdown</span>
                    <span className="provenance-value font-mono provenance-stack">
                      <span>{(brief.token_usage.input || 0).toLocaleString()} in</span>
                      <span>{(brief.token_usage.output || 0).toLocaleString()} out</span>
                      {brief.total_tokens ? <span className="provenance-total">{brief.total_tokens.toLocaleString()} total</span> : null}
                    </span>
                  </div>
                )}
                <div className="provenance-item">
                  <span className="provenance-label">Published</span>
                  <span className="provenance-value provenance-stack">
                    <span>{publishedAt.date}</span>
                    {publishedAt.time && <span>{publishedAt.time}</span>}
                  </span>
                </div>
                {brief.job_id && (
                  <div className="provenance-item">
                    <span className="provenance-label">Investigation ID</span>
                    <span className="provenance-value font-mono">{brief.job_id}</span>
                  </div>
                )}
              </div>
            </section>

            {/* Verified Claims & Evidence Mapping */}
            {brief.claims && brief.claims.length > 0 && (
              <section className="claims-section">
                <h3 className="section-title">
                  <span>Claims & Verification Audit</span>
                  <span className="title-count">({brief.claims.length})</span>
                </h3>
                <div className="claims-grid">
                  {brief.claims.map((claim) => (
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
                            const s = brief.sources.find((src) => src.id === sid);
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
            {brief.sources && brief.sources.length > 0 && (
              <section className="sources-section">
                <h3 className="section-title">
                  <span>Primary Evidence & Sources</span>
                  <span className="title-count">({brief.sources.length})</span>
                </h3>
                <div className="sources-list">
                  {brief.sources.map((source) => (
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
            {isAdmin && (
              <div className="admin-actions">
                <button className="btn-secondary" onClick={handleToggleVisibility}>
                  Toggle Visibility to {brief.visibility === "private" ? "Public" : "Private"}
                </button>
                <button
                  className={`btn-danger ${isArmed(brief.id) ? "btn-danger-armed" : ""}`}
                  onClick={handleDelete}
                >
                  {isArmed(brief.id) ? "Click again to confirm delete" : "Delete Brief"}
                </button>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* Revision Drawer */}
      <RevisionsDrawer
        briefId={briefId}
        isOpen={revisionsOpen}
        onClose={() => setRevisionsOpen(false)}
      />
    </article>
  );
}
