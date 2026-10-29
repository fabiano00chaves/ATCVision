import type { OccurrenceFilters, Preset } from '@/api/types'

/** Filter keys that a preset ("Foco Rápido") is allowed to control. */
export const PRESET_CONTROLLED_KEYS = [
  'preset_id',
  'fl_prefixes',
  'arvores',
  'specialties',
  'turnos',
  'planning_groups',
  'only_pane',
  'only_jump',
  'only_relevant',
  'only_analyze',
] as const

/** Translate a preset payload into shared OccurrenceFilters fields. */
export function presetToFilters(preset: Preset | null | undefined): OccurrenceFilters {
  if (!preset) return {}
  const p = preset.filter_payload || {}
  const out: OccurrenceFilters = { preset_id: preset.id }
  if (p.functional_locations_prefixes?.length) out.fl_prefixes = p.functional_locations_prefixes
  if (p.arvores?.length) out.arvores = p.arvores
  if (p.specialties?.length) out.specialties = p.specialties
  if (p.turnos?.length) out.turnos = p.turnos
  if (p.planning_groups?.length) out.planning_groups = p.planning_groups
  if (p.only_pane) out.only_pane = true
  if (p.only_jump) out.only_jump = true
  if (p.only_relevant) out.only_relevant = true
  if (p.only_analyze) out.only_analyze = true
  if (p.keywords?.length) out.q = p.keywords.join(' ')
  return out
}

/** Remove every preset-controlled key from the filters. */
export function clearPresetFromFilters(filters: OccurrenceFilters): OccurrenceFilters {
  const next: OccurrenceFilters = { ...filters }
  for (const k of PRESET_CONTROLLED_KEYS) delete (next as Record<string, unknown>)[k]
  return next
}

/** Replace preset-controlled keys with the ones coming from the given preset. */
export function applyPresetToFilters(filters: OccurrenceFilters, preset: Preset): OccurrenceFilters {
  const base = clearPresetFromFilters(filters)
  const fromPreset = presetToFilters(preset)
  return { ...base, ...fromPreset, q: fromPreset.q ?? base.q }
}

/** Count of "refinement" filters (used for badges on the filter panel toggle). */
export function countActiveFilters(f: OccurrenceFilters): number {
  return (
    (f.fl_prefixes?.length || 0) +
    (f.arvores?.length || 0) +
    (f.specialties?.length || 0) +
    (f.turnos?.length || 0) +
    (f.planning_groups?.length || 0) +
    (f.only_pane ? 1 : 0) +
    (f.only_jump ? 1 : 0) +
    (f.only_relevant ? 1 : 0) +
    (f.only_analyze ? 1 : 0) +
    (f.start || f.end ? 1 : 0) +
    (f.q?.trim() ? 1 : 0)
  )
}

export const PREFERRED_PRESET_KEY = 'atc_preferred_preset_id'
