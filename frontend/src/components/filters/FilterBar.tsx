import React, { useEffect, useState } from 'react'
import type { Especialidade, OccurrenceFilters, Preset, StatusATC } from '@/api/types'
import { presetsApi } from '@/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertTriangle,
  BookmarkPlus,
  Calendar,
  Check,
  ChevronDown,
  Clock,
  Compass,
  Filter,
  Flame,
  Layers,
  OctagonAlert,
  RotateCcw,
  Search,
  Star,
  X,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { FunctionalLocationInput } from './FunctionalLocationInput'

const ARVORES = ['BOF1', 'SLM1', 'CCS1', 'CCS2', 'CCS3', 'PCC1', 'COM0'] as const

interface FilterBarProps {
  filters: OccurrenceFilters
  onChange: (f: OccurrenceFilters) => void
  onSavePresetSuccess?: () => void
  compact?: boolean
  hideQuickbar?: boolean
}

export function FilterBar({
  filters,
  onChange,
  onSavePresetSuccess,
  compact = false,
  hideQuickbar = false,
}: FilterBarProps) {
  const [saveOpen, setSaveOpen] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [presetColor, setPresetColor] = useState('#3b82f6')
  const [showInQuickbar, setShowInQuickbar] = useState(true)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [presets, setPresets] = useState<Preset[]>([])

  const getPresetIcon = (iconName?: string) => {
    switch (iconName) {
      case 'Zap':
        return <Zap className="size-3" />
      case 'Flame':
        return <Flame className="size-3" />
      case 'AlertTriangle':
        return <AlertTriangle className="size-3" />
      case 'OctagonAlert':
        return <OctagonAlert className="size-3" />
      case 'Search':
        return <Search className="size-3" />
      case 'Star':
        return <Star className="size-3" />
      case 'Layers':
        return <Layers className="size-3" />
      case 'Compass':
        return <Compass className="size-3" />
      case 'Clock':
        return <Clock className="size-3" />
      default:
        return <Filter className="size-3" />
    }
  }

  const loadPresets = async () => {
    try {
      const list = await presetsApi.list()
      const quick = list.filter((p) => p.show_in_quickbar)
      setPresets(quick)

      // Auto-apply saved preferred preset on initial mount if no filters are active
      const savedId = localStorage.getItem('atc_preferred_preset_id')
      if (savedId && !filters.preset_id && !hasActiveFilters) {
        const found = quick.find((p) => p.id === savedId)
        if (found) {
          const payload = found.filter_payload || {}
          onChange({
            ...filters,
            preset_id: found.id,
            fl_prefixes: payload.functional_locations_prefixes?.length
              ? payload.functional_locations_prefixes
              : undefined,
            arvores: payload.arvores?.length ? payload.arvores : undefined,
            specialties: payload.specialties?.length ? payload.specialties : undefined,
            turnos: payload.turnos?.length ? payload.turnos : undefined,
            planning_groups: payload.planning_groups?.length ? payload.planning_groups : undefined,
            only_pane: payload.only_pane || undefined,
            only_jump: payload.only_jump || undefined,
            only_relevant: payload.only_relevant || undefined,
            only_analyze: payload.only_analyze || undefined,
            q: payload.keywords?.length ? payload.keywords.join(' ') : filters.q,
          })
        }
      }
    } catch {
      // Ignored
    }
  }

  useEffect(() => {
    if (!hideQuickbar) {
      loadPresets()
    }
  }, [hideQuickbar])

  const handlePresetToggle = (preset: Preset) => {
    const isCurrentlyActive = filters.preset_id === preset.id
    if (isCurrentlyActive) {
      // Deactivate
      localStorage.removeItem('atc_preferred_preset_id')
      const next: OccurrenceFilters = { ...filters }
      delete next.preset_id
      delete next.fl_prefixes
      delete next.arvores
      delete next.specialties
      delete next.turnos
      delete next.planning_groups
      delete next.only_pane
      delete next.only_jump
      delete next.only_relevant
      delete next.only_analyze
      onChange(next)
      toast.info('Foco rápido desativado')
    } else {
      // Activate and persist
      localStorage.setItem('atc_preferred_preset_id', preset.id)
      const payload = preset.filter_payload || {}
      const next: OccurrenceFilters = {
        ...filters,
        preset_id: preset.id,
        fl_prefixes: payload.functional_locations_prefixes?.length
          ? payload.functional_locations_prefixes
          : undefined,
        arvores: payload.arvores?.length ? payload.arvores : undefined,
        specialties: payload.specialties?.length ? payload.specialties : undefined,
        turnos: payload.turnos?.length ? payload.turnos : undefined,
        planning_groups: payload.planning_groups?.length ? payload.planning_groups : undefined,
        only_pane: payload.only_pane || undefined,
        only_jump: payload.only_jump || undefined,
        only_relevant: payload.only_relevant || undefined,
        only_analyze: payload.only_analyze || undefined,
        q: payload.keywords?.length ? payload.keywords.join(' ') : filters.q,
      }
      onChange(next)
      toast.success(`Foco rápido: ${preset.name}`, {
        description: 'Filtro preferencial fixado e aplicado.',
      })
    }
  }

  // Temporal range helper
  const setTemporalRange = (mode: 'hoje' | 'ontem' | 'semana' | 'mes' | 'ano' | 'clear') => {
    const now = new Date()
    const fmt = (d: Date) => {
      const year = d.getFullYear()
      const mon = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${year}-${mon}-${day}T00:00:00`
    }
    const fmtEnd = (d: Date) => {
      const year = d.getFullYear()
      const mon = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${year}-${mon}-${day}T23:59:59`
    }

    if (mode === 'clear') {
      const next = { ...filters }
      delete next.start
      delete next.end
      onChange(next)
      return
    }

    let s = new Date(now)
    let e = new Date(now)

    if (mode === 'hoje') {
      // today 00:00 to 23:59
    } else if (mode === 'ontem') {
      s.setDate(s.getDate() - 1)
      e.setDate(e.getDate() - 1)
    } else if (mode === 'semana') {
      const day = s.getDay() || 7
      s.setDate(s.getDate() - day + 1) // Monday
    } else if (mode === 'mes') {
      s.setDate(1)
    } else if (mode === 'ano') {
      s = new Date(now.getFullYear(), 0, 1)
    }

    onChange({
      ...filters,
      start: fmt(s),
      end: fmtEnd(e),
    })
  }

  const toggleArvore = (arv: string) => {
    const cur = filters.arvores || []
    const next = cur.includes(arv) ? cur.filter((x) => x !== arv) : [...cur, arv]
    onChange({ ...filters, arvores: next.length ? next : undefined })
  }

  const handleSavePreset = async () => {
    if (!presetName.trim()) return
    try {
      await presetsApi.create({
        name: presetName.trim(),
        icon: 'Filter',
        color: presetColor,
        is_default: false,
        show_in_quickbar: showInQuickbar,
        sort_order: 10,
        filter_payload: {
          functional_locations_prefixes: filters.fl_prefixes || [],
          arvores: filters.arvores || [],
          specialties: filters.specialties || [],
          planning_groups: filters.planning_groups || [],
          keywords: filters.q ? [filters.q] : [],
          only_pane: !!filters.only_pane,
          only_jump: !!filters.only_jump,
          only_relevant: !!filters.only_relevant,
          only_analyze: !!filters.only_analyze,
          turnos: filters.turnos || [],
        },
      })
      toast.success(`Filtro "${presetName}" salvo com sucesso!`)
      setSaveOpen(false)
      setPresetName('')
      loadPresets()
      if (onSavePresetSuccess) onSavePresetSuccess()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar filtro')
    }
  }

  const hasActiveFilters = Object.keys(filters).some((k) => {
    const v = (filters as any)[k]
    return v !== undefined && v !== null && v !== false && (Array.isArray(v) ? v.length > 0 : v !== '')
  })

  return (
    <div className="bg-card border-b p-2 sm:p-2.5 space-y-2 text-xs shrink-0 shadow-2xs">
      {/* Top Search & Filter Toggles Row */}
      <div className="flex items-center gap-2">
        {/* Keyword Search */}
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            value={filters.q || ''}
            onChange={(e) => onChange({ ...filters, q: e.target.value || undefined })}
            placeholder="Buscar tag, nota, ordem, defeito, causa..."
            className="pl-8 h-8 text-xs bg-background"
          />
          {filters.q && (
            <button
              onClick={() => onChange({ ...filters, q: undefined })}
              className="absolute right-2 top-2 text-muted-foreground hover:text-foreground p-0.5"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* More Filters Toggle */}
        {(() => {
          const activeCount =
            (filters.arvores?.length || 0) +
            (filters.specialties?.length || 0) +
            (filters.turnos?.length || 0) +
            (filters.fl_prefixes?.length || 0)
          return (
            <Button
              variant={advancedOpen || activeCount > 0 ? 'secondary' : 'outline'}
              size="xs"
              onClick={() => setAdvancedOpen(!advancedOpen)}
              className="h-8 gap-1.5 shrink-0 px-2.5"
              title="Filtros por Posição Funcional, Árvores de Ativos, Especialidade e Turno"
            >
              <Filter className="size-3.5 text-primary" />
              <span className="hidden sm:inline">Mais Filtros</span>
              {activeCount > 0 && (
                <span className="size-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                  {activeCount}
                </span>
              )}
              <ChevronDown className={cn('size-3.5 transition-transform', advancedOpen && 'rotate-180')} />
            </Button>
          )
        })()}

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              localStorage.removeItem('atc_preferred_preset_id')
              onChange({})
            }}
            className="text-muted-foreground hover:text-red-600 h-8 px-2 shrink-0"
            title="Limpar todos os filtros"
          >
            <RotateCcw className="size-3.5 mr-1" />
            <span className="hidden sm:inline">Limpar</span>
          </Button>
        )}
      </div>

      {/* Row 2: Scrollable Quick Chips (Panes, Jumps, Relevantes, Analisar, Temporal, Save Preset) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
        <Button
          variant={filters.only_pane ? 'pane' : 'outline'}
          size="xs"
          onClick={() => onChange({ ...filters, only_pane: !filters.only_pane || undefined })}
          className="h-6.5 px-2 text-xs shrink-0 font-bold"
        >
          <OctagonAlert className="size-3 mr-1" />
          Panes
        </Button>

        <Button
          variant={filters.only_jump ? 'jump' : 'outline'}
          size="xs"
          onClick={() => onChange({ ...filters, only_jump: !filters.only_jump || undefined })}
          className="h-6.5 px-2 text-xs shrink-0 font-bold"
        >
          <AlertTriangle className="size-3 mr-1" />
          Jumps / Forces
        </Button>

        <Button
          variant={filters.only_relevant ? 'default' : 'outline'}
          size="xs"
          onClick={() => onChange({ ...filters, only_relevant: !filters.only_relevant || undefined })}
          className="h-6.5 px-2 text-xs shrink-0 font-bold"
        >
          <Star className="size-3 fill-current mr-1" />
          Relevantes
        </Button>

        <Button
          variant={filters.only_analyze ? 'default' : 'outline'}
          size="xs"
          onClick={() => onChange({ ...filters, only_analyze: !filters.only_analyze || undefined })}
          className="h-6.5 px-2 text-xs shrink-0 font-bold"
        >
          <Search className="size-3 mr-1" />
          Analisar
        </Button>

        {/* Temporal shortcuts */}
        <div className="h-4 w-px bg-border/80 shrink-0 mx-0.5" />

        <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-md shrink-0">
          <Button variant="ghost" size="xs" onClick={() => setTemporalRange('hoje')} className="h-5 px-1.5 text-[11px]">
            Hoje
          </Button>
          <Button variant="ghost" size="xs" onClick={() => setTemporalRange('ontem')} className="h-5 px-1.5 text-[11px]">
            Ontem
          </Button>
          <Button variant="ghost" size="xs" onClick={() => setTemporalRange('semana')} className="h-5 px-1.5 text-[11px]">
            Semana
          </Button>
          <Button variant="ghost" size="xs" onClick={() => setTemporalRange('mes')} className="h-5 px-1.5 text-[11px]">
            Mês
          </Button>
          {(filters.start || filters.end) && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setTemporalRange('clear')}
              className="text-amber-600 dark:text-amber-400 font-bold h-5 px-1"
              title="Limpar filtro de data"
            >
              ✕
            </Button>
          )}
        </div>

        <div className="h-4 w-px bg-border/80 shrink-0 mx-0.5" />

        <Button
          variant="outline"
          size="xs"
          onClick={() => setSaveOpen(true)}
          className="h-6.5 px-2 border-dashed shrink-0 text-xs font-medium"
          title="Salvar filtros atuais como Preset"
        >
          <BookmarkPlus className="size-3 text-primary mr-1" />
          Salvar Preset
        </Button>
      </div>

      {/* Quickbar Presets ("Foco Rápido") */}
      {!hideQuickbar && presets.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 border-t border-border/40 scrollbar-none">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground shrink-0 pr-1 flex items-center gap-1">
            <Filter className="size-3 text-primary" /> Foco Rápido:
          </span>

          {presets.map((preset) => {
            const active = filters.preset_id === preset.id
            return (
              <button
                key={preset.id}
                onClick={() => handlePresetToggle(preset)}
                title={
                  active
                    ? 'Filtro preferencial fixado (clique para desativar)'
                    : `Ativar foco: ${preset.name}`
                }
                className={cn(
                  'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium transition-all shrink-0 border cursor-pointer',
                  active
                    ? 'bg-primary text-primary-foreground border-primary font-bold shadow-xs'
                    : 'bg-background hover:bg-muted text-foreground border-border'
                )}
              >
                {getPresetIcon(preset.icon)}
                <span>{preset.name}</span>
                {active && <Star className="size-2.5 fill-amber-300 text-amber-300 shrink-0" />}
              </button>
            )
          })}

          {filters.preset_id && (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                localStorage.removeItem('atc_preferred_preset_id')
                const next = { ...filters }
                delete next.preset_id
                delete next.fl_prefixes
                delete next.arvores
                delete next.specialties
                delete next.turnos
                delete next.planning_groups
                delete next.only_pane
                delete next.only_jump
                delete next.only_relevant
                delete next.only_analyze
                onChange(next)
                toast.info('Foco rápido desativado')
              }}
              className="text-[10px] text-muted-foreground hover:text-red-500 h-5 px-1.5 shrink-0"
              title="Limpar foco rápido ativo"
            >
              <X className="size-2.5 mr-0.5" /> Limpar Foco
            </Button>
          )}
        </div>
      )}

      {/* Collapsible Second row: Posição Funcional (PF) + Árvores + Specialty + Turno */}
      {(advancedOpen ||
        ((filters.arvores?.length || 0) +
          (filters.specialties?.length || 0) +
          (filters.turnos?.length || 0) +
          (filters.fl_prefixes?.length || 0)) > 0) && (
        <div className="pt-2 border-t border-border/40 space-y-2 text-[11px] animate-in fade-in-50 duration-150">
          {/* Functional Location Row */}
          <div className="bg-muted/20 p-2 rounded-lg border border-border/40 space-y-1">
            <span className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
              <span>Posição Funcional (PF):</span>
              <span className="text-[10px] text-muted-foreground font-normal">
                (Simples, múltipla ou colar lista de tags do Excel)
              </span>
            </span>
            <FunctionalLocationInput
              value={filters.fl_prefixes || []}
              onChange={(pfs) => onChange({ ...filters, fl_prefixes: pfs.length ? pfs : undefined })}
              placeholder="Ex: BT-ST-SLM1, SLM1-PAN01 (Pressione Enter ou vírgula)..."
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground font-semibold px-1">Árvores:</span>
              {ARVORES.map((arv) => {
                const active = (filters.arvores || []).includes(arv)
                return (
                  <button
                    key={arv}
                    onClick={() => toggleArvore(arv)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium transition-colors border ${
                      active
                        ? 'bg-primary text-primary-foreground border-primary font-bold shadow-xs'
                        : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {arv}
                  </button>
                )
              })}
            </div>

            <div className="flex items-center gap-2">
              {/* Especialidade */}
              <div className="flex items-center gap-1 bg-muted/40 px-1.5 py-0.5 rounded border">
                <span className="text-muted-foreground">Espec:</span>
                {(['TODAS', 'ELETRICA', 'MECANICA'] as const).map((esp) => {
                  const active =
                    esp === 'TODAS'
                      ? !filters.specialties || filters.specialties.length === 0
                      : (filters.specialties || []).includes(esp as Especialidade)
                  return (
                    <button
                      key={esp}
                      onClick={() => {
                        if (esp === 'TODAS') {
                          onChange({ ...filters, specialties: undefined })
                        } else {
                          onChange({ ...filters, specialties: [esp as Especialidade] })
                        }
                      }}
                      className={`px-1 py-0.2 rounded text-[10px] font-medium ${
                        active
                          ? 'bg-background font-bold text-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {esp === 'TODAS' ? 'Todas' : esp === 'ELETRICA' ? 'Elét' : 'Mec'}
                    </button>
                  )
                })}
              </div>

              {/* Turno */}
              <div className="flex items-center gap-1 bg-muted/40 px-1.5 py-0.5 rounded border">
                <span className="text-muted-foreground">Turno:</span>
                {['A', 'B', 'C', 'D'].map((t) => {
                  const active = (filters.turnos || []).includes(`Turno ${t}`)
                  return (
                    <button
                      key={t}
                      onClick={() => {
                        const cur = filters.turnos || []
                        const target = `Turno ${t}`
                        const next = cur.includes(target) ? cur.filter((x) => x !== target) : [...cur, target]
                        onChange({ ...filters, turnos: next.length ? next : undefined })
                      }}
                      className={`px-1 rounded text-[10px] font-bold ${
                        active ? 'bg-background text-primary' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Save Preset Dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Salvar como Filtro Pré-Cadastrado</DialogTitle>
            <DialogDescription className="text-xs">
              Grave esta combinação de filtros para acesso rápido com 1 clique na barra superior.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div>
              <label className="text-xs font-medium">Nome do Filtro</label>
              <Input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Ex: Minha Linha: SLM1 Elétrica"
                className="mt-1"
              />
            </div>

            {filters.fl_prefixes && filters.fl_prefixes.length > 0 && (
              <div className="p-2 bg-muted/30 rounded border text-[11px] font-mono">
                <span className="text-muted-foreground block text-[10px] uppercase font-bold">
                  PFs incluídas ({filters.fl_prefixes.length}):
                </span>
                <span className="text-primary font-bold">{filters.fl_prefixes.join(', ')}</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <label className="text-xs font-medium cursor-pointer flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showInQuickbar}
                  onChange={(e) => setShowInQuickbar(e.target.checked)}
                  className="size-4 rounded text-primary focus:ring-primary"
                />
                <span>Exibir na Barra Rápida (Quickbar)</span>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setSaveOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSavePreset} disabled={!presetName.trim()}>
              Salvar Filtro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
