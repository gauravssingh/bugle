/**
 * Bugle Typed API Client.
 * Central client for all REST endpoints and domain models.
 */

export type AuthInfo = {
  role: string;
  email: string | null;
  is_admin: boolean;
  is_service: boolean;
  public_enabled: boolean;
};

export type BriefSummary = {
  id: string;
  job_id: string | null;
  title: string;
  summary: string;
  category: string;
  subcategory: string;
  tags: string[];
  confidence: string;
  visibility: string;
  research_type: string;
  research_depth: string;
  source_count: number;
  claim_count: number;
  cost_usd: number | null;
  cost_inr: number | null;
  cost_exchange_rate: number | null;
  duration_seconds: number | null;
  model: string | null;
  total_tokens: number | null;
  published_at: string;
  created_at: string;
};

export type Source = {
  id: number;
  brief_id: string;
  title: string;
  url: string;
  publisher: string;
  author: string | null;
  source_type: string;
  reliability: string;
  published_at: string | null;
  retrieved_at: string;
  relevance: string | null;
};

export type Claim = {
  id: number;
  brief_id: string;
  statement: string;
  status: string;
  evidence_summary: string;
  source_ids: number[];
};

export type BriefDetail = BriefSummary & {
  content_markdown: string;
  token_usage: {
    input?: number;
    output?: number;
    reasoning?: number;
    total?: number;
  } | null;
  execution_meta: Record<string, any>;
  research_started_at: string | null;
  research_completed_at: string | null;
  sources: Source[];
  claims: Claim[];
};

export type BriefRevision = {
  id: number;
  brief_id: string;
  title: string;
  summary: string;
  content_markdown: string;
  claims_snapshot: Array<{
    statement: string;
    status: string;
    evidence_summary: string;
    source_ids: number[];
  }>;
  created_at: string;
};

export type JobEvent = {
  id: number;
  job_id: string;
  from_status: string | null;
  to_status: string;
  message: string | null;
  created_at: string;
};

export type ResearchJob = {
  id: string;
  topic: string;
  research_type: string;
  research_depth: string;
  status: string;
  execution_meta: Record<string, any>;
  cost_usd: number | null;
  cost_inr: number | null;
  cost_exchange_rate: number | null;
  duration_seconds: number | null;
  model: string | null;
  token_usage: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  events?: JobEvent[];
};

export type TaxonomyCategory = {
  name: string;
  count: number;
  subcategories: string[];
};

export type TaxonomyTag = {
  name: string;
  count: number;
};

export type Taxonomies = {
  categories: TaxonomyCategory[];
  tags: TaxonomyTag[];
  total_spend_usd: number;
  avg_duration_seconds: number;
  total_briefs: number;
};

export type DbHealth = {
  integrity_ok: boolean;
  foreign_keys_ok: boolean;
  page_count: number;
  freelist_pages: number;
  fragmentation_pct: number;
  db_size_bytes: number;
  wal_size_bytes: number;
};

export type SystemStatus = {
  status: string;
  app: string;
  version: string;
  database: {
    briefs: number;
    jobs: number;
  };
  latest_job: {
    id: string;
    status: string;
    created_at: string;
  } | null;
};

export type DbVacuumResponse = {
  status: string;
  message: string;
  page_count: number;
  freelist_pages: number;
  fragmentation_pct: number;
  db_size_bytes: number;
  wal_size_bytes: number;
};

export type QuickIngestResponse = {
  status: string;
  job_id: string;
  topic: string;
  research_depth: string;
  view_url: string;
  message: string;
};

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      // Keep the status-based fallback when the server response is not JSON.
    }
    throw new Error(detail);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  getAuth: (signal?: AbortSignal) => request<AuthInfo>("/api/v1/auth/me", { signal }),

  getBriefs: (
    params: {
      search?: string;
      category?: string;
      subcategory?: string;
      tag?: string;
      visibility?: string;
      limit?: number;
      offset?: number;
    } = {},
    signal?: AbortSignal
  ) => {
    const query = new URLSearchParams();
    if (params.search?.trim()) query.set("search", params.search.trim());
    if (params.category && params.category !== "all") query.set("category", params.category);
    if (params.subcategory) query.set("subcategory", params.subcategory);
    if (params.tag) query.set("tag", params.tag);
    if (params.visibility) query.set("visibility", params.visibility);
    if (params.limit !== undefined) query.set("limit", String(params.limit));
    if (params.offset !== undefined) query.set("offset", String(params.offset));

    const qs = query.toString();
    return request<{ briefs: BriefSummary[]; total: number; limit: number; offset: number }>(
      qs ? `/api/v1/briefs?${qs}` : "/api/v1/briefs",
      { signal }
    );
  },

  getBrief: (id: string, signal?: AbortSignal) =>
    request<BriefDetail>(`/api/v1/briefs/${encodeURIComponent(id)}`, { signal }),

  getBriefRevisions: (id: string, signal?: AbortSignal) =>
    request<BriefRevision[]>(`/api/v1/briefs/${encodeURIComponent(id)}/revisions`, { signal }),

  updateBrief: (id: string, payload: Partial<BriefDetail>) =>
    request<BriefDetail>(`/api/v1/briefs/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  deleteBrief: (id: string) =>
    request<void>(`/api/v1/briefs/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  getTaxonomies: (signal?: AbortSignal) =>
    request<Taxonomies>("/api/v1/taxonomies", { signal }),

  getSystemStatus: (signal?: AbortSignal) =>
    request<SystemStatus>("/api/v1/system/status", { signal }),

  getDbHealth: (signal?: AbortSignal) =>
    request<DbHealth>("/api/v1/system/db-health", { signal }),

  vacuumDb: () =>
    request<DbVacuumResponse>("/api/v1/system/db-vacuum", {
      method: "POST",
    }),

  getJobs: (limit: number = 50, offset: number = 0, signal?: AbortSignal) =>
    request<{ jobs: ResearchJob[]; total: number }>(
      `/api/v1/jobs?limit=${limit}&offset=${offset}`,
      { signal }
    ),

  getJob: (id: string, signal?: AbortSignal) =>
    request<ResearchJob>(`/api/v1/jobs/${encodeURIComponent(id)}`, { signal }),

  getJobEvents: (id: string, signal?: AbortSignal) =>
    request<JobEvent[]>(`/api/v1/jobs/${encodeURIComponent(id)}/events`, { signal }),

  quickIngest: (payload: { title?: string; url?: string; text?: string; research_depth?: string; research_type?: string }) =>
    request<QuickIngestResponse>("/api/v1/ingest/quick", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
