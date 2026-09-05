import type React from "react";
import type { BriefSummary } from "../api";
import { BriefCard } from "../components/BriefCard";
import { IconHistory, IconSearch } from "../components/Icons";

interface SearchPageProps {
  briefs: BriefSummary[];
  loading: boolean;
  search: string;
  onSearchChange: (val: string) => void;
  onRecordSearch: (term: string) => void;
  topTopics: string[];
  recentSearches: string[];
  onClearRecentSearches: () => void;
  savedIds: string[];
  onOpenBrief: (id: string) => void;
  onToggleSave: (id: string, e: React.MouseEvent) => void;
  onShare: (b: BriefSummary) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
}

export function SearchPage({
  briefs,
  loading,
  search,
  onSearchChange,
  onRecordSearch,
  topTopics,
  recentSearches,
  onClearRecentSearches,
  savedIds,
  onOpenBrief,
  onToggleSave,
  onShare,
  searchInputRef,
}: SearchPageProps) {
  return (
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
          <label className="sr-only" htmlFor="archive-search">
            Search briefs
          </label>
          <input
            id="archive-search"
            ref={searchInputRef}
            type="text"
            className="search-input"
            placeholder="Search keywords, topics, claims... (/ to focus)"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && search.trim()) {
                onRecordSearch(search.trim());
              }
            }}
          />
          {search ? (
            <button
              className="search-clear-btn"
              onClick={() => onSearchChange("")}
              aria-label="Clear search"
              title="Clear search"
            >
              ✕
            </button>
          ) : (
            <span className="search-kbd-chip">/</span>
          )}
        </div>

        {/* Topic & Tag Filter Chips */}
        {topTopics.length > 0 && (
          <div className="search-topics-bar">
            <span className="search-topics-label">Top Topics:</span>
            <div className="search-topics-chips">
              {topTopics.map((tag) => {
                const isSelected = search.toLowerCase() === tag.toLowerCase();
                return (
                  <button
                    key={tag}
                    className={`search-topic-chip ${isSelected ? "active" : ""}`}
                    onClick={() => {
                      const nextVal = isSelected ? "" : tag;
                      onSearchChange(nextVal);
                      if (nextVal) onRecordSearch(nextVal);
                    }}
                  >
                    #{tag}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Searches Strip */}
        {recentSearches.length > 0 && !search && (
          <div className="search-recent-strip">
            <div className="recent-strip-header">
              <span className="recent-strip-label">
                <IconHistory className="recent-strip-icon" /> Recent:
              </span>
              <button
                className="clear-history-link"
                onClick={onClearRecentSearches}
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
                    onSearchChange(term);
                    onRecordSearch(term);
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
        <div className="search-results-count">
          {search ? (
            <>
              <span className="results-query-label">
                Results for <strong>"{search}"</strong>
              </span>
              <span className="results-badge-count">
                {briefs.length} {briefs.length === 1 ? "brief" : "briefs"}
              </span>
            </>
          ) : (
            <>
              <span className="results-query-label">All Investigations</span>
              <span className="results-badge-count">{briefs.length}</span>
            </>
          )}
        </div>
        {search && (
          <button
            className="reset-search-btn"
            onClick={() => onSearchChange("")}
            title="Reset search filter"
            aria-label="Reset search filter"
          >
            ✕ Reset search
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
            <button className="btn-secondary" onClick={() => onSearchChange("")}>
              Clear search
            </button>
          )}
        </div>
      )}

      <ul className="blog-feed-list">
        {briefs.map((b, idx) => (
          <BriefCard
            key={b.id}
            brief={b}
            index={idx}
            isSaved={savedIds.includes(b.id)}
            onOpen={onOpenBrief}
            onToggleSave={onToggleSave}
            onShare={onShare}
          />
        ))}
      </ul>
    </section>
  );
}
