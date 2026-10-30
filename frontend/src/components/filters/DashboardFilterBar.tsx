import React, { useState, useEffect } from 'react'
import type { Especialidade, OccurrenceFilters } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  AlertTriangle,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Filter,
  Layers,
  MapPin,
  OctagonAlert,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Star,
  Wrench,
  X,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { FunctionalLocationInput } from './FunctionalLocationInput'

export const ARVORES = ['BOF1', 'SLM1', 'CCS1', 'CCS2', 'CCS3', 'PCC1', 'COM0'] as const
export const TURNOS = ['Turno A', 'Turno B', 'Turno C', 'Turno D'] as const

export type DashboardPeriodPreset =
  | '7d'
  | '15d'
  | '30d'
  | '60d'
  | '90d'
  | 'month'
  | 'year'
  | 'all'
  | 'custom'

interface DashboardFilterBarProps {
  filters: OccurrenceFilters
  onChange: (filters: OccurrenceFilters) => void
  onRefresh: () => void
  loading?: boolean
  totalCount?: number
  className?: string
}

function getPeriodBounds(preset: DashboardPeriodPreset): { start?: string; end?: string } {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date, endOfDay = false) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${endOfDay ? '23:59:59' : '00:00:00'}`

  if (preset === '7d') {
    const s = new Date(now)
    s.setDate(s.getDate() - 6)
    return { start: fmt(s), end: fmt(now, true) }
  }
  if (preset === '15d') {
    const s = new Date(now)
    s.setDate(s.getDate() - 14)
    return { start: fmt(s), end: fmt(now, true) }
  }
  if (preset === '30d') {
    const s = new Date(now)
    s.setDate(s.getDate() - 29)
    return { start: fmt(s), end: fmt(now, true) }
  }
  if (preset === '60d') {
    const s = new Date(now)
    s.setDate(s.getDate() - 59)
    return { start: fmt(s), end: fmt(now, true) }
  }
  if (preset === '90d') {
    const s = new Date(now)
    s.setDate(s.getDate() - 89)
    return { start: fmt(s), end: fmt(now, true) }
  }
  if (preset === 'month') {
    const s = new Date(now.getFullYear(), now.getMonth(), 1)
    const e = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return { start: fmt(s), end: fmt(e, true) }
  }
  if (preset === 'year') {
    const s = new Date(now.getFullYear(), 0, 1)
    const e = new Date(now.getFullYear(), 11, 31)
    return { start: fmt(s), end: fmt(e, true) }
  }
  return { start: undefined, end: undefined }
}

export function DashboardFilterBar({
  filters,
  onChange,
  onRefresh,
  loading = false,
  totalCount,
  className,
}: DashboardFilterBarProps) {
  const [expanded, setExpanded] = useState(false)
  const [activePeriod, setActivePeriod] = useState<DashboardPeriodPreset>(() => {
    if (filters.start || filters.end) return 'custom'
    return '30d' // Default to 30 days for rich reliability insights
  })

  // Custom start and end inputs
  const [customStart, setCustomStart] = useState(filters.start ? filters.start.slice(0, 10) : '')
  const [customEnd, setCustomEnd] = useState(filters.end ? filters.end.slice(0, 10) : '')

  // Apply default 30d period on initial mount if no filter exists
  useEffect(() => {
    if (!filters.start && !filters.end && activePeriod === '30d') {
      const bounds = getPeriodBounds('30d')
      onChange({
        ...filters,
        start: bounds.start,
        end: bounds.end,
      })
    }
  }, [])

  // Sync custom inputs if filters changed externally
  useEffect(() => {
    if (filters.start) setCustomStart(filters.start.slice(0, 10))
    else if (activePeriod === 'all') setCustomStart('')

    if (filters.end) setCustomEnd(filters.end.slice(0, 10))
    else if (activePeriod === 'all') setCustomEnd('')
  }, [filters.start, filters.end])

  // Change period preset
  const handleSelectPeriod = (preset: DashboardPeriodPreset) => {
    setActivePeriod(preset)
    if (preset === 'custom') {
      return
    }
    const bounds = getPeriodBounds(preset)
    onChange({
      ...filters,
      start: bounds.start,
      end: bounds.end,
    })
  }

  // Apply custom dates
  const handleApplyCustomDates = () => {
    if (!customStart && !customEnd) return
    const s = customStart ? `${customStart}T00:00:00` : undefined
    const e = customEnd ? `${customEnd}T23:59:59` : undefined
    setActivePeriod('custom')
    onChange({
      ...filters,
      start: s,
      end: e,
    })
  }

  // Toggle Specialty
  const toggleSpecialty = (esp: Especialidade) => {
    const cur = filters.specialties || []
    const next = cur.includes(esp) ? cur.filter((x) => x !== esp) : [...cur, esp]
    onChange({
      ...filters,
      specialties: next.length ? next : undefined,
    })
  }

  // Clear Specialty (All)
  const clearSpecialties = () => {
    onChange({
      ...filters,
      specialties: undefined,
    })
  }

  // Toggle Arvore
  const toggleArvore = (arv: string) => {
    const cur = filters.arvores || []
    const next = cur.includes(arv) ? cur.filter((x) => x !== arv) : [...cur, arv]
    onChange({
      ...filters,
      arvores: next.length ? next : undefined,
    })
  }

  // Toggle Turno
  const toggleTurno = (tur: string) => {
    const cur = filters.turnos || []
    const next = cur.includes(tur) ? cur.filter((x) => x !== tur) : [...cur, tur]
    onChange({
      ...filters,
      turnos: next.length ? next : undefined,
    })
  }

  // Toggle Impact Flags
  const toggleFlag = (flag: 'only_pane' | 'only_jump' | 'only_relevant' | 'only_analyze') => {
    onChange({
      ...filters,
      [flag]: !filters[flag] ? true : undefined,
    })
  }

  // Clear All Filters
  const handleClearAll = () => {
    setActivePeriod('all')
    setCustomStart('')
    setCustomEnd('')
    onChange({
      preset_id: undefined,
      start: undefined,
      end: undefined,
      fl_prefixes: undefined,
      arvores: undefined,
      specialties: undefined,
      turnos: undefined,
      planning_groups: undefined,
      only_pane: undefined,
      only_jump: undefined,
      only_relevant: undefined,
      only_analyze: undefined,
      q: undefined,
    })
  }

  // Count active filters (excluding period if set to standard)
  const activeCount =
    (filters.fl_prefixes?.length || 0) +
    (filters.arvores?.length || 0) +
    (filters.specialties?.length || 0) +
    (filters.turnos?.length || 0) +
    (filters.only_pane ? 1 : 0) +
    (filters.only_jump ? 1 : 0) +
    (filters.only_relevant ? 1 : 0) +
    (filters.only_analyze ? 1 : 0) +
    (filters.start || filters.end ? 1 : 0)

  // Format date range for display
  const formatDateRangeDisplay = () => {
    if (!filters.start && !filters.end) return 'Todo o Histórico'
    const s = filters.start ? `${filters.start.slice(8, 10)}/${filters.start.slice(5, 7)}/${filters.start.slice(0, 4)}` : 'Início'
    const e = filters.end ? `${filters.end.slice(8, 10)}/${filters.end.slice(5, 7)}/${filters.end.slice(0, 4)}` : 'Hoje'
    return `${s} até ${e}`
  }

  return (
    <div className={cn('bg-card border-b border-border/60 shadow-xs text-xs select-none', className)}>
      {/* Primary Top Bar */}
      <div className="px-3 py-2 flex flex-wrap items-center justify-between gap-2.5">
        {/* Left: Period Quick Presets */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground font-semibold flex items-center gap-1 mr-0.5 text-[11px]">
            <Calendar className="size-3.5 text-primary" /> Período:
          </span>

          <div className="flex items-center bg-muted/60 p-0.5 rounded-md border border-border/50">
            <button
              type="button"
              onClick={() => handleSelectPeriod('7d')}
              className={cn(
                'px-2 py-0.5 rounded text-[11px] font-medium transition-colors',
                activePeriod === '7d' ? 'bg-background text-foreground shadow-2xs font-semibold' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              7 dias
            </button>
            <button
              type="button"
              onClick={() => handleSelectPeriod('15d')}
              className={cn(
                'px-2 py-0.5 rounded text-[11px] font-medium transition-colors',
                activePeriod === '15d' ? 'bg-background text-foreground shadow-2xs font-semibold' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              15 dias
            </button>
            <button
              type="button"
              onClick={() => handleSelectPeriod('30d')}
              className={cn(
                'px-2 py-0.5 rounded text-[11px] font-medium transition-colors',
                activePeriod === '30d' ? 'bg-background text-primary shadow-2xs font-bold' : 'text-muted-foreground hover:text-foreground'
              )}
              title="Últimos 30 dias (Recomendado para análise de confiabilidade)"
            >
              30 dias
            </button>
            <button
              type="button"
              onClick={() => handleSelectPeriod('60d')}
              className={cn(
                'px-2 py-0.5 rounded text-[11px] font-medium transition-colors hidden sm:block',
                activePeriod === '60d' ? 'bg-background text-foreground shadow-2xs font-semibold' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              60 dias
            </button>
            <button
              type="button"
              onClick={() => handleSelectPeriod('90d')}
              className={cn(
                'px-2 py-0.5 rounded text-[11px] font-medium transition-colors hidden sm:block',
                activePeriod === '90d' ? 'bg-background text-foreground shadow-2xs font-semibold' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              90 dias
            </button>
            <button
              type="button"
              onClick={() => handleSelectPeriod('month')}
              className={cn(
                'px-2 py-0.5 rounded text-[11px] font-medium transition-colors',
                activePeriod === 'month' ? 'bg-background text-foreground shadow-2xs font-semibold' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Este Mês
            </button>
            <button
              type="button"
              onClick={() => handleSelectPeriod('all')}
              className={cn(
                'px-2 py-0.5 rounded text-[11px] font-medium transition-colors',
                activePeriod === 'all' ? 'bg-background text-foreground shadow-2xs font-semibold' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Tudo
            </button>
            <button
              type="button"
              onClick={() => {
                setActivePeriod('custom')
                setExpanded(true)
              }}
              className={cn(
                'px-2 py-0.5 rounded text-[11px] font-medium transition-colors',
                activePeriod === 'custom' ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Personalizado...
            </button>
          </div>

          <Badge variant="outline" className="text-[10px] font-mono py-0.5 px-2 bg-background border-border/70 hidden md:inline-flex">
            {formatDateRangeDisplay()}
          </Badge>
        </div>

        {/* Center/Right: Specialty Toggles + More Filters Toggle + Refresh */}
        <div className="flex items-center gap-2">
          {/* Quick Specialty Pill Group */}
          <div className="flex items-center gap-1 bg-muted/40 p-0.5 rounded-md border border-border/40">
            <button
              type="button"
              onClick={clearSpecialties}
              className={cn(
                'px-2 py-0.5 rounded text-[11px] transition-colors',
                !filters.specialties?.length ? 'bg-background text-foreground font-bold shadow-2xs' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Todas Esp.
            </button>
            <button
              type="button"
              onClick={() => toggleSpecialty('ELETRICA')}
              className={cn(
                'px-2 py-0.5 rounded text-[11px] font-medium transition-colors flex items-center gap-1',
                filters.specialties?.includes('ELETRICA')
                  ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold border border-amber-500/30'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Zap className="size-3 text-amber-500" /> Elétrica
            </button>
            <button
              type="button"
              onClick={() => toggleSpecialty('MECANICA')}
              className={cn(
                'px-2 py-0.5 rounded text-[11px] font-medium transition-colors flex items-center gap-1',
                filters.specialties?.includes('MECANICA')
                  ? 'bg-blue-500/20 text-blue-700 dark:text-blue-300 font-bold border border-blue-500/30'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Wrench className="size-3 text-blue-500" /> Mecânica
            </button>
          </div>

          {/* Toggle Expand Advanced Filters */}
          <Button
            type="button"
            variant={expanded ? 'default' : 'outline'}
            size="xs"
            onClick={() => setExpanded(!expanded)}
            className="h-7 gap-1 text-[11px] shrink-0 font-medium"
          >
            <SlidersHorizontal className="size-3" />
            <span>Filtros da Planta</span>
            {activeCount > 0 && (
              <span className="size-4 rounded-full bg-primary-foreground text-primary text-[9px] font-bold flex items-center justify-center">
                {activeCount}
              </span>
            )}
            {expanded ? <ChevronUp className="size-3 ml-0.5" /> : <ChevronDown className="size-3 ml-0.5" />}
          </Button>

          {/* Refresh Data Button */}
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={onRefresh}
            disabled={loading}
            className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-foreground"
            title="Atualizar dashboards de confiabilidade"
          >
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin text-primary')} />
          </Button>

          {/* Reset All Filters if Active */}
          {activeCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={handleClearAll}
              className="h-7 text-muted-foreground hover:text-destructive text-[11px] gap-1 px-1.5 shrink-0"
              title="Limpar todos os filtros e retornar para visão global"
            >
              <RotateCcw className="size-3" />
              <span className="hidden sm:inline">Limpar</span>
            </Button>
          )}
        </div>
      </div>

      {/* Expanded Advanced Filters Drawer */}
      {expanded && (
        <div className="px-3 py-3 border-t border-border/50 bg-muted/20 space-y-3 animate-in fade-in-50 duration-150">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Column 1: Functional Location (PF) with Tree Browser */}
            <div className="bg-card p-2.5 rounded-lg border border-border/50 space-y-1.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground flex items-center gap-1.5 text-[11px]">
                  <MapPin className="size-3.5 text-primary" />
                  Posição Funcional (PF):
                </span>
                {filters.fl_prefixes && filters.fl_prefixes.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onChange({ ...filters, fl_prefixes: undefined })}
                    className="text-[10px] text-muted-foreground hover:text-destructive"
                  >
                    Limpar PFs
                  </button>
                )}
              </div>
              <FunctionalLocationInput
                value={filters.fl_prefixes || []}
                onChange={(pfs) => onChange({ ...filters, fl_prefixes: pfs.length ? pfs : undefined })}
                placeholder="Ex: BT-ST-SLM1, BT-ST-SLM1-21..."
                compact
                arvorePlantaFilter={filters.arvores && filters.arvores.length === 1 ? filters.arvores[0] : undefined}
              />
              <p className="text-[10px] text-muted-foreground leading-tight">
                Filtre por nós ou subsistemas. Clique em <strong>Árvore de PFs</strong> para navegar na estrutura hierárquica da planta.
              </p>
            </div>

            {/* Column 2: Plant Trees (Árvores da Planta) */}
            <div className="bg-card p-2.5 rounded-lg border border-border/50 space-y-2 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground flex items-center gap-1.5 text-[11px]">
                  <Layers className="size-3.5 text-primary" />
                  Árvores / Unidades Operacionais:
                </span>
                {filters.arvores && filters.arvores.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onChange({ ...filters, arvores: undefined })}
                    className="text-[10px] text-muted-foreground hover:text-destructive"
                  >
                    Todas
                  </button>
                )}
              </div>
              <div className="grid grid-cols-4 gap-1">
                {ARVORES.map((arv) => {
                  const active = (filters.arvores || []).includes(arv)
                  return (
                    <button
                      key={arv}
                      type="button"
                      onClick={() => toggleArvore(arv)}
                      className={cn(
                        'py-1 px-1.5 rounded text-[11px] font-mono text-center border transition-all',
                        active
                          ? 'bg-primary/10 border-primary text-primary font-bold'
                          : 'bg-background hover:bg-muted text-muted-foreground hover:text-foreground border-border'
                      )}
                    >
                      {arv}
                    </button>
                  )
                })}
              </div>

              {/* Turnos */}
              <div className="pt-1 border-t border-border/40">
                <span className="text-[10px] font-semibold text-muted-foreground block mb-1 flex items-center gap-1">
                  <Clock className="size-3" /> Turnos Operacionais:
                </span>
                <div className="grid grid-cols-4 gap-1">
                  {TURNOS.map((tur) => {
                    const active = (filters.turnos || []).includes(tur)
                    return (
                      <button
                        key={tur}
                        type="button"
                        onClick={() => toggleTurno(tur)}
                        className={cn(
                          'py-0.5 px-1 rounded text-[10px] text-center border transition-all',
                          active
                            ? 'bg-primary/10 border-primary text-primary font-bold'
                            : 'bg-background hover:bg-muted text-muted-foreground hover:text-foreground border-border'
                        )}
                      >
                        {tur.replace('Turno ', 'T-')}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Column 3: Impact Flags & Custom Date Inputs */}
            <div className="bg-card p-2.5 rounded-lg border border-border/50 space-y-2 shadow-2xs">
              <span className="font-semibold text-foreground flex items-center gap-1.5 text-[11px]">
                <OctagonAlert className="size-3.5 text-red-600 dark:text-red-400" />
                Sinalizadores de Confiabilidade:
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => toggleFlag('only_pane')}
                  className={cn(
                    'p-1.5 rounded text-[11px] text-left border flex items-center gap-1.5 transition-colors',
                    filters.only_pane
                      ? 'bg-red-500/15 border-red-500 text-red-700 dark:text-red-300 font-bold'
                      : 'bg-background hover:bg-muted text-muted-foreground border-border'
                  )}
                >
                  <OctagonAlert className="size-3.5 text-red-600 shrink-0" />
                  <span className="truncate">Apenas Panes</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleFlag('only_jump')}
                  className={cn(
                    'p-1.5 rounded text-[11px] text-left border flex items-center gap-1.5 transition-colors',
                    filters.only_jump
                      ? 'bg-amber-500/15 border-amber-500 text-amber-700 dark:text-amber-300 font-bold'
                      : 'bg-background hover:bg-muted text-muted-foreground border-border'
                  )}
                >
                  <AlertTriangle className="size-3.5 text-amber-600 shrink-0" />
                  <span className="truncate">Apenas Jumps</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleFlag('only_relevant')}
                  className={cn(
                    'p-1.5 rounded text-[11px] text-left border flex items-center gap-1.5 transition-colors',
                    filters.only_relevant
                      ? 'bg-yellow-500/15 border-yellow-500 text-yellow-700 dark:text-yellow-300 font-bold'
                      : 'bg-background hover:bg-muted text-muted-foreground border-border'
                  )}
                >
                  <Star className="size-3.5 text-yellow-500 shrink-0" />
                  <span className="truncate">Relevantes ATC</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleFlag('only_analyze')}
                  className={cn(
                    'p-1.5 rounded text-[11px] text-left border flex items-center gap-1.5 transition-colors',
                    filters.only_analyze
                      ? 'bg-purple-500/15 border-purple-500 text-purple-700 dark:text-purple-300 font-bold'
                      : 'bg-background hover:bg-muted text-muted-foreground border-border'
                  )}
                >
                  <Filter className="size-3.5 text-purple-600 shrink-0" />
                  <span className="truncate">Marcados p/ Análise</span>
                </button>
              </div>

              {/* Custom Date Bounds */}
              <div className="pt-1 border-t border-border/40 space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
                  <Calendar className="size-3" /> Intervalo de Datas Específico:
                </span>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="h-6 text-[10px] px-1.5 bg-background flex-1"
                  />
                  <span className="text-muted-foreground text-[10px]">até</span>
                  <Input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="h-6 text-[10px] px-1.5 bg-background flex-1"
                  />
                  <Button
                    type="button"
                    size="xs"
                    onClick={handleApplyCustomDates}
                    className="h-6 px-2 text-[10px]"
                  >
                    Filtrar
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active Filter Chips Summary */}
      {activeCount > 0 && (
        <div className="px-3 py-1 bg-muted/40 border-t border-border/40 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider shrink-0 mr-1">
            Filtros Ativos ({activeCount}):
          </span>

          {/* Period Chip */}
          {(filters.start || filters.end) && (
            <Badge variant="secondary" className="gap-1 py-0 px-1.5 text-[10px] bg-background border">
              <span>Período: {formatDateRangeDisplay()}</span>
              <button
                type="button"
                onClick={() => handleSelectPeriod('all')}
                className="text-muted-foreground hover:text-destructive ml-0.5"
              >
                <X className="size-2.5" />
              </button>
            </Badge>
          )}

          {/* Specialties */}
          {filters.specialties?.map((esp) => (
            <Badge key={esp} variant="secondary" className="gap-1 py-0 px-1.5 text-[10px] bg-background border">
              <span>{esp === 'ELETRICA' ? 'Elétrica' : esp === 'MECANICA' ? 'Mecânica' : 'Outra'}</span>
              <button
                type="button"
                onClick={() => toggleSpecialty(esp)}
                className="text-muted-foreground hover:text-destructive ml-0.5"
              >
                <X className="size-2.5" />
              </button>
            </Badge>
          ))}

          {/* Arvores */}
          {filters.arvores?.map((arv) => (
            <Badge key={arv} variant="secondary" className="gap-1 py-0 px-1.5 text-[10px] bg-background border font-mono">
              <span>{arv}</span>
              <button
                type="button"
                onClick={() => toggleArvore(arv)}
                className="text-muted-foreground hover:text-destructive ml-0.5"
              >
                <X className="size-2.5" />
              </button>
            </Badge>
          ))}

          {/* Functional Locations */}
          {filters.fl_prefixes?.map((pf) => (
            <Badge key={pf} variant="secondary" className="gap-1 py-0 px-1.5 text-[10px] bg-background border font-mono">
              <span>{pf}</span>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...filters,
                    fl_prefixes: filters.fl_prefixes?.filter((x) => x !== pf),
                  })
                }
                className="text-muted-foreground hover:text-destructive ml-0.5"
              >
                <X className="size-2.5" />
              </button>
            </Badge>
          ))}

          {/* Flags */}
          {filters.only_pane && (
            <Badge variant="secondary" className="gap-1 py-0 px-1.5 text-[10px] bg-red-500/10 text-red-600 border-red-500/30">
              <span>Apenas Panes</span>
              <button type="button" onClick={() => toggleFlag('only_pane')} className="ml-0.5">
                <X className="size-2.5" />
              </button>
            </Badge>
          )}
          {filters.only_jump && (
            <Badge variant="secondary" className="gap-1 py-0 px-1.5 text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30">
              <span>Apenas Jumps</span>
              <button type="button" onClick={() => toggleFlag('only_jump')} className="ml-0.5">
                <X className="size-2.5" />
              </button>
            </Badge>
          )}
          {filters.only_relevant && (
            <Badge variant="secondary" className="gap-1 py-0 px-1.5 text-[10px] bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
              <span>Relevantes</span>
              <button type="button" onClick={() => toggleFlag('only_relevant')} className="ml-0.5">
                <X className="size-2.5" />
              </button>
            </Badge>
          )}
          {filters.only_analyze && (
            <Badge variant="secondary" className="gap-1 py-0 px-1.5 text-[10px] bg-purple-500/10 text-purple-600 border-purple-500/30">
              <span>P/ Análise</span>
              <button type="button" onClick={() => toggleFlag('only_analyze')} className="ml-0.5">
                <X className="size-2.5" />
              </button>
            </Badge>
          )}
        </div>
      )}
    </div>
  )
}
