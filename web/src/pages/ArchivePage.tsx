import { useState } from "react";
import type React from "react";
import type { BriefSummary } from "../api";
import { BriefCard } from "../components/BriefCard";
import { BriefsMetadataTable } from "../components/BriefsMetadataTable";
import { IconGrid, IconTable } from "../components/Icons";
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
  viewMode?: "cards" | "table";
  onViewModeChange?: (mode: "cards" | "table") => void;
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
  viewMode = "cards",
  onViewModeChange,
}: ArchivePageProps) {
  const [internalViewMode, setInternalViewMode] = useState<"cards" | "table">(viewMode);
  const activeViewMode = onViewModeChange ? viewMode : internalViewMode;

  const handleViewChange = (mode: "cards" | "table") => {
    if (onViewModeChange) {
      onViewModeChange(mode);
    } else {
      setInternalViewMode(mode);
    }
  };

  return (
    <section className="archive-tab-view">
      <div className="section-header-row archive-header-row">
        <div>
          <h2 className="section-heading">Research Archive</h2>
          <p className="section-subheading">
            Comprehensive catalogue · {archiveBriefs.length} records · {formatCost(totalSpend) ?? "$0.00"} spent
          </p>
        </div>

        {/* View Mode Switcher: Cards vs Table Ledger */}
        <div className="view-mode-toggle" role="group" aria-label="Archive view mode">
          <button
            type="button"
            className={`btn-view-toggle ${activeViewMode === "cards" ? "active" : ""}`}
            onClick={() => handleViewChange("cards")}
            title="Display investigations as reading cards"
            aria-pressed={activeViewMode === "cards"}
          >
            <IconGrid className="toggle-svg" />
            <span>Cards</span>
          </button>
          <button
            type="button"
            className={`btn-view-toggle ${activeViewMode === "table" ? "active" : ""}`}
            onClick={() => handleViewChange("table")}
            title="Display investigations as telemetry table ledger"
            aria-pressed={activeViewMode === "table"}
          >
            <IconTable className="toggle-svg" />
            <span>Table Ledger</span>
          </button>
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
      ) : activeViewMode === "table" ? (
        <BriefsMetadataTable
          briefs={archiveBriefs}
          onOpenBrief={onOpenBrief}
          title={archiveCategory === "all" ? "Catalogue Telemetry Ledger" : `${archiveCategory} Telemetry Ledger`}
          subtitle={`High-level cost, execution duration, model, and token metadata for ${archiveBriefs.length} bugles.`}
          showCategoryFilter={false}
          showKpis={true}
        />
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
