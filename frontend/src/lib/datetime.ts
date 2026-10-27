/**
 * Plant-local naive datetime helpers.
 *
 * SAP datetimes arrive as naive ISO strings (`2026-10-26T06:00:00`) representing
 * America/Sao_Paulo plant time. We NEVER pass them through `new Date(str)` for
 * display (which may apply timezone shifts); instead we parse the components manually.
 */

const pad = (n: number) => String(n).padStart(2, '0')

export interface NaiveParts {
  y: number
  mo: number
  d: number
  h: number
  mi: number
  s: number
}

export function parseNaive(iso: string | null | undefined): NaiveParts | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(iso)
  if (!m) return null
  return {
    y: Number(m[1]),
    mo: Number(m[2]),
    d: Number(m[3]),
    h: m[4] ? Number(m[4]) : 0,
    mi: m[5] ? Number(m[5]) : 0,
    s: m[6] ? Number(m[6]) : 0,
  }
}

/** dd/mm/yyyy hh:mm from naive ISO */
export function fmtNaiveDateTime(iso: string | null | undefined, withSeconds = false): string {
  const p = parseNaive(iso)
  if (!p) return '—'
  const base = `${pad(p.d)}/${pad(p.mo)}/${p.y} ${pad(p.h)}:${pad(p.mi)}`
  return withSeconds ? `${base}:${pad(p.s)}` : base
}

export function fmtNaiveDate(iso: string | null | undefined): string {
  const p = parseNaive(iso)
  if (!p) return '—'
  return `${pad(p.d)}/${pad(p.mo)}/${p.y}`
}

export function fmtNaiveShort(iso: string | null | undefined): string {
  const p = parseNaive(iso)
  if (!p) return '—'
  return `${pad(p.d)}/${pad(p.mo)} ${pad(p.h)}:${pad(p.mi)}`
}

/** "HH:MM:SS" → "HH:MM" */
export function fmtTime(t: string | null | undefined): string {
  if (!t) return ''
  return t.slice(0, 5)
}

/** Format date-only "YYYY-MM-DD" to dd/mm */
export function fmtDayLabel(date: string): string {
  const p = parseNaive(date)
  if (!p) return date
  return `${pad(p.d)}/${pad(p.mo)}`
}

/** System timestamps (with offset) — safe to use Date. */
export function fmtSystemDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export function fmtRelativeSystem(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const diff = (Date.now() - d.getTime()) / 1000
  if (Number.isNaN(diff)) return ''
  if (diff < 60) return 'agora'
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`
  return fmtSystemDateTime(iso)
}

// ---- local calendar helpers (browser clock assumed = plant clock) ----

export function toNaive(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
}

export function toDateOnly(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function todayDateOnly(): string {
  return toDateOnly(new Date())
}

/** naive ISO → value for <input type="datetime-local"> */
export function naiveToInput(iso: string | null | undefined): string {
  const p = parseNaive(iso)
  if (!p) return ''
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`
}

/** <input type="datetime-local"> value → naive ISO with seconds */
export function inputToNaive(v: string): string | undefined {
  if (!v) return undefined
  return v.length === 16 ? `${v}:00` : v
}

export type PeriodKey = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'custom' | 'all'

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: 'Hoje',
  yesterday: 'Ontem',
  week: 'Esta Semana',
  month: 'Este Mês',
  year: 'Este Ano',
  custom: 'Personalizado',
  all: 'Tudo',
}

/** Calendar boundaries; end exclusive. Week starts on Monday. */
export function periodRange(p: PeriodKey): { start?: string; end?: string } {
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
  switch (p) {
    case 'today':
      return { start: toNaive(startOfDay), end: toNaive(addDays(startOfDay, 1)) }
    case 'yesterday':
      return { start: toNaive(addDays(startOfDay, -1)), end: toNaive(startOfDay) }
    case 'week': {
      const dow = (startOfDay.getDay() + 6) % 7 // monday=0
      const s = addDays(startOfDay, -dow)
      return { start: toNaive(s), end: toNaive(addDays(s, 7)) }
    }
    case 'month': {
      const s = new Date(now.getFullYear(), now.getMonth(), 1)
      const e = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      return { start: toNaive(s), end: toNaive(e) }
    }
    case 'year': {
      const s = new Date(now.getFullYear(), 0, 1)
      const e = new Date(now.getFullYear() + 1, 0, 1)
      return { start: toNaive(s), end: toNaive(e) }
    }
    default:
      return {}
  }
}

export function fmtMinutes(min: number | null | undefined): string {
  if (min == null || Number.isNaN(min)) return '—'
  const m = Math.round(min)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h}h ${pad(r)}min` : `${h}h`
}

export function fmtHours(min: number | null | undefined): string {
  if (min == null) return '—'
  return `${(min / 60).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`
}
