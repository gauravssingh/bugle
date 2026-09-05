import type React from "react";
import type { BriefSummary } from "../api";
import { BriefCard } from "../components/BriefCard";
import { IconSearch } from "../components/Icons";

interface FeedPageProps {
  briefs: BriefSummary[];
  loading: boolean;
  error: string | null;
  search: string;
  onSearchChange: (val: string) => void;
  suggestions: string[];
  savedIds: string[];
  onOpenBrief: (id: string) => void;
  onToggleSave: (id: string, e: React.MouseEvent) => void;
  onShare: (b: BriefSummary) => void;
  onRecordSearch: (term: string) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
}

export function FeedPage({
  briefs,
  loading,
  error,
  search,
  onSearchChange,
  suggestions,
  savedIds,
  onOpenBrief,
  onToggleSave,
  onShare,
  onRecordSearch,
  searchInputRef,
}: FeedPageProps) {
  return (
    <section className="home-view">
      {/* Desktop-only Overview: Persistent Search, Quick-Nav Tiles, and Aggregate Stat Cards */}
      <div className="desktop-only-overview">
        <div className="search-section">
          <div className="search-input-wrapper">
            <span className="search-icon">
              <IconSearch />
            </span>
            <label className="sr-only" htmlFor="home-search">
              Search research briefs
            </label>
            <input
              id="home-search"
              ref={searchInputRef}
              type="text"
              className="search-input"
              placeholder="Search research briefs... (press / to focus)"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            {search ? (
              <button
                className="search-clear-btn"
                onClick={() => onSearchChange("")}
                aria-label="Clear search"
              >
                ✕
              </button>
            ) : (
              <span className="search-kbd-chip">/</span>
            )}
          </div>

          {/* Suggestion Chips */}
          <div className="suggestion-chips-row">
            <span className="suggestion-label">Try:</span>
            {suggestions.map((s) => (
              <button
                key={s}
                className={`chip-button ${search.toLowerCase() === s.toLowerCase() ? "active" : ""}`}
                onClick={() => {
                  onSearchChange(s);
                  onRecordSearch(s);
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Section Header Row */}
      <div className="section-header-row feed-header-row">
        <div>
          <h2 className="section-heading">Recent Investigations</h2>
          <p className="section-subheading">Latest research outputs synthesized by Hermes</p>
        </div>
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
        {briefs.map((b, idx) => (
          <BriefCard
            key={b.id}
            brief={b}
            index={idx}
            isSaved={savedIds.includes(b.id)}
            isFeatured={idx === 0}
            onOpen={onOpenBrief}
            onToggleSave={onToggleSave}
            onShare={onShare}
          />
        ))}
      </ul>
    </section>
  );
}
