import { request, requestBlobOrJson, uploadWithProgress, type BlobResult } from './client'
import { filtersToQuery } from './filters'
import type {
  ApiTokenCreated,
  ApiTokenItem,
  BadActors,
  Comment,
  DailyMode,
  DailyWindow,
  Facets,
  FailureModes,
  GenerateRequest,
  GenerateTextResult,
  Health,
  JumpFilter,
  Kpis,
  Neighbors,
  OccurrenceCounts,
  OccurrenceDetail,
  OccurrenceFilters,
  OccurrencePatch,
  OccurrenceSummary,
  Paginated,
  PdfDocument,
  Preset,
  PresetInput,
  ReportField,
  ReportTemplate,
  ReportTemplateInput,
  Settings,
  UploadResult,
  User,
  Webhook,
  WebhookInput,
} from './types'

// ---------------- Auth ----------------
export const authApi = {
  login: (email: string, password: string) =>
    request<{ user: User }>('/auth/login', { method: 'POST', json: { email, password }, skipAuthRedirect: true }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST', skipAuthRedirect: true }),
  me: () => request<User>('/auth/me', { skipAuthRedirect: true }),
}

// ---------------- Documents ----------------
export const documentsApi = {
  list: (limit = 50, offset = 0) => request<Paginated<PdfDocument>>('/documents', { query: { limit, offset } }),
  get: (id: string) => request<PdfDocument>(`/documents/${id}`),
  fileUrl: (id: string) => `/api/v1/documents/${id}/file`,
  remove: (id: string) => request<unknown>(`/documents/${id}`, { method: 'DELETE' }),
  upload: (files: File[], onProgress?: (f: number) => void) => {
    const fd = new FormData()
    for (const f of files) fd.append('files', f, f.name)
    return uploadWithProgress<UploadResult>('/documents/upload', fd, onProgress)
  },
}

// ---------------- Occurrences ----------------
export const occurrencesApi = {
  list: (filters: OccurrenceFilters, limit = 50, offset = 0, signal?: AbortSignal) =>
    request<Paginated<OccurrenceSummary>>('/occurrences', {
      query: { ...filtersToQuery(filters), limit, offset },
      signal,
    }),
  counts: (filters: OccurrenceFilters, signal?: AbortSignal) =>
    request<OccurrenceCounts>('/occurrences/counts', { query: filtersToQuery(filters), signal }),
  get: (id: string, signal?: AbortSignal) => request<OccurrenceDetail>(`/occurrences/${id}`, { signal }),
  patch: (id: string, patch: OccurrencePatch) =>
    request<OccurrenceDetail>(`/occurrences/${id}`, { method: 'PATCH', json: patch }),
  neighbors: (id: string, filters: OccurrenceFilters) =>
    request<Neighbors>(`/occurrences/${id}/neighbors`, { query: filtersToQuery(filters) }),
  comments: (id: string) => request<Comment[]>(`/occurrences/${id}/comments`),
  addComment: (id: string, comment_text: string, is_action_item: boolean) =>
    request<Comment>(`/occurrences/${id}/comments`, { method: 'POST', json: { comment_text, is_action_item } }),
  updateComment: (commentId: string, patch: { comment_text?: string; is_action_item?: boolean }) =>
    request<Comment>(`/comments/${commentId}`, { method: 'PATCH', json: patch }),
  deleteComment: (commentId: string) => request<{ ok: boolean }>(`/comments/${commentId}`, { method: 'DELETE' }),
}

// ---------------- Daily ----------------
export const dailyApi = {
  window: (mode: DailyMode, n?: number, ref?: string) =>
    request<DailyWindow>('/daily/window', { query: { mode, n: mode === 'days' ? n : undefined, ref } }),
}

// ---------------- Presets ----------------
export const presetsApi = {
  list: () => request<Preset[]>('/presets'),
  create: (p: PresetInput) => request<Preset>('/presets', { method: 'POST', json: p }),
  update: (id: string, p: PresetInput) => request<Preset>(`/presets/${id}`, { method: 'PUT', json: p }),
  remove: (id: string) => request<unknown>(`/presets/${id}`, { method: 'DELETE' }),
}

// ---------------- Dashboards ----------------
export const dashboardsApi = {
  kpis: (f: OccurrenceFilters) => request<Kpis>('/dashboards/kpis', { query: filtersToQuery(f) }),
  badActors: (f: OccurrenceFilters, days: number, min_count = 2) =>
    request<BadActors>('/dashboards/bad-actors', { query: { ...filtersToQuery(f), days, min_count } }),
  failureModes: (f: OccurrenceFilters) =>
    request<FailureModes>('/dashboards/failure-modes', { query: filtersToQuery(f) }),
  jumps: (f: OccurrenceFilters, jump_status: JumpFilter) =>
    request<Paginated<OccurrenceSummary>>('/dashboards/jumps', { query: { ...filtersToQuery(f), jump_status } }),
}

// ---------------- Reports ----------------
export const reportsApi = {
  templates: () => request<ReportTemplate[]>('/report-templates'),
  createTemplate: (t: ReportTemplateInput) =>
    request<ReportTemplate>('/report-templates', { method: 'POST', json: t }),
  updateTemplate: (id: string, t: ReportTemplateInput) =>
    request<ReportTemplate>(`/report-templates/${id}`, { method: 'PUT', json: t }),
  deleteTemplate: (id: string) => request<unknown>(`/report-templates/${id}`, { method: 'DELETE' }),
  fields: () => request<ReportField[]>('/report-fields'),
  generate: (req: GenerateRequest) =>
    requestBlobOrJson<GenerateTextResult>('/reports/generate', { method: 'POST', json: req }),
}
export type { BlobResult }

// ---------------- Settings / meta / tokens / webhooks ----------------
export const settingsApi = {
  get: () => request<Settings>('/settings'),
  put: (s: Settings) => request<Settings>('/settings', { method: 'PUT', json: s }),
}

export const metaApi = {
  facets: (f: OccurrenceFilters = {}) => request<Facets>('/meta/facets', { query: filtersToQuery(f) }),
  health: () => request<Health>('/health'),
}

export const tokensApi = {
  list: async () => {
    const r = await request<ApiTokenItem[] | Paginated<ApiTokenItem>>('/api-tokens')
    return Array.isArray(r) ? r : r.items
  },
  create: (name: string) => request<ApiTokenCreated>('/api-tokens', { method: 'POST', json: { name } }),
  revoke: (id: string) => request<unknown>(`/api-tokens/${id}`, { method: 'DELETE' }),
}

export const webhooksApi = {
  list: async () => {
    const r = await request<Webhook[] | Paginated<Webhook>>('/webhooks')
    return Array.isArray(r) ? r : r.items
  },
  create: (w: WebhookInput) => request<Webhook>('/webhooks', { method: 'POST', json: w }),
  update: (id: string, w: WebhookInput) => request<Webhook>(`/webhooks/${id}`, { method: 'PUT', json: w }),
  remove: (id: string) => request<unknown>(`/webhooks/${id}`, { method: 'DELETE' }),
}
