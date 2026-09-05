import type React from "react";
import type { BriefSummary } from "../api";
import { BriefCard } from "../components/BriefCard";
import { IconStar } from "../components/Icons";

interface SavedPageProps {
  savedBriefs: BriefSummary[];
  savedIds: string[];
  onOpenBrief: (id: string) => void;
  onToggleSave: (id: string, e: React.MouseEvent) => void;
  onShare: (b: BriefSummary) => void;
  onExplore: () => void;
}

export function SavedPage({
  savedBriefs,
  savedIds,
  onOpenBrief,
  onToggleSave,
  onShare,
  onExplore,
}: SavedPageProps) {
  return (
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
          <button className="btn-secondary" onClick={onExplore}>
            Explore Investigations
          </button>
        </div>
      ) : (
        <ul className="blog-feed-list">
          {savedBriefs.map((b, idx) => (
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
      )}
    </section>
  );
}
