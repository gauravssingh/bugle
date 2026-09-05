import { useEffect, useState } from "react";
import { api, type BriefRevision } from "../api";
import { formatTime } from "../format";
import { useModalChrome } from "../hooks/useModalChrome";
import { IconClose, IconHistory } from "./Icons";

interface RevisionsDrawerProps {
  briefId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function RevisionsDrawer({ briefId, isOpen, onClose }: RevisionsDrawerProps) {
  const { handleBackdropClick } = useModalChrome({ isOpen, onClose });
  const [loading, setLoading] = useState(false);
  const [revisions, setRevisions] = useState<BriefRevision[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedRevId, setSelectedRevId] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen || !briefId) return;
    setLoading(true);
    setError(null);
    api
      .getBriefRevisions(briefId)
      .then((data) => {
        setRevisions(data);
        if (data.length > 0) setSelectedRevId(data[0].id);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setLoading(false));
  }, [isOpen, briefId]);

  if (!isOpen) return null;

  const activeRev = revisions.find((r) => r.id === selectedRevId);

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick} role="dialog" aria-modal="true" aria-labelledby="revisions-title">
      <div className="modal-chrome revisions-drawer">
        <div className="modal-header">
          <div className="modal-title-wrap">
            <IconHistory className="modal-icon" />
            <h2 id="revisions-title">Revision Provenance History</h2>
          </div>
          <button className="btn-icon-action" onClick={onClose} aria-label="Close dialog">
            <IconClose />
          </button>
        </div>

        <div className="modal-body revisions-body">
          {error && <div className="callout callout-error">{error}</div>}
          {loading ? (
            <div className="loading-state">Loading revision snapshots…</div>
          ) : revisions.length === 0 ? (
            <div className="empty-state">
              <p>No prior revisions recorded for this brief.</p>
              <span className="ink-muted">A snapshot is automatically captured whenever an operator or service edits the brief.</span>
            </div>
          ) : (
            <div className="revisions-layout">
              <div className="revisions-timeline">
                {revisions.map((rev, index) => (
                  <button
                    key={rev.id}
                    className={`timeline-item ${rev.id === selectedRevId ? "active" : ""}`}
                    onClick={() => setSelectedRevId(rev.id)}
                  >
                    <div className="timeline-dot" />
                    <div className="timeline-content">
                      <span className="timeline-version">Revision #{revisions.length - index}</span>
                      <span className="timeline-date">{formatTime(rev.created_at)}</span>
                    </div>
                  </button>
                ))}
              </div>

              {activeRev && (
                <div className="revision-detail">
                  <div className="revision-meta-card">
                    <h4>{activeRev.title}</h4>
                    <p className="ink-muted">{activeRev.summary || "No summary provided in this revision."}</p>
                    <div className="revision-tags-row">
                      <span className="badge">
                        {activeRev.claims_snapshot?.length || 0} claims snapshotted
                      </span>
                    </div>
                  </div>

                  <div className="revision-markdown-preview">
                    <h5>Markdown Content at Revision</h5>
                    <pre className="markdown-source-view">
                      {activeRev.content_markdown || "*Empty markdown content*"}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
