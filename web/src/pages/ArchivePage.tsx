import type React from "react";
import type { BriefSummary } from "../api";
import { BriefCard } from "../components/BriefCard";
import { formatCost } from "../format";

interface ArchivePageProps {
  archiveBriefs: BriefSummary[];
  categories: string[];
  archiveCategory: string;
  onSelectCategory: (cat: string) => void;
  totalSpend: number;
  savedIds: string[];
  onOpenBrief: (id: string) => void;
  onToggleSave: (id: string, e: React.MouseEvent) => void;
  onShare: (b: BriefSummary) => void;
}

export function ArchivePage({
  archiveBriefs,
  categories,
  archiveCategory,
  onSelectCategory,
  totalSpend,
  savedIds,
  onOpenBrief,
  onToggleSave,
  onShare,
}: ArchivePageProps) {
  return (
    <section className="archive-tab-view">
      <div className="section-header-row">
        <div>
          <h2 className="section-heading">Research Archive</h2>
          <p className="section-subheading">
            Comprehensive catalogue · {archiveBriefs.length} records · {formatCost(totalSpend) ?? "$0.00"} spent
          </p>
        </div>
      </div>

      {/* Category taxonomy pills */}
      <div className="category-filter-bar">
        {categories.map((cat) => (
          <button
            key={cat}
            className={`cat-filter-btn ${archiveCategory === cat ? "active" : ""}`}
            onClick={() => onSelectCategory(cat)}
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
          {archiveBriefs.map((b, idx) => (
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
