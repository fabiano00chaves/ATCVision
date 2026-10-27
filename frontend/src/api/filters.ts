import type { QueryParams } from './client'
import type { OccurrenceFilters, PresetFilterPayload, ReportFilters } from './types'
import { periodRange, type PeriodKey } from '@/lib/datetime'

const ARRAY_KEYS = [
  'document_ids',
  'fl_prefixes',
  'arvores',
  'specialties',
  'turnos',
  'planning_groups',
  'tipos',
  'status_atc',
  'prioridade_atc',
] as const
const STRING_KEYS = ['start', 'end', 'q', 'nota', 'ordem', 'fl_desc', 'preset_id', 'sort'] as const
const BOOL_KEYS = ['only_pane', 'only_jump', 'only_relevant', 'only_analyze'] as const

export type ArrayFilterKey = (typeof ARRAY_KEYS)[number]
export type BoolFilterKey = (typeof BOOL_KEYS)[number]
export const FILTER_URL_KEYS: string[] = [...ARRAY_KEYS, ...STRING_KEYS, ...BOOL_KEYS, 'period']

/** Shared filters → API query params (csv arrays, booleans only when true). */
export function filtersToQuery(f: OccurrenceFilters): QueryParams {
  const q: QueryParams = {}
  for (const k of ARRAY_KEYS) {
    const v = f[k] as string[] | undefined
    if (v && v.length) q[k] = v.join(',')
  }
  for (const k of STRING_KEYS) {
    const v = f[k]
    if (v) q[k] = String(v).trim()
  }
  for (const k of BOOL_KEYS) if (f[k]) q[k] = true
  return q
}

/** Shared filters → JSON body for POST /reports/generate (arrays kept as arrays). */
export function filtersToReportJson(f: OccurrenceFilters): ReportFilters {
  const out: Record<string, unknown> = {}
  for (const k of ARRAY_KEYS) {
    const v = f[k] as string[] | undefined
    if (v && v.length) out[k] = v
  }
  for (const k of STRING_KEYS) {
    const v = f[k]
    if (v) out[k] = String(v).trim()
  }
  for (const k of BOOL_KEYS) if (f[k]) out[k] = true
  return out as ReportFilters
}

export interface UrlFilterState {
  filters: OccurrenceFilters
  period: PeriodKey
}

/** Parse filters from URL search params. */
export function parseFilterParams(sp: URLSearchParams, defaultPeriod: PeriodKey = 'all'): UrlFilterState {
  const f: Record<string, unknown> = {}
  for (const k of ARRAY_KEYS) {
    const v = sp.get(k)
    if (v) f[k] = v.split(',').map((s) => s.trim()).filter(Boolean)
  }
  for (const k of STRING_KEYS) {
    const v = sp.get(k)
    if (v) f[k] = v
  }
  for (const k of BOOL_KEYS) {
    if (sp.get(k) === 'true' || sp.get(k) === '1') f[k] = true
  }
  const rawPeriod = sp.get('period') as PeriodKey | null
  let period: PeriodKey = rawPeriod ?? (f.start || f.end ? 'custom' : defaultPeriod)
  if (!['today', 'yesterday', 'week', 'month', 'year', 'custom', 'all'].includes(period)) period = defaultPeriod
  if (period !== 'custom') {
    const r = periodRange(period)
    f.start = r.start
    f.end = r.end
  }
  return { filters: f as OccurrenceFilters, period }
}

/** Write filters into URL search params (mutates a copy, keeps unrelated params). */
export function writeFilterParams(
  base: URLSearchParams,
  filters: OccurrenceFilters,
  period: PeriodKey,
  defaultPeriod: PeriodKey = 'all',
): URLSearchParams {
  const sp = new URLSearchParams(base)
  for (const k of FILTER_URL_KEYS) sp.delete(k)
  for (const k of ARRAY_KEYS) {
    const v = filters[k] as string[] | undefined
    if (v && v.length) sp.set(k, v.join(','))
  }
  for (const k of STRING_KEYS) {
    if (k === 'start' || k === 'end') continue
    const v = filters[k]
    if (v) sp.set(k, String(v))
  }
  for (const k of BOOL_KEYS) if (filters[k]) sp.set(k, 'true')
  if (period === 'custom') {
    sp.set('period', 'custom')
    if (filters.start) sp.set('start', filters.start)
    if (filters.end) sp.set('end', filters.end)
  } else if (period !== defaultPeriod) {
    sp.set('period', period)
  }
  return sp
}

export function countActiveFilters(f: OccurrenceFilters, ignore: string[] = []): number {
  let n = 0
  for (const k of ARRAY_KEYS) if (!ignore.includes(k) && (f[k] as string[] | undefined)?.length) n++
  for (const k of ['q', 'nota', 'ordem', 'fl_desc'] as const) if (!ignore.includes(k) && f[k]) n++
  for (const k of BOOL_KEYS) if (!ignore.includes(k) && f[k]) n++
  return n
}

export const EMPTY_PRESET_PAYLOAD: PresetFilterPayload = {
  functional_locations_prefixes: [],
  planning_groups: [],
  specialties: [],
  reportado_por_ids: [],
  keywords: [],
  tipos: [],
  only_pane: false,
  only_jump: false,
  only_relevant: false,
  only_analyze: false,
}

/** Extended payload: contract keys + optional extras (arvores/turnos/status_atc/fl_desc). */
export type ExtendedPresetPayload = PresetFilterPayload & {
  arvores?: string[]
  turnos?: string[]
  status_atc?: string[]
  fl_desc?: string
}

export function presetPayloadFromFilters(f: OccurrenceFilters): ExtendedPresetPayload {
  const p: ExtendedPresetPayload = {
    ...EMPTY_PRESET_PAYLOAD,
    functional_locations_prefixes: f.fl_prefixes ?? [],
    planning_groups: f.planning_groups ?? [],
    specialties: f.specialties ?? [],
    keywords: f.q ? [f.q.trim()] : [],
    tipos: f.tipos ?? [],
    only_pane: !!f.only_pane,
    only_jump: !!f.only_jump,
    only_relevant: !!f.only_relevant,
    only_analyze: !!f.only_analyze,
  }
  if (f.arvores?.length) p.arvores = f.arvores
  if (f.turnos?.length) p.turnos = f.turnos
  if (f.status_atc?.length) p.status_atc = f.status_atc
  if (f.fl_desc) p.fl_desc = f.fl_desc
  return p
}

export function stableKey(f: OccurrenceFilters): string {
  return JSON.stringify(filtersToQuery(f))
}
