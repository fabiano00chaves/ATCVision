import { useEffect, useState } from 'react'

export type SectionVisibility = 'expanded' | 'collapsed' | 'hidden'

export type TechnicalSheetSectionKey =
  | 'posicao_funcional'
  | 'dados_operacionais'
  | 'modo_falha'
  | 'descricao_notificacao'
  | 'descricao_ordem'
  | 'operacoes'
  | 'executantes_hh'
  | 'pareceres_atc'

export type TechnicalSheetConfig = Record<TechnicalSheetSectionKey, SectionVisibility>

const STORAGE_KEY = 'atc_tech_sheet_sections_config_v1'
const ORDER_STORAGE_KEY = 'atc_tech_sheet_sections_order_v1'

export const DEFAULT_SECTION_ORDER: TechnicalSheetSectionKey[] = [
  'posicao_funcional',
  'dados_operacionais',
  'modo_falha',
  'descricao_notificacao',
  'descricao_ordem',
  'operacoes',
  'executantes_hh',
  'pareceres_atc',
]

export const DEFAULT_SHEET_CONFIG: TechnicalSheetConfig = {
  posicao_funcional: 'expanded',
  dados_operacionais: 'expanded',
  modo_falha: 'expanded',
  descricao_notificacao: 'expanded',
  descricao_ordem: 'expanded',
  operacoes: 'collapsed', // Default collapsed for brevity as requested
  executantes_hh: 'collapsed', // Default collapsed for brevity as requested
  pareceres_atc: 'expanded',
}

function normalizeOrder(raw: unknown): TechnicalSheetSectionKey[] {
  if (!Array.isArray(raw)) return DEFAULT_SECTION_ORDER
  const validSet = new Set<TechnicalSheetSectionKey>(DEFAULT_SECTION_ORDER)
  const seen = new Set<TechnicalSheetSectionKey>()
  const out: TechnicalSheetSectionKey[] = []
  for (const item of raw) {
    if (typeof item === 'string' && validSet.has(item as TechnicalSheetSectionKey)) {
      const k = item as TechnicalSheetSectionKey
      if (!seen.has(k)) {
        seen.add(k)
        out.push(k)
      }
    }
  }
  for (const defKey of DEFAULT_SECTION_ORDER) {
    if (!seen.has(defKey)) {
      out.push(defKey)
    }
  }
  return out
}

export function useTechnicalSheetConfig() {
  const [config, setConfig] = useState<TechnicalSheetConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        return { ...DEFAULT_SHEET_CONFIG, ...JSON.parse(saved) }
      }
    } catch {}
    return DEFAULT_SHEET_CONFIG
  })

  const [order, setOrder] = useState<TechnicalSheetSectionKey[]>(() => {
    try {
      const savedOrder = localStorage.getItem(ORDER_STORAGE_KEY)
      if (savedOrder) {
        return normalizeOrder(JSON.parse(savedOrder))
      }
    } catch {}
    return DEFAULT_SECTION_ORDER
  })

  // Persist visibility changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    } catch {}
  }, [config])

  // Persist custom card ordering
  useEffect(() => {
    try {
      localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(order))
    } catch {}
  }, [order])

  const toggleSection = (key: TechnicalSheetSectionKey) => {
    setConfig((prev) => {
      const current = prev[key] || 'expanded'
      const next: SectionVisibility = current === 'expanded' ? 'collapsed' : 'expanded'
      return { ...prev, [key]: next }
    })
  }

  const setSectionVisibility = (key: TechnicalSheetSectionKey, vis: SectionVisibility) => {
    setConfig((prev) => ({ ...prev, [key]: vis }))
  }

  const setAllSections = (vis: 'expanded' | 'collapsed') => {
    setConfig((prev) => {
      const updated = { ...prev }
      ;(Object.keys(updated) as TechnicalSheetSectionKey[]).forEach((k) => {
        if (updated[k] !== 'hidden') {
          updated[k] = vis
        }
      })
      return updated
    })
  }

  const moveSection = (key: TechnicalSheetSectionKey, direction: 'up' | 'down') => {
    setOrder((prev) => {
      const idx = prev.indexOf(key)
      if (idx === -1) return prev
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1
      if (targetIdx < 0 || targetIdx >= prev.length) return prev
      const next = [...prev]
      const [moved] = next.splice(idx, 1)
      next.splice(targetIdx, 0, moved)
      return next
    })
  }

  const reorderSections = (fromKey: TechnicalSheetSectionKey, toKey: TechnicalSheetSectionKey) => {
    if (fromKey === toKey) return
    setOrder((prev) => {
      const fromIdx = prev.indexOf(fromKey)
      const toIdx = prev.indexOf(toKey)
      if (fromIdx === -1 || toIdx === -1) return prev
      const next = [...prev]
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)
      return next
    })
  }

  const applyReadingPreset = () => {
    setConfig({
      posicao_funcional: 'expanded',
      dados_operacionais: 'expanded',
      modo_falha: 'expanded',
      descricao_notificacao: 'expanded',
      descricao_ordem: 'collapsed',
      operacoes: 'collapsed',
      executantes_hh: 'collapsed',
      pareceres_atc: 'expanded',
    })
  }

  const resetToDefault = () => {
    setConfig(DEFAULT_SHEET_CONFIG)
    setOrder(DEFAULT_SECTION_ORDER)
  }

  return {
    config,
    order,
    toggleSection,
    setSectionVisibility,
    setAllSections,
    moveSection,
    reorderSections,
    applyReadingPreset,
    resetToDefault,
  }
}
