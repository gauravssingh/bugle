import { useEffect, useState } from "react";
import { api, type DbHealth, type SystemStatus } from "../api";
import { formatBytes, formatRelativeTime, formatTime } from "../format";
import { useModalChrome } from "../hooks/useModalChrome";
import { IconClose, IconDatabase } from "./Icons";

interface SystemHealthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SystemHealthModal({ isOpen, onClose }: SystemHealthModalProps) {
  const { handleBackdropClick } = useModalChrome({ isOpen, onClose });
  const [loading, setLoading] = useState(false);
  const [vacuuming, setVacuuming] = useState(false);
  const [health, setHealth] = useState<DbHealth | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadMetrics = async () => {
    setLoading(true);
    setError(null);
    try {
      const [h, s] = await Promise.all([api.getDbHealth(), api.getSystemStatus()]);
      setHealth(h);
      setStatus(s);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void loadMetrics();
      setMessage(null);
    }
  }, [isOpen]);

  const handleVacuum = async () => {
    setVacuuming(true);
    setMessage(null);
    setError(null);
    try {
      const res = await api.vacuumDb();
      setMessage(res.message);
      await loadMetrics();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setVacuuming(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="system-health-title"
    >
      <div className="modal-chrome system-health-modal">
        <div className="modal-header">
          <div className="modal-title-wrap">
            <IconDatabase className="modal-icon" />
            <h2 id="system-health-title">Database & System Health</h2>
          </div>
          <button className="btn-icon-action" onClick={onClose} aria-label="Close dialog">
            <IconClose />
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="callout callout-error">{error}</div>}
          {message && <div className="callout callout-success">{message}</div>}

          {loading && !health ? (
            <div className="loading-state">Querying SQLite PRAGMAs…</div>
          ) : (
            <>
              {/* SQLite Engine & Storage Section */}
              <div className="health-section">
                <div className="health-section-header">
                  <h3 className="health-section-title">SQLite Engine & Storage</h3>
                  <span className="health-section-badge">PRAGMA Checks</span>
                </div>

                <div className="health-grid">
                  <div className="health-card">
                    <span className="health-card-label">Integrity Status</span>
                    <div className="health-card-value-wrap">
                      <div className={`health-status-badge ${health?.integrity_ok ? "ok" : "error"}`}>
                        <span className="health-status-dot" />
                        <span className="health-status-text">
                          {health?.integrity_ok ? "PRAGMA OK" : "Corruption"}
                        </span>
                      </div>
                    </div>
                    <span className="health-card-sub" title="SQLite PRAGMA integrity_check verification">
                      Zero corruption detected
                    </span>
                  </div>

                  <div className="health-card">
                    <span className="health-card-label">Foreign Keys</span>
                    <div className="health-card-value-wrap">
                      <div className={`health-status-badge ${health?.foreign_keys_ok ? "ok" : "error"}`}>
                        <span className="health-status-dot" />
                        <span className="health-status-text">
                          {health?.foreign_keys_ok ? "Consistent" : "Violations"}
                        </span>
                      </div>
                    </div>
                    <span className="health-card-sub" title="SQLite PRAGMA foreign_key_check verification">
                      Relational integrity active
                    </span>
                  </div>

                  <div className="health-card">
                    <span className="health-card-label">Database File</span>
                    <div className="health-card-value-wrap">
                      <span className="health-metric-num">{formatBytes(health?.db_size_bytes)}</span>
                    </div>
                    <span className="health-card-sub" title="SQLite primary database file size on disk">
                      bugle.db primary file
                    </span>
                  </div>

                  <div className="health-card">
                    <span className="health-card-label">WAL Journal Size</span>
                    <div className="health-card-value-wrap">
                      <span className="health-metric-num">{formatBytes(health?.wal_size_bytes)}</span>
                    </div>
                    <span className="health-card-sub" title="SQLite Write-Ahead Log journal size">
                      Write-Ahead Log size
                    </span>
                  </div>

                  <div className="health-card">
                    <span className="health-card-label">Allocated Pages</span>
                    <div className="health-card-value-wrap">
                      <span className="health-metric-num">{(health?.page_count ?? 0).toLocaleString()}</span>
                      <span className="health-metric-unit">pgs</span>
                    </div>
                    <span className="health-card-sub" title={`${health?.freelist_pages ?? 0} freelist pages available`}>
                      {(health?.freelist_pages ?? 0).toLocaleString()} freelist pages
                    </span>
                  </div>

                  <div className="health-card">
                    <span className="health-card-label">Fragmentation</span>
                    <div className="health-card-value-wrap">
                      <span className="health-metric-num">{health?.fragmentation_pct ?? 0}%</span>
                    </div>
                    <span
                      className="health-card-sub"
                      title="Freelist ratio over total allocated pages"
                    >
                      {health?.fragmentation_pct && health.fragmentation_pct > 15
                        ? "Vacuum recommended"
                        : "Optimal density"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Application Daemon Runtime Section */}
              {status && (
                <div className="health-section">
                  <div className="health-section-header">
                    <h3 className="health-section-title">Autonomous Daemon & Runtime</h3>
                    <span className="health-section-badge">Worker Status</span>
                  </div>

                  <div className="health-grid">
                    <div className="health-card">
                      <span className="health-card-label">Synthesized Briefs</span>
                      <div className="health-card-value-wrap">
                        <span className="health-metric-num">
                          {(status.database.briefs ?? 0).toLocaleString()}
                        </span>
                        <span className="health-metric-unit">briefs</span>
                      </div>
                      <span className="health-card-sub" title="Total active research investigations">
                        Catalogued investigations
                      </span>
                    </div>

                    <div className="health-card">
                      <span className="health-card-label">Research Jobs</span>
                      <div className="health-card-value-wrap">
                        <span className="health-metric-num">
                          {(status.database.jobs ?? 0).toLocaleString()}
                        </span>
                        <span className="health-metric-unit">jobs</span>
                      </div>
                      <span className="health-card-sub" title="Total autonomous jobs processed">
                        Engine workflow tasks
                      </span>
                    </div>

                    <div className="health-card">
                      <span className="health-card-label">Latest Engine Run</span>
                      <div className="health-card-value-wrap">
                        <div
                          className={`health-status-badge ${
                            status.latest_job?.status === "completed"
                              ? "ok"
                              : status.latest_job?.status === "failed"
                              ? "error"
                              : "pending"
                          }`}
                        >
                          <span className="health-status-dot" />
                          <span className="health-status-text" style={{ textTransform: "capitalize" }}>
                            {status.latest_job?.status ?? "Idle"}
                          </span>
                        </div>
                      </div>
                      <span
                        className="health-card-sub"
                        title={status.latest_job?.created_at ? formatTime(status.latest_job.created_at) : "No jobs"}
                      >
                        {status.latest_job?.created_at
                          ? formatRelativeTime(status.latest_job.created_at)
                          : "No runs recorded"}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <span className="modal-footer-hint">
            Truncates WAL · Compacts storage · Optimizes query planner
          </span>
          <div className="modal-footer-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={handleVacuum}
              disabled={vacuuming || loading}
            >
              {vacuuming ? "Vacuuming SQLite…" : "Run VACUUM & Checkpoint"}
            </button>
            <button type="button" className="btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
