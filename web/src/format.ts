/**
 * Formatting utilities for Bugle frontend.
 * Centralized helpers for dates, currency, durations, models, and sizes.
 */

export function formatCost(usd: number | null | undefined): string | null {
  if (usd === null || usd === undefined) return null;
  if (usd === 0) return "$0.00";
  if (usd < 0.0001) return "<$0.0001";
  if (usd < 1.0) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

export function formatInr(inr: number | null | undefined): string | null {
  if (inr === null || inr === undefined) return null;
  return `₹${inr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDuration(sec: number | null | undefined): string | null {
  if (sec === null || sec === undefined) return null;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const mins = Math.floor(sec / 60);
  const rem = Math.round(sec % 60);
  return `${mins}m ${rem}s`;
}

export function formatModel(model: string | null | undefined): string | null {
  if (!model) return null;
  const parts = model.split("/");
  const name = parts[parts.length - 1];
  return name.replace(/-0731|-exp/g, "");
}

export function formatTime(iso: string | null): string {
  if (!iso) return "Unknown";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function formatDateTimeParts(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: "Unknown", time: "" };
  try {
    const date = new Date(iso);
    return {
      date: date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
      time: date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
    };
  } catch {
    return { date: iso, time: "" };
  }
}

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return "Recently";
  try {
    const d = new Date(iso);
    const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diffSec < 0) return "Just now";
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) {
      return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
    }
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "Recently";
  }
}

export function estimateReadingTime(text?: string | null): string {
  if (!text) return "2 min read";
  const words = text.trim().split(/\s+/).length;
  const minutes = Math.max(1, Math.ceil(words / 160));
  return `${minutes} min read`;
}

export function getOperatorInitials(email: string | null | undefined): string {
  if (!email) return "GS";
  const user = email.split("@")[0];
  const segments = user.split(/[._-]/).filter(Boolean);
  if (segments.length >= 2) {
    return (segments[0][0] + segments[1][0]).toUpperCase();
  }
  return user.slice(0, 2).toUpperCase();
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
