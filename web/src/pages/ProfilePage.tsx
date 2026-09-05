import { useState } from "react";
import type { AuthInfo } from "../api";
import {
  IconArchive,
  IconCpu,
  IconDatabase,
  IconHistory,
  IconRefresh,
  IconStar,
} from "../components/Icons";
import { formatCost, getOperatorInitials } from "../format";

interface ProfilePageProps {
  auth: AuthInfo | null;
  modelInfo: {
    raw: string;
    formatted: string;
    provider: string;
  };
  totalSpend: number;
  briefsCount: number;
  savedCount: number;
  categoriesCount: number;
  topTopics: string[];
  recentSearches: string[];
  onClearRecentSearches: () => void;
  onOpenHealthModal: () => void;
  onSwitchTab: (tab: "home" | "search" | "saved" | "archive" | "profile") => void;
}

export function ProfilePage({
  auth,
  modelInfo,
  totalSpend,
  briefsCount,
  savedCount,
  categoriesCount,
  topTopics,
  recentSearches,
  onClearRecentSearches,
  onOpenHealthModal,
  onSwitchTab,
}: ProfilePageProps) {
  const [refreshed, setRefreshed] = useState(false);
  const operatorEmail = auth?.email || "gaurav.singh.86@gmail.com";
  const operatorInitials = getOperatorInitials(operatorEmail);
  const avgSpend = briefsCount > 0 ? totalSpend / briefsCount : 0;

  const handleRefresh = () => {
    window.dispatchEvent(new CustomEvent("bugle:refresh"));
    setRefreshed(true);
    setTimeout(() => setRefreshed(false), 2000);
  };

  return (
    <section className="profile-page-view">
      {/* Hero Header Card */}
      <div className="profile-hero-card">
        <div className="profile-hero-avatar">{operatorInitials}</div>
        <div className="profile-hero-info">
          <div className="profile-hero-top">
            <h2 className="profile-hero-email" title={operatorEmail}>
              {operatorEmail}
            </h2>
            <span className="profile-hero-badge">
              <span className="status-dot online" />
              {auth?.is_admin ? "Operator (Admin)" : "Public View"}
            </span>
          </div>
          <div className="profile-hero-meta">
            <span className="profile-meta-tag">Cloudflare Access</span>
            <span className="profile-meta-tag">Private Hermes Instance</span>
            <span className="profile-meta-tag">SQLite WAL Active</span>
          </div>
        </div>
      </div>

      {/* Grid of Details Cards */}
      <div className="profile-cards-grid">
        {/* Card 1: Active AI Model & Engine */}
        <div className="profile-card">
          <div className="profile-card-head">
            <div className="profile-card-head-title">
              <IconCpu className="profile-card-head-icon" />
              <h3>Research Intelligence Engine</h3>
            </div>
            <span className="profile-provider-pill">{modelInfo.provider}</span>
          </div>

          <div className="profile-model-box">
            <span className="profile-model-label">PRIMARY MODEL</span>
            <span className="profile-model-value" title={modelInfo.raw}>
              {modelInfo.formatted}
            </span>
            <span className="profile-model-raw">{modelInfo.raw}</span>
          </div>

          <div className="profile-metric-rows">
            <div className="profile-metric-row">
              <span className="metric-row-label">Architecture</span>
              <span className="metric-row-val">Hermes Autonomous Pipeline</span>
            </div>
            <div className="profile-metric-row">
              <span className="metric-row-label">Grounding</span>
              <span className="metric-row-val">Multi-source Web Citations</span>
            </div>
            <div className="profile-metric-row">
              <span className="metric-row-label">Orchestrator Status</span>
              <span className="metric-row-val status-ok">
                <span className="status-dot online" /> Active
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Research Spend & Financials */}
        <div className="profile-card">
          <div className="profile-card-head">
            <div className="profile-card-head-title">
              <IconDatabase className="profile-card-head-icon" />
              <h3>Research Spend & Cost Metrics</h3>
            </div>
            <span className="profile-currency-pill">USD / INR</span>
          </div>

          <div className="profile-spend-display">
            <div className="profile-spend-main">
              <span className="profile-spend-large">${totalSpend.toFixed(4)}</span>
              <span className="profile-spend-denom">USD Total Spend</span>
            </div>
            <div className="profile-spend-sub-note">
              {formatCost(totalSpend) ?? `$${totalSpend.toFixed(4)} USD`}
            </div>
          </div>

          <div className="profile-metric-rows">
            <div className="profile-metric-row">
              <span className="metric-row-label">Completed Investigations</span>
              <span className="metric-row-val font-mono">{briefsCount} briefings</span>
            </div>
            <div className="profile-metric-row">
              <span className="metric-row-label">Average Cost / Brief</span>
              <span className="metric-row-val font-mono">${avgSpend.toFixed(4)} USD</span>
            </div>
            <div className="profile-metric-row">
              <span className="metric-row-label">Billing Model</span>
              <span className="metric-row-val">Token Metered API</span>
            </div>
          </div>
        </div>

        {/* Card 3: Intelligence Activity */}
        <div className="profile-card">
          <div className="profile-card-head">
            <div className="profile-card-head-title">
              <IconArchive className="profile-card-head-icon" />
              <h3>Intelligence Activity</h3>
            </div>
          </div>

          <div className="profile-activity-stats">
            <div className="activity-stat-box" onClick={() => onSwitchTab("archive")} role="button" tabIndex={0}>
              <span className="activity-stat-num">{briefsCount}</span>
              <span className="activity-stat-label">Total Briefs</span>
            </div>
            <div className="activity-stat-box" onClick={() => onSwitchTab("saved")} role="button" tabIndex={0}>
              <span className="activity-stat-num">{savedCount}</span>
              <span className="activity-stat-label">Bookmarks</span>
            </div>
            <div className="activity-stat-box" onClick={() => onSwitchTab("archive")} role="button" tabIndex={0}>
              <span className="activity-stat-num">{categoriesCount}</span>
              <span className="activity-stat-label">Categories</span>
            </div>
            <div className="activity-stat-box">
              <span className="activity-stat-num">{topTopics.length}</span>
              <span className="activity-stat-label">Top Topics</span>
            </div>
          </div>

          <div className="profile-card-actions">
            <button
              type="button"
              className="btn-card-action"
              onClick={() => onSwitchTab("saved")}
            >
              <IconStar className="btn-action-svg" />
              <span>View Bookmarks ({savedCount})</span>
            </button>
            <button
              type="button"
              className="btn-card-action"
              onClick={() => onSwitchTab("archive")}
            >
              <IconArchive className="btn-action-svg" />
              <span>Browse Full Catalogue</span>
            </button>
          </div>
        </div>

        {/* Card 4: Database & System Diagnostics */}
        <div className="profile-card">
          <div className="profile-card-head">
            <div className="profile-card-head-title">
              <IconDatabase className="profile-card-head-icon" />
              <h3>Database & System Health</h3>
            </div>
            <span className="profile-status-pill">SQLite 3</span>
          </div>

          <p className="profile-card-description">
            Inspect real-time SQLite PRAGMA checks, database integrity, schema page count, WAL journal allocations, and trigger VACUUM optimization.
          </p>

          <div className="profile-health-action-wrap">
            <button
              type="button"
              className="profile-health-btn"
              onClick={onOpenHealthModal}
            >
              <div className="health-btn-left">
                <div className="health-btn-icon-wrap">
                  <IconDatabase className="health-btn-icon" />
                </div>
                <div className="health-btn-text">
                  <span className="health-btn-title">System & Database Health</span>
                  <span className="health-btn-subtitle">PRAGMA diagnostics · VACUUM · Journal</span>
                </div>
              </div>
              <span className="health-btn-arrow">→</span>
            </button>
          </div>
        </div>

        {/* Card 5: Workspace Preferences & Cache */}
        <div className="profile-card">
          <div className="profile-card-head">
            <div className="profile-card-head-title">
              <IconHistory className="profile-card-head-icon" />
              <h3>Workspace & Controls</h3>
            </div>
          </div>

          <div className="profile-actions-list">
            <div className="profile-action-item">
              <div className="action-item-desc">
                <span className="action-item-title">Search History</span>
                <span className="action-item-sub">
                  {recentSearches.length > 0
                    ? `${recentSearches.length} cached search queries stored locally`
                    : "No recent search queries stored"}
                </span>
              </div>
              {recentSearches.length > 0 && (
                <button
                  type="button"
                  className="btn-action-secondary"
                  onClick={onClearRecentSearches}
                >
                  Clear History
                </button>
              )}
            </div>

            <div className="profile-action-item">
              <div className="action-item-desc">
                <span className="action-item-title">Synchronize Intelligence Feed</span>
                <span className="action-item-sub">Refresh database feeds and taxonomy cache</span>
              </div>
              <button
                type="button"
                className="btn-action-secondary"
                onClick={handleRefresh}
                disabled={refreshed}
              >
                <IconRefresh className={refreshed ? "spin-icon" : ""} />
                <span>{refreshed ? "Refreshed!" : "Sync Now"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
