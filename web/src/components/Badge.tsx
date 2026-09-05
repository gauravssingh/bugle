import type React from "react";
import { formatCost, formatInr, formatRelativeTime } from "../format";
import { IconCoins, IconLock } from "./Icons";

export type BadgeVariant = "category" | "status" | "technical" | "access";

export interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  title?: string;
  isPrivate?: boolean;
}

/**
 * Reusable core Badge component with unified height, radius, padding, and alignment.
 * All variants share identical dimensions; only color/background/border changes semantically.
 */
export function Badge({
  variant,
  children,
  icon,
  className = "",
  title,
  isPrivate = false,
}: BadgeProps) {
  const variantClass = `badge-variant-${variant}`;
  const privateClass = variant === "access" && isPrivate ? "access-private" : "";

  return (
    <span
      className={`badge-base ${variantClass} ${privateClass} ${className}`.trim()}
      title={title}
    >
      {icon && <span className="badge-icon-wrap">{icon}</span>}
      <span className="badge-label">{children}</span>
    </span>
  );
}

/**
 * A. Category Badge
 * Purpose: Topic/category of the investigation (e.g. Technology, AI, Finance).
 * Style: Small compact pill, gold/amber accent, subtle tinted background, 1px border.
 */
export function CategoryBadge({
  category,
  className = "",
}: {
  category: string;
  className?: string;
}) {
  return (
    <Badge variant="category" className={className} title={`Category: ${category}`}>
      {category}
    </Badge>
  );
}

/**
 * B. Status Badge
 * Purpose: State/status such as "Latest Dispatch", "New", "Updated".
 * Style: Green accent, filled/tinted background, optional status indicator dot.
 */
export function StatusBadge({
  status = "Latest Dispatch",
  dot = true,
  className = "",
}: {
  status?: string;
  dot?: boolean;
  className?: string;
}) {
  return (
    <Badge
      variant="status"
      className={className}
      icon={dot ? <span className="badge-status-dot" aria-hidden="true" /> : undefined}
      title={`Status: ${status}`}
    >
      {status}
    </Badge>
  );
}

/**
 * C. Technical / Model Tag
 * Purpose: Model engine, provider, or technical metadata (e.g. deepseek-v4-flash, standard).
 * Style: Neutral blue-gray, monospace typography, visually quiet.
 */
export function TechnicalTag({
  label,
  className = "",
  title,
}: {
  label?: string | null;
  className?: string;
  title?: string;
}) {
  if (!label) return null;
  return (
    <Badge variant="technical" className={className} title={title ?? `Engine/Tag: ${label}`}>
      {label}
    </Badge>
  );
}

/**
 * D. Access / Visibility Badge
 * Purpose: Visibility/access state (Private, Public).
 * Style: Neutral gray by default; muted red/pink with lock icon for Private.
 */
export function AccessBadge({
  visibility = "public",
  className = "",
}: {
  visibility: "private" | "public" | string;
  className?: string;
}) {
  const isPriv = visibility === "private";
  return (
    <Badge
      variant="access"
      isPrivate={isPriv}
      className={className}
      icon={isPriv ? <IconLock className="badge-access-icon" /> : undefined}
      title={`Visibility: ${visibility}`}
    >
      {isPriv ? "Private" : "Public"}
    </Badge>
  );
}

/* ==========================================================================
   Non-Badge Inline Metadata Components
   (Cost, Reading time, Evidence — rendered as quiet text, NOT colored pills)
   ========================================================================== */

/**
 * E. Cost Metadata (Inline text, NOT a pill badge)
 */
export function CostMetadata({
  costUsd,
  costInr,
  exchangeRate,
  className = "",
}: {
  costUsd?: number | null;
  costInr?: number | null;
  exchangeRate?: number | null;
  className?: string;
}) {
  if (costUsd === null || costUsd === undefined) return null;

  const tooltip = `Cost: $${costUsd.toFixed(4)} USD${
    costInr !== null && costInr !== undefined
      ? ` ≈ ${formatInr(costInr)} INR (@ ₹${exchangeRate || 95.56}/$)`
      : ""
  }`;

  return (
    <span className={`inline-cost-meta ${className}`.trim()} title={tooltip}>
      <IconCoins className="inline-cost-icon" />
      <span className="cost-usd">{formatCost(costUsd)}</span>
      {costInr !== null && costInr !== undefined && (
        <span className="cost-inr">({formatInr(costInr)})</span>
      )}
    </span>
  );
}

/**
 * F. Reading Metadata (Subdued inline text: read duration · time ago · cost)
 */
export function ReadingMetadata({
  readDuration,
  publishedAt,
  costUsd,
  costInr,
  exchangeRate,
  className = "",
}: {
  readDuration?: string;
  publishedAt?: string | null;
  costUsd?: number | null;
  costInr?: number | null;
  exchangeRate?: number | null;
  className?: string;
}) {
  return (
    <div className={`card-reading-meta ${className}`.trim()}>
      {readDuration && <span className="meta-text">{readDuration}</span>}
      {readDuration && publishedAt && <span className="meta-sep">·</span>}
      {publishedAt && (
        <span className="meta-text">{formatRelativeTime(publishedAt)}</span>
      )}
      {costUsd !== null && costUsd !== undefined && (
        <>
          <span className="meta-sep">·</span>
          <CostMetadata
            costUsd={costUsd}
            costInr={costInr}
            exchangeRate={exchangeRate}
          />
        </>
      )}
    </div>
  );
}

/**
 * G. Evidence Metadata (Quiet supporting text at card bottom: sources · claims)
 */
export function EvidenceMetadata({
  sourceCount = 0,
  claimCount = 0,
  className = "",
}: {
  sourceCount: number;
  claimCount: number;
  className?: string;
}) {
  return (
    <span className={`inline-evidence-meta ${className}`.trim()}>
      {sourceCount} {sourceCount === 1 ? "source" : "sources"} · {claimCount}{" "}
      {claimCount === 1 ? "claim" : "claims"}
    </span>
  );
}
