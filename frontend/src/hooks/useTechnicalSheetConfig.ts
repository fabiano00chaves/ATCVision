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

  // Persist changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    } catch {}
  }, [config])

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
  }

  return {
    config,
    toggleSection,
    setSectionVisibility,
    setAllSections,
    applyReadingPreset,
    resetToDefault,
  }
}
