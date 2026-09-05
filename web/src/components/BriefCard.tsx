import type React from "react";
import type { BriefSummary } from "../api";
import { formatCost, formatInr, formatModel, formatRelativeTime, estimateReadingTime } from "../format";
import { IconArrowRight, IconShare, IconStar } from "./Icons";

interface BriefCardProps {
  brief: BriefSummary;
  index: number;
  isSaved: boolean;
  isFeatured?: boolean;
  onOpen: (id: string) => void;
  onToggleSave: (id: string, e: React.MouseEvent) => void;
  onShare: (brief: BriefSummary) => void;
}

export function BriefCard({
  brief: b,
  index,
  isSaved,
  isFeatured = false,
  onOpen,
  onToggleSave,
  onShare,
}: BriefCardProps) {
  const readDuration = estimateReadingTime(b.summary);

  return (
    <li
      key={b.id}
      className={`blog-card ${isFeatured ? "blog-card-featured" : "blog-card-standard"}`}
      onClick={() => onOpen(b.id)}
      onKeyDown={(e) => {
        if (e.target instanceof HTMLElement && e.target.closest("button, a, input")) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(b.id);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Open research brief: ${b.title}`}
    >
      {/* Card Header row: Category, read time, relative time, cost, actions */}
      <div className="blog-card-meta-top">
        <span className="blog-tag-badge">{b.category}</span>
        {isFeatured && <span className="blog-featured-tag">★ Latest Dispatch</span>}
        <span className="blog-dot-sep">·</span>
        <span className="blog-read-time">{readDuration}</span>
        <span className="blog-dot-sep">·</span>
        <span className="blog-rel-time">{formatRelativeTime(b.published_at)}</span>
        {b.cost_usd !== null && b.cost_usd !== undefined && (
          <span
            className="blog-cost-pill"
            title={`Cost: $${b.cost_usd.toFixed(4)} USD${b.cost_inr !== null ? ` ≈ ${formatInr(b.cost_inr)} INR (@ ₹${b.cost_exchange_rate || 95.56}/$)` : ""}`}
          >
            💰 {formatCost(b.cost_usd)}{b.cost_inr !== null ? ` · ${formatInr(b.cost_inr)}` : ""}
          </span>
        )}

        <div className="blog-card-actions">
          <button
            className={`btn-icon-action ${isSaved ? "saved" : ""}`}
            onClick={(e) => onToggleSave(b.id, e)}
            title={isSaved ? "Remove bookmark" : "Save bookmark"}
            aria-label={isSaved ? "Remove bookmark" : "Save brief"}
            aria-pressed={isSaved}
          >
            <IconStar filled={isSaved} />
          </button>
          <button
            className="btn-icon-action"
            onClick={(e) => {
              e.stopPropagation();
              onShare(b);
            }}
            title="Share brief"
            aria-label="Share brief"
          >
            <IconShare />
          </button>
        </div>
      </div>

      {/* Title / Headline */}
      {isFeatured ? (
        <h2 className="blog-headline blog-headline-featured">{b.title}</h2>
      ) : (
        <h3 className="blog-headline blog-headline-standard">{b.title}</h3>
      )}

      {/* Summary Narrative Excerpt */}
      {b.summary && <p className="blog-summary-excerpt">{b.summary}</p>}

      {/* Card Footer: Model engine, Depth, Evidence stats, Read CTA */}
      <div className="blog-card-footer">
        <div className="blog-provenance-pills">
          {b.model && (
            <span className="badge-pill badge-model" title={`Engine: ${b.model}`}>
              {formatModel(b.model)}
            </span>
          )}
          <span className={`badge-pill badge-depth badge-depth-${b.research_depth.toLowerCase()}`}>
            {b.research_depth.toUpperCase()}
          </span>
          <span className="blog-evidence-pill">
            {b.source_count} sources · {b.claim_count} claims
          </span>
        </div>
        <span className="blog-read-cta">
          Read investigation <IconArrowRight />
        </span>
      </div>
    </li>
  );
}
