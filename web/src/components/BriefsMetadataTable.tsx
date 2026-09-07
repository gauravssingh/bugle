import { useMemo, useState } from "react";
import type { BriefSummary } from "../api";
import {
  IconCoins,
  IconCpu,
  IconDatabase,
  IconDownload,
  IconExternalLink,
  IconHistory,
  IconSearch,
} from "./Icons";
import { CategoryBadge } from "./Badge";
import {
  formatCompactNumber,
  formatCost,
  formatDuration,
  formatInr,
  formatModel,
  formatRelativeTime,
  formatTime,
  formatTokens,
} from "../format";

export type SortField =
  | "published_at"
  | "cost_usd"
  | "duration_seconds"
  | "total_tokens"
  | "model"
  | "title"
  | "evidence";

interface BriefsMetadataTableProps {
  briefs: BriefSummary[];
  onOpenBrief: (id: string) => void;
  title?: string;
  subtitle?: string;
  initialSortField?: SortField;
  initialSortDir?: "asc" | "desc";
  showKpis?: boolean;
  showCategoryFilter?: boolean;
  className?: string;
}

export function BriefsMetadataTable({
  briefs,
  onOpenBrief,
  title = "Bugle Execution & Cost Ledger",
  subtitle = "High-level metadata across all investigations: cost, execution duration, model engine, tokens, and evidence count.",
  initialSortField = "published_at",
  initialSortDir = "desc",
  showKpis = true,
  showCategoryFilter = true,
  className = "",
}: BriefsMetadataTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>(initialSortField);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(initialSortDir);

  // Derive available categories
  const categories = useMemo(() => {
    const cats = briefs.map((b) => b.category).filter(Boolean);
    const unique = Array.from(new Set(cats));
    return ["all", ...unique];
  }, [briefs]);

  // Filter briefs
  const filteredBriefs = useMemo(() => {
    return briefs.filter((b) => {
      // Category filter
      if (selectedCategory !== "all" && b.category.toLowerCase() !== selectedCategory.toLowerCase()) {
        return false;
      }
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const inTitle = b.title.toLowerCase().includes(q);
        const inCat = b.category.toLowerCase().includes(q);
        const inModel = (b.model || "").toLowerCase().includes(q);
        const inTags = (b.tags || []).some((t) => t.toLowerCase().includes(q));
        if (!inTitle && !inCat && !inModel && !inTags) {
          return false;
        }
      }
      return true;
    });
  }, [briefs, selectedCategory, searchQuery]);

  // Sort filtered briefs
  const sortedBriefs = useMemo(() => {
    const sorted = [...filteredBriefs];
    sorted.sort((a, b) => {
      let valA: string | number | null = null;
      let valB: string | number | null = null;

      switch (sortField) {
        case "published_at":
          valA = new Date(a.published_at).getTime();
          valB = new Date(b.published_at).getTime();
          break;
        case "cost_usd":
          valA = a.cost_usd ?? -1;
          valB = b.cost_usd ?? -1;
          break;
        case "duration_seconds":
          valA = a.duration_seconds ?? -1;
          valB = b.duration_seconds ?? -1;
          break;
        case "total_tokens":
          valA = a.total_tokens ?? -1;
          valB = b.total_tokens ?? -1;
          break;
        case "model":
          valA = a.model || "";
          valB = b.model || "";
          break;
        case "title":
          valA = a.title.toLowerCase();
          valB = b.title.toLowerCase();
          break;
        case "evidence":
          valA = a.source_count + a.claim_count;
          valB = b.source_count + b.claim_count;
          break;
      }

      if (valA === valB) return 0;
      if (valA === null || valA === -1) return 1;
      if (valB === null || valB === -1) return -1;

      if (sortDir === "asc") {
        return valA > valB ? 1 : -1;
      } else {
        return valA < valB ? 1 : -1;
      }
    });
    return sorted;
  }, [filteredBriefs, sortField, sortDir]);

  // Aggregate KPI summary metrics
  const kpis = useMemo(() => {
    let totalSpendUsd = 0;
    let totalSpendInr = 0;
    let recordedSpendCount = 0;
    let totalDurationSec = 0;
    let recordedDurationCount = 0;
    let totalTokens = 0;
    let totalSources = 0;
    let totalClaims = 0;

    for (const b of filteredBriefs) {
      if (b.cost_usd !== null && b.cost_usd !== undefined) {
        totalSpendUsd += b.cost_usd;
        recordedSpendCount++;
      }
      if (b.cost_inr !== null && b.cost_inr !== undefined) {
        totalSpendInr += b.cost_inr;
      }
      if (b.duration_seconds !== null && b.duration_seconds !== undefined) {
        totalDurationSec += b.duration_seconds;
        recordedDurationCount++;
      }
      if (b.total_tokens !== null && b.total_tokens !== undefined) {
        totalTokens += b.total_tokens;
      }
      totalSources += b.source_count || 0;
      totalClaims += b.claim_count || 0;
    }

    const avgCostUsd = recordedSpendCount > 0 ? totalSpendUsd / recordedSpendCount : 0;
    const avgDuration = recordedDurationCount > 0 ? totalDurationSec / recordedDurationCount : 0;

    return {
      count: filteredBriefs.length,
      totalSpendUsd,
      totalSpendInr,
      avgCostUsd,
      avgDuration,
      totalTokens,
      totalSources,
      totalClaims,
    };
  }, [filteredBriefs]);

  // Toggle sort field & direction
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      // Default numeric metrics to desc, text/title to asc
      setSortDir(field === "title" ? "asc" : "desc");
    }
  };

  // CSV Export
  const exportCsv = () => {
    const headers = [
      "id",
      "title",
      "category",
      "subcategory",
      "cost_usd",
      "cost_inr",
      "cost_exchange_rate",
      "duration_seconds",
      "model",
      "total_tokens",
      "input_tokens",
      "output_tokens",
      "source_count",
      "claim_count",
      "confidence",
      "visibility",
      "published_at",
    ];

    const rows = sortedBriefs.map((b) => [
      b.id,
      `"${b.title.replace(/"/g, '""')}"`,
      b.category,
      b.subcategory,
      b.cost_usd ?? "",
      b.cost_inr ?? "",
      b.cost_exchange_rate ?? "",
      b.duration_seconds ?? "",
      b.model ?? "",
      b.total_tokens ?? "",
      b.token_usage?.input ?? "",
      b.token_usage?.output ?? "",
      b.source_count,
      b.claim_count,
      b.confidence,
      b.visibility,
      b.published_at,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `bugle-metadata-ledger-${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getSortIndicator = (field: SortField) => {
    if (sortField !== field) return <span className="sort-arrow-inactive">↕</span>;
    return <span className="sort-arrow-active">{sortDir === "asc" ? "▲" : "▼"}</span>;
  };

  return (
    <div className={`bugle-metadata-ledger ${className}`.trim()}>
      {/* Header bar with title, count, search, export */}
      <div className="ledger-header">
        <div className="ledger-title-area">
          <div className="ledger-title-row">
            <h3 className="ledger-title">{title}</h3>
            <span className="ledger-count-pill">{filteredBriefs.length} bugles</span>
          </div>
          {subtitle && <p className="ledger-subtitle">{subtitle}</p>}
        </div>

        <div className="ledger-actions-bar">
          <div className="ledger-search-box">
            <IconSearch className="ledger-search-icon" />
            <input
              type="text"
              className="ledger-search-input"
              placeholder="Filter bugles, models, topics..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Filter metadata table"
            />
            {searchQuery && (
              <button
                type="button"
                className="ledger-search-clear"
                onClick={() => setSearchQuery("")}
                aria-label="Clear filter"
              >
                ✕
              </button>
            )}
          </div>

          {showCategoryFilter && categories.length > 2 && (
            <select
              className="ledger-category-select"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              aria-label="Filter by category"
            >
              <option value="all">All Categories ({briefs.length})</option>
              {categories
                .filter((c) => c !== "all")
                .map((cat) => {
                  const count = briefs.filter((b) => b.category === cat).length;
                  return (
                    <option key={cat} value={cat}>
                      {cat} ({count})
                    </option>
                  );
                })}
            </select>
          )}

          <button
            type="button"
            className="btn-ledger-export"
            onClick={exportCsv}
            title="Download metadata as CSV"
          >
            <IconDownload className="btn-export-icon" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Aggregate KPI Telemetry Bar */}
      {showKpis && (
        <div className="ledger-kpis-grid">
          <div className="ledger-kpi-card">
            <div className="kpi-label">
              <IconCoins className="kpi-icon" />
              <span>Total Research Spend</span>
            </div>
            <div className="kpi-val-row">
              <span className="kpi-val">${kpis.totalSpendUsd.toFixed(4)}</span>
              <span className="kpi-sub font-mono">
                {kpis.totalSpendInr > 0 ? formatInr(kpis.totalSpendInr) : ""}
              </span>
            </div>
            <div className="kpi-note font-mono">Avg ${kpis.avgCostUsd.toFixed(4)} / brief</div>
          </div>

          <div className="ledger-kpi-card">
            <div className="kpi-label">
              <IconCpu className="kpi-icon" />
              <span>Total Tokens Metered</span>
            </div>
            <div className="kpi-val-row">
              <span className="kpi-val font-mono">
                {formatCompactNumber(kpis.totalTokens) ?? "0"}
              </span>
              <span className="kpi-sub font-mono">tokens</span>
            </div>
            <div className="kpi-note font-mono">
              {formatTokens(kpis.totalTokens)} total volume
            </div>
          </div>

          <div className="ledger-kpi-card">
            <div className="kpi-label">
              <IconHistory className="kpi-icon" />
              <span>Avg Pipeline Duration</span>
            </div>
            <div className="kpi-val-row">
              <span className="kpi-val font-mono">{formatDuration(kpis.avgDuration) ?? "—"}</span>
              <span className="kpi-sub">sec</span>
            </div>
            <div className="kpi-note">{kpis.count} investigations tracked</div>
          </div>

          <div className="ledger-kpi-card">
            <div className="kpi-label">
              <IconDatabase className="kpi-icon" />
              <span>Evidence Grounding</span>
            </div>
            <div className="kpi-val-row">
              <span className="kpi-val font-mono">{kpis.totalSources}</span>
              <span className="kpi-sub font-mono">citations · {kpis.totalClaims} claims</span>
            </div>
            <div className="kpi-note font-mono">Multi-source verification</div>
          </div>
        </div>
      )}

      {/* Table Container */}
      <div className="ledger-table-wrapper">
        {sortedBriefs.length === 0 ? (
          <div className="ledger-empty-state">
            <p className="ledger-empty-title">No bugles match your filter</p>
            <p className="ledger-empty-desc">
              Try clearing your search query or selecting "All Categories".
            </p>
            <button
              type="button"
              className="btn-action-secondary"
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory("all");
              }}
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <table className="ledger-table">
            <thead>
              <tr>
                <th className="th-num">#</th>
                <th
                  className="th-sortable th-title"
                  onClick={() => handleSort("title")}
                  title="Sort by title"
                >
                  <div className="th-content">
                    <span>Investigation</span>
                    {getSortIndicator("title")}
                  </div>
                </th>
                <th
                  className="th-sortable th-cost"
                  onClick={() => handleSort("cost_usd")}
                  title="Sort by generation cost"
                >
                  <div className="th-content">
                    <span>Cost</span>
                    {getSortIndicator("cost_usd")}
                  </div>
                </th>
                <th
                  className="th-sortable th-duration"
                  onClick={() => handleSort("duration_seconds")}
                  title="Sort by execution duration"
                >
                  <div className="th-content">
                    <span>Duration</span>
                    {getSortIndicator("duration_seconds")}
                  </div>
                </th>
                <th
                  className="th-sortable th-model"
                  onClick={() => handleSort("model")}
                  title="Sort by AI model"
                >
                  <div className="th-content">
                    <span>AI Model</span>
                    {getSortIndicator("model")}
                  </div>
                </th>
                <th
                  className="th-sortable th-tokens"
                  onClick={() => handleSort("total_tokens")}
                  title="Sort by total tokens"
                >
                  <div className="th-content">
                    <span>Tokens</span>
                    {getSortIndicator("total_tokens")}
                  </div>
                </th>
                <th
                  className="th-sortable th-evidence"
                  onClick={() => handleSort("evidence")}
                  title="Sort by evidence count"
                >
                  <div className="th-content">
                    <span>Evidence</span>
                    {getSortIndicator("evidence")}
                  </div>
                </th>
                <th
                  className="th-sortable th-date"
                  onClick={() => handleSort("published_at")}
                  title="Sort by publication date"
                >
                  <div className="th-content">
                    <span>Published</span>
                    {getSortIndicator("published_at")}
                  </div>
                </th>
                <th className="th-action" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {sortedBriefs.map((b, idx) => {
                const modelFormatted = formatModel(b.model);
                const hasCost = b.cost_usd !== null && b.cost_usd !== undefined;
                const inrCost = b.cost_inr;

                return (
                  <tr
                    key={b.id}
                    className="ledger-row"
                    onClick={() => onOpenBrief(b.id)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onOpenBrief(b.id);
                      }
                    }}
                  >
                    <td className="td-num font-mono">{idx + 1}</td>

                    <td className="td-title">
                      <div className="td-title-container">
                        <div className="td-title-meta">
                          <CategoryBadge category={b.category} />
                          {b.subcategory && (
                            <span className="td-subcategory" title={b.subcategory}>
                              {b.subcategory}
                            </span>
                          )}
                        </div>
                        <a
                          href={`#/brief/${b.id}`}
                          className="td-title-link"
                          onClick={(e) => {
                            e.preventDefault();
                            onOpenBrief(b.id);
                          }}
                        >
                          {b.title}
                        </a>
                      </div>
                    </td>

                    <td className="td-cost font-mono">
                      {hasCost ? (
                        <div className="cost-cell-wrap">
                          <span className="cost-val-usd" title={`$${b.cost_usd!.toFixed(6)} USD`}>
                            {formatCost(b.cost_usd)}
                          </span>
                          {inrCost !== null && inrCost !== undefined && (
                            <span
                              className="cost-val-inr"
                              title={`Converted at ₹${b.cost_exchange_rate || 95.56}/$`}
                            >
                              {formatInr(inrCost)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="td-empty-val">—</span>
                      )}
                    </td>

                    <td className="td-duration font-mono">
                      {b.duration_seconds !== null && b.duration_seconds !== undefined ? (
                        <span className="duration-pill" title={`${b.duration_seconds}s execution`}>
                          {formatDuration(b.duration_seconds)}
                        </span>
                      ) : (
                        <span className="td-empty-val">—</span>
                      )}
                    </td>

                    <td className="td-model">
                      {b.model ? (
                        <span
                          className="model-tag-pill"
                          title={b.model}
                        >
                          {modelFormatted || b.model}
                        </span>
                      ) : (
                        <span className="td-empty-val">—</span>
                      )}
                    </td>

                    <td className="td-tokens font-mono">
                      {b.total_tokens !== null && b.total_tokens !== undefined ? (
                        <div className="tokens-cell-wrap">
                          <span className="tokens-total">
                            {formatTokens(b.total_tokens)}
                          </span>
                          {b.token_usage && (b.token_usage.input || b.token_usage.output) && (
                            <span
                              className="tokens-split"
                              title={`Input: ${b.token_usage.input?.toLocaleString() || 0} | Output: ${b.token_usage.output?.toLocaleString() || 0}${
                                b.token_usage.reasoning ? ` | Reasoning: ${b.token_usage.reasoning.toLocaleString()}` : ""
                              }`}
                            >
                              {formatCompactNumber(b.token_usage.input)} in / {formatCompactNumber(b.token_usage.output)} out
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="td-empty-val">—</span>
                      )}
                    </td>

                    <td className="td-evidence">
                      <div className="evidence-cell-wrap">
                        <span className="evidence-sources" title={`${b.source_count} cited sources`}>
                          {b.source_count} src
                        </span>
                        <span className="evidence-sep">·</span>
                        <span className="evidence-claims" title={`${b.claim_count} verified claims`}>
                          {b.claim_count} clm
                        </span>
                      </div>
                    </td>

                    <td className="td-date">
                      <div className="date-cell-wrap" title={formatTime(b.published_at)}>
                        <span className="date-relative">{formatRelativeTime(b.published_at)}</span>
                        <span className="date-abs">{b.published_at.slice(0, 10)}</span>
                      </div>
                    </td>

                    <td className="td-action">
                      <button
                        type="button"
                        className="btn-table-row-open"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenBrief(b.id);
                        }}
                        title="Open investigation detail"
                        aria-label={`Open ${b.title}`}
                      >
                        <IconExternalLink />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Table Footer with Summary Stats */}
      {sortedBriefs.length > 0 && (
        <div className="ledger-footer-summary">
          <div className="footer-stat">
            Showing <strong className="font-mono">{sortedBriefs.length}</strong> of{" "}
            <strong className="font-mono">{briefs.length}</strong> bugles
          </div>
          <div className="footer-stat font-mono">
            Filtered Total: <strong>${kpis.totalSpendUsd.toFixed(4)} USD</strong>
            {kpis.totalSpendInr > 0 && <span> ({formatInr(kpis.totalSpendInr)})</span>}
          </div>
          <div className="footer-stat font-mono">
            Tokens: <strong>{formatTokens(kpis.totalTokens)}</strong>
          </div>
        </div>
      )}
    </div>
  );
}
