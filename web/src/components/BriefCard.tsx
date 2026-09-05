import type React from "react";
import type { BriefSummary } from "../api";
import { estimateReadingTime, formatModel } from "../format";
import {
  AccessBadge,
  CategoryBadge,
  EvidenceMetadata,
  ReadingMetadata,
  StatusBadge,
  TechnicalTag,
} from "./Badge";
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
      {/* 1. Category & Status Badges (Left) · Action Icons (Right) */}
      <div className="card-top-row">
        <div className="card-badge-group">
          <CategoryBadge category={b.category} />
          {isFeatured && <StatusBadge status="Latest Dispatch" dot />}
          {b.visibility === "private" && <AccessBadge visibility="private" />}
        </div>

        <div className="card-actions-group">
          <button
            type="button"
            className={`btn-icon-action ${isSaved ? "saved" : ""}`}
            onClick={(e) => onToggleSave(b.id, e)}
            title={isSaved ? "Remove bookmark" : "Save bookmark"}
            aria-label={isSaved ? "Remove bookmark" : "Save brief"}
            aria-pressed={isSaved}
          >
            <IconStar filled={isSaved} />
          </button>
          <button
            type="button"
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

      {/* 2. Reading & Cost Metadata (Quiet inline text — NOT a badge) */}
      <ReadingMetadata
        readDuration={readDuration}
        publishedAt={b.published_at}
        costUsd={b.cost_usd}
        costInr={b.cost_inr}
        exchangeRate={b.cost_exchange_rate}
      />

      {/* 3. Title / Headline — Strongest Hero Element */}
      {isFeatured ? (
        <h2 className="blog-headline blog-headline-featured">{b.title}</h2>
      ) : (
        <h3 className="blog-headline blog-headline-standard">{b.title}</h3>
      )}

      {/* 4. Summary Narrative Excerpt */}
      {b.summary && <p className="blog-summary-excerpt">{b.summary}</p>}

      {/* 5. Technical Metadata Tags (Model, Research Depth, Subcategory) */}
      <div className="card-tech-tags-row">
        {b.model && (
          <TechnicalTag label={formatModel(b.model)} title={`Model Engine: ${b.model}`} />
        )}
        {b.research_depth && (
          <TechnicalTag
            label={b.research_depth.toLowerCase()}
            title={`Research Depth: ${b.research_depth}`}
          />
        )}
        {b.subcategory && <TechnicalTag label={b.subcategory} />}
      </div>

      {/* 6. Card Footer: Evidence Metadata (Quiet inline) & Read CTA */}
      <div className="card-footer-row">
        <EvidenceMetadata sourceCount={b.source_count} claimCount={b.claim_count} />
        <span className="card-read-cta">
          Read investigation <IconArrowRight />
        </span>
      </div>
    </li>
  );
}
