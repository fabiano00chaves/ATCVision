import React, { useEffect, useState } from 'react'
import { dailyApi, dashboardsApi, documentsApi, occurrencesApi, presetsApi } from '@/api'
import type {
  DailyMode,
  DailyWindow,
  Kpis,
  OccurrenceFilters,
  PdfDocument,
  Preset,
} from '@/api/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Occurrences } from './Occurrences'
import { FilterSidebar } from '@/components/filters/FilterSidebar'
import { useWorkspaceLayout } from '@/context/WorkspaceLayoutContext'
import {
  applyPresetToFilters,
  clearPresetFromFilters,
  countActiveFilters,
  PREFERRED_PRESET_KEY,
} from '@/lib/presets'
import {
  AlertTriangle,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Database,
  FileText,
  Filter,
  Flame,
  Layers,
  Maximize2,
  Minimize2,
  OctagonAlert,
  PanelLeft,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Wrench,
  X,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export function DailyReport() {
  const {
    filterPanelMode,
    toggleFilterPanel,
    headerCollapsed,
    toggleHeader,
    focusMode,
    toggleFocusMode,
  } = useWorkspaceLayout()

  // Routine mode states
  const [mode, setMode] = useState<DailyMode>(() => {
    return (localStorage.getItem('atc_daily_routine_mode') as DailyMode) || 'last24'
  })
  const [accumDays, setAccumDays] = useState<number>(3)
  const [refDate, setRefDate] = useState<string>('')
  const [windowInfo, setWindowInfo] = useState<DailyWindow | null>(null)

  // Document picker states
  const [recentDocs, setRecentDocs] = useState<PdfDocument[]>([])
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([])
  const [docPickerOpen, setDocPickerOpen] = useState<boolean>(false)

  // Presets and counts
  const [presets, setPresets] = useState<Preset[]>([])
  const [presetCounts, setPresetCounts] = useState<Record<string, number>>({})

  // Quick Operational KPI metrics for the window
  const [kpis, setKpis] = useState<Kpis | null>(null)
  const [kpisLoading, setKpisLoading] = useState(false)

  // Central filter state for all area & tag refinements
  const [filters, setFilters] = useState<OccurrenceFilters>({})

  // 1. Fetch Window info
  const loadWindow = async () => {
    try {
      const win = await dailyApi.window(mode, accumDays, refDate || undefined)
      setWindowInfo(win)
    } catch {
      toast.error('Erro ao calcular janela operacional')
    }
  }

  useEffect(() => {
    loadWindow()
  }, [mode, accumDays, refDate])

  // 2. Fetch Presets and Recent Documents
  const loadPresetsAndDocs = async () => {
    try {
      const [pList, docs] = await Promise.all([presetsApi.list(), documentsApi.list(15, 0)])
      const quickPresets = pList.filter((p) => p.show_in_quickbar)
      setPresets(quickPresets)
      setRecentDocs(docs.items)

      // Auto-apply persisted preferred preset on initial mount if filters are empty
      const savedPresetId = localStorage.getItem(PREFERRED_PRESET_KEY)
      if (savedPresetId) {
        const found = pList.find((p) => p.id === savedPresetId)
        if (found) {
          setFilters((prev) => applyPresetToFilters(prev, found))
        } else {
          localStorage.removeItem(PREFERRED_PRESET_KEY)
        }
      }
    } catch {
      // Ignored
    }
  }

  useEffect(() => {
    loadPresetsAndDocs()

    const onPresetsChanged = () => loadPresetsAndDocs()
    window.addEventListener('atc:presets-changed', onPresetsChanged)
    return () => window.removeEventListener('atc:presets-changed', onPresetsChanged)
  }, [])

  const handleModeChange = (newMode: DailyMode) => {
    setMode(newMode)
    localStorage.setItem('atc_daily_routine_mode', newMode)
    setSelectedDocIds([])
  }

  const handlePresetToggle = (preset: Preset) => {
    const isCurrentlyActive = filters.preset_id === preset.id
    if (isCurrentlyActive) {
      localStorage.removeItem(PREFERRED_PRESET_KEY)
      setFilters((prev) => clearPresetFromFilters(prev))
      toast.info('Foco rápido desativado')
    } else {
      localStorage.setItem(PREFERRED_PRESET_KEY, preset.id)
      setFilters((prev) => applyPresetToFilters(prev, preset))
      toast.success(`Foco rápido: ${preset.name}`, {
        description: 'Filtro preferencial fixado e aplicado.',
      })
    }
  }

  const handleClearActivePreset = () => {
    localStorage.removeItem(PREFERRED_PRESET_KEY)
    setFilters((prev) => clearPresetFromFilters(prev))
    toast.info('Foco rápido desativado')
  }

  const toggleMetricFilter = (key: 'only_pane' | 'only_jump' | 'only_relevant' | 'only_analyze') => {
    setFilters((prev) => ({
      ...prev,
      [key]: prev[key] ? undefined : true,
    }))
  }

  const isDocFiltered = selectedDocIds.length > 0
  const isAllMode = mode === 'all'

  const effectiveStart = isAllMode || isDocFiltered || !windowInfo?.start ? undefined : windowInfo.start
  const effectiveEnd = isAllMode || isDocFiltered || !windowInfo?.end ? undefined : windowInfo.end

  // 3. Fetch real-time counts and KPIs for the active window or selected PDFs
  useEffect(() => {
    if (!windowInfo && !isAllMode) return
    const baseFilters: OccurrenceFilters = {
      start: effectiveStart,
      end: effectiveEnd,
      document_ids: isDocFiltered ? selectedDocIds : undefined,
    }

    // Counts for presets
    occurrencesApi
      .counts(baseFilters)
      .then((res) => {
        const countsMap: Record<string, number> = {}
        for (const item of res.presets) {
          countsMap[item.preset_id] = item.count
        }
        setPresetCounts(countsMap)
      })
      .catch(() => {})

    // KPIs for executive strip
    setKpisLoading(true)
    dashboardsApi
      .kpis(baseFilters)
      .then((kRes) => setKpis(kRes))
      .catch(() => {})
      .finally(() => setKpisLoading(false))
  }, [windowInfo, selectedDocIds, mode, refDate, accumDays])

  // Build combined filters for the embedded Occurrences component
  const computedFilters: OccurrenceFilters = {
    ...filters,
    start: effectiveStart,
    end: effectiveEnd,
    document_ids: isDocFiltered ? selectedDocIds : undefined,
  }

  const activeFiltersCount = countActiveFilters(filters)

  const toggleDocSelection = (id: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

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
      default:
        return <Filter className="size-3" />
    }
  }

  const totalCountInWindow = kpis?.total ?? Object.values(presetCounts).reduce((a, b) => a + b, 0)
  const activePreset = presets.find((p) => p.id === filters.preset_id)

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      {/* ----------------- LEFT FILTER SIDEBAR (Customizable / Collapsible) ----------------- */}
      <FilterSidebar
        filters={filters}
        onChange={setFilters}
        showPeriod={false}
      />

      {/* ----------------- MAIN WORKSPACE COLUMN ----------------- */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        {/* Top Header Strip (Smart Collapsible) */}
        <div className="bg-card border-b border-border/50 shrink-0 shadow-2xs select-none">
          {/* ---------------- COLLAPSED MODE (Only 32px height) ---------------- */}
          {headerCollapsed ? (
            <div className="h-8 px-2 sm:px-3 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
                {/* Trigger Left Filter Sidebar */}
                <Button
                  variant="outline"
                  size="xs"
                  onClick={toggleFilterPanel}
                  className={cn(
                    'h-6 px-2 text-[11px] font-semibold gap-1 shrink-0',
                    filterPanelMode === 'pinned' && 'bg-primary/10 border-primary/40 text-primary'
                  )}
                >
                  <SlidersHorizontal className="size-3 text-primary" />
                  <span>Filtros</span>
                  {activeFiltersCount > 0 && (
                    <span className="size-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                      {activeFiltersCount}
                    </span>
                  )}
                </Button>

                {/* Routine pill badge */}
                <Badge variant="outline" className="text-[10px] font-medium shrink-0 h-5 px-1.5 bg-muted/30">
                  <Calendar className="size-2.5 mr-1 text-primary" />
                  {isDocFiltered ? `Filtrando ${selectedDocIds.length} PDF(s)` : windowInfo?.label?.split('—')[0]?.trim() || '24h'}
                </Badge>

                {/* Active Preset Pill */}
                {activePreset && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary text-primary-foreground text-[11px] font-bold shrink-0 shadow-2xs">
                    {getPresetIcon(activePreset.icon)}
                    <span>{activePreset.name}</span>
                    <button
                      type="button"
                      onClick={handleClearActivePreset}
                      className="hover:bg-primary-foreground/20 rounded p-0.5"
                      title="Desativar foco"
                    >
                      <X className="size-2.5" />
                    </button>
                  </span>
                )}

                {/* Active PFs pills */}
                {filters.fl_prefixes?.map((pf) => (
                  <span
                    key={pf}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono text-foreground shrink-0 border"
                  >
                    <span>{pf}</span>
                  </span>
                ))}

                {/* Quick KPI stats in collapsed mode */}
                {kpis && (
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground ml-1 shrink-0">
                    <span>
                      Total: <b className="text-foreground font-mono">{kpis.total}</b>
                    </span>
                    {kpis.pane_count > 0 && (
                      <span className="text-red-600 dark:text-red-400 font-semibold">
                        • {kpis.pane_count} Panes ({Math.round(kpis.pane_total_min)}m)
                      </span>
                    )}
                    {kpis.jump_count > 0 && (
                      <span className="text-amber-600 dark:text-amber-400 font-semibold">
                        • {kpis.jump_count} Jumps
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Right controls */}
              <div className="flex items-center gap-1 shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={toggleFocusMode}
                      className={cn(
                        'h-6 text-[10px] gap-1 px-2',
                        focusMode ? 'text-primary font-bold bg-primary/10' : 'text-muted-foreground'
                      )}
                    >
                      {focusMode ? <Minimize2 className="size-3" /> : <Maximize2 className="size-3" />}
                      <span className="hidden lg:inline">{focusMode ? 'Sair do Foco' : 'Modo Foco'}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {focusMode ? 'Restaurar menus normais (Esc ou Ctrl+.)' : 'Ocultar tudo para leitura máxima (Ctrl+.)'}
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={toggleHeader}
                      className="h-6 text-[10px] gap-1 px-2 text-primary font-bold hover:bg-muted"
                    >
                      <ChevronDown className="size-3.5" />
                      <span className="hidden sm:inline">Expandir Topo</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    Expandir cockpit da rotina diária (Ctrl+Shift+H)
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          ) : (
            /* ---------------- EXPANDED COCKPIT (Streamlined 2 Rows) ---------------- */
            <div className="p-2 space-y-2">
              {/* Row 1: Routine Selector & Quick Search & Window Badge */}
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                {/* Window Mode Segmented Pills */}
                <div className="flex items-center gap-1 overflow-x-auto pb-0.5 sm:pb-0 scrollbar-none w-full sm:w-auto">
                  <span className="text-xs font-bold text-foreground mr-1 flex items-center gap-1.5 shrink-0">
                    <Calendar className="size-3.5 text-primary" />
                    <span className="hidden sm:inline">Rotina Diária:</span>
                    <span className="sm:hidden">Rotina:</span>
                  </span>

                  <Button
                    size="xs"
                    variant={mode === 'last24' && selectedDocIds.length === 0 ? 'default' : 'outline'}
                    onClick={() => handleModeChange('last24')}
                    className={cn(
                      'shrink-0 text-xs font-semibold h-7 px-2',
                      mode === 'last24' && selectedDocIds.length === 0 && 'shadow-xs'
                    )}
                  >
                    Último Turno (24h)
                  </Button>

                  <Button
                    size="xs"
                    variant={mode === 'weekend' && selectedDocIds.length === 0 ? 'default' : 'outline'}
                    onClick={() => handleModeChange('weekend')}
                    className={cn(
                      'shrink-0 text-xs font-semibold h-7 px-2',
                      mode === 'weekend' && selectedDocIds.length === 0 && 'shadow-xs'
                    )}
                  >
                    Pós-FDS (Sex→Seg)
                  </Button>

                  <Button
                    size="xs"
                    variant={mode === 'days' && selectedDocIds.length === 0 ? 'default' : 'outline'}
                    onClick={() => handleModeChange('days')}
                    className={cn(
                      'shrink-0 text-xs font-semibold h-7 px-2',
                      mode === 'days' && selectedDocIds.length === 0 && 'shadow-xs'
                    )}
                  >
                    Pós-Feriado ({accumDays}d)
                  </Button>

                  <Button
                    size="xs"
                    variant={mode === 'all' && selectedDocIds.length === 0 ? 'default' : 'outline'}
                    onClick={() => handleModeChange('all')}
                    className={cn(
                      'shrink-0 text-xs font-semibold gap-1 h-7 px-2',
                      mode === 'all' && selectedDocIds.length === 0 && 'shadow-xs'
                    )}
                    title="Visualiza todo o acervo histórico sem corte de data"
                  >
                    <Database className="size-3" />
                    <span>Histórico</span>
                  </Button>

                  {/* Document Picker Toggle */}
                  <div className="relative shrink-0">
                    <Button
                      size="xs"
                      variant={selectedDocIds.length > 0 ? 'default' : 'outline'}
                      onClick={() => setDocPickerOpen(!docPickerOpen)}
                      className="gap-1 text-xs font-semibold h-7 px-2"
                    >
                      <FileText className="size-3" />
                      <span>Por PDF {selectedDocIds.length > 0 && `(${selectedDocIds.length})`}</span>
                      <ChevronDown className="size-3 opacity-60" />
                    </Button>

                    {docPickerOpen && (
                      <div className="absolute left-0 sm:left-auto sm:right-0 top-8 z-40 w-72 rounded-xl border bg-popover p-2 shadow-xl text-xs space-y-1 max-h-64 overflow-y-auto">
                        <div className="flex items-center justify-between pb-1.5 border-b border-border/60">
                          <span className="font-bold text-[11px] text-foreground">Relatórios Recentes:</span>
                          {selectedDocIds.length > 0 && (
                            <button
                              onClick={() => setSelectedDocIds([])}
                              className="text-[10px] text-primary hover:underline font-semibold"
                            >
                              Limpar Seleção
                            </button>
                          )}
                        </div>
                        {recentDocs.map((doc) => {
                          const selected = selectedDocIds.includes(doc.id)
                          return (
                            <div
                              key={doc.id}
                              onClick={() => toggleDocSelection(doc.id)}
                              className={cn(
                                'p-1.5 rounded-lg cursor-pointer flex items-center justify-between text-xs hover:bg-accent transition-colors',
                                selected && 'bg-primary/10 font-bold text-primary'
                              )}
                            >
                              <span className="truncate max-w-[200px]">{doc.filename}</span>
                              {selected && <Check className="size-3.5 text-primary shrink-0" />}
                            </div>
                          )
                        })}
                        {recentDocs.length === 0 && (
                          <p className="text-muted-foreground text-center py-2 text-xs">
                            Nenhum relatório recente encontrado
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Reference Date Picker & Active Window Badge */}
                <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                  {mode !== 'all' && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-muted-foreground font-medium hidden md:inline">
                        Referência:
                      </span>
                      <Input
                        type="date"
                        value={refDate}
                        onChange={(e) => setRefDate(e.target.value)}
                        className="h-7 w-28 text-xs bg-background px-1.5"
                      />
                    </div>
                  )}

                  {windowInfo && (
                    <Badge variant="outline" className="text-[10px] font-mono font-medium max-w-[240px] truncate hidden sm:inline-flex">
                      {isDocFiltered ? `Filtrando ${selectedDocIds.length} PDF(s)` : windowInfo.label}
                    </Badge>
                  )}

                  {/* Filter Sidebar Toggle Button with Badge */}
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={toggleFilterPanel}
                    className={cn(
                      'h-7 px-2.5 text-xs font-semibold gap-1.5 shrink-0',
                      filterPanelMode === 'pinned' && 'bg-primary/10 border-primary/40 text-primary'
                    )}
                    title="Abrir / Fixar painel de filtros da área na esquerda (Ctrl+Shift+F)"
                  >
                    <SlidersHorizontal className="size-3.5 text-primary" />
                    <span>Filtros da Área</span>
                    {activeFiltersCount > 0 && (
                      <span className="size-4.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                        {activeFiltersCount}
                      </span>
                    )}
                  </Button>

                  {/* Collapse Top Bar Button */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={toggleHeader}
                        className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1 px-1.5"
                        title="Recolher topo para maximizar área de visualização (Ctrl+Shift+H)"
                      >
                        <ChevronUp className="size-3.5" />
                        <span className="hidden sm:inline">Recolher</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      Recolher barra do topo para ganhar espaço (Ctrl+Shift+H)
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>

              {/* Row 2: Search Input + Presets Row + KPI Snapshot */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/40">
                {/* Keyword Search */}
                <div className="relative min-w-[180px] max-w-xs flex-1">
                  <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
                  <Input
                    value={filters.q || ''}
                    onChange={(e) => setFilters({ ...filters, q: e.target.value || undefined })}
                    placeholder="Buscar ocorrências nesta rotina..."
                    className="pl-8 pr-7 h-7 text-xs bg-background"
                  />
                  {filters.q && (
                    <button
                      onClick={() => setFilters({ ...filters, q: undefined })}
                      className="absolute right-2 top-1.5 text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </div>

                {/* Presets Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5 max-w-full">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground shrink-0 flex items-center gap-1 pr-1">
                    <Sparkles className="size-3 text-primary" /> Foco Rápido:
                  </span>

                  {presets.map((preset) => {
                    const count = presetCounts[preset.id] ?? 0
                    const active = filters.preset_id === preset.id
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handlePresetToggle(preset)}
                        title={active ? 'Filtro preferencial fixado (clique para desativar)' : `Ativar foco: ${preset.name}`}
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold transition-all shrink-0 border cursor-pointer',
                          active
                            ? 'bg-primary text-primary-foreground border-primary font-bold shadow-xs'
                            : 'bg-background hover:bg-muted text-foreground border-border/70'
                        )}
                      >
                        {getPresetIcon(preset.icon)}
                        <span>{preset.name}</span>
                        {active && <Star className="size-2.5 fill-amber-300 text-amber-300 shrink-0" />}
                        <span
                          className={cn(
                            'text-[9px] px-1 py-0.2 rounded-full font-bold font-mono',
                            active ? 'bg-background/25 text-primary-foreground' : 'bg-muted text-foreground'
                          )}
                        >
                          {count}
                        </span>
                      </button>
                    )
                  })}

                  {activePreset && (
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={handleClearActivePreset}
                      className="text-[11px] text-muted-foreground hover:text-red-500 h-6 px-1.5 shrink-0"
                      title="Desativar foco rápido"
                    >
                      <X className="size-3 mr-0.5" /> Limpar Foco
                    </Button>
                  )}
                </div>

                {/* KPI Quick Filter Badges */}
                {kpis && (
                  <div className="flex items-center gap-1 shrink-0 ml-auto">
                    <button
                      onClick={() => toggleMetricFilter('only_pane')}
                      className={cn(
                        'px-2 py-0.5 rounded text-[11px] font-semibold border flex items-center gap-1 transition-colors cursor-pointer',
                        filters.only_pane
                          ? 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/50 font-bold'
                          : 'bg-muted/40 text-muted-foreground border-border/50 hover:text-foreground'
                      )}
                      title="Filtrar ocorrências com pane"
                    >
                      <OctagonAlert className="size-3 text-red-500" />
                      <span>Panes: {kpis.pane_count}</span>
                    </button>

                    <button
                      onClick={() => toggleMetricFilter('only_jump')}
                      className={cn(
                        'px-2 py-0.5 rounded text-[11px] font-semibold border flex items-center gap-1 transition-colors cursor-pointer',
                        filters.only_jump
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/50 font-bold'
                          : 'bg-muted/40 text-muted-foreground border-border/50 hover:text-foreground'
                      )}
                      title="Filtrar ocorrências com Jumps ou Forces ativos"
                    >
                      <AlertTriangle className="size-3 text-amber-500" />
                      <span>Jumps: {kpis.jump_count}</span>
                    </button>

                    <button
                      onClick={() => toggleMetricFilter('only_relevant')}
                      className={cn(
                        'px-2 py-0.5 rounded text-[11px] font-semibold border flex items-center gap-1 transition-colors cursor-pointer',
                        filters.only_relevant
                          ? 'bg-amber-400/20 text-foreground border-amber-400/50 font-bold'
                          : 'bg-muted/40 text-muted-foreground border-border/50 hover:text-foreground'
                      )}
                      title="Filtrar ocorrências marcadas como Relevantes"
                    >
                      <Star className="size-3 fill-amber-400 text-amber-400" />
                      <span>Relevantes</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Informative fallback banner when last24 has zero counts */}
        {mode === 'last24' && totalCountInWindow === 0 && selectedDocIds.length === 0 && (
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 shrink-0">
            <div className="flex items-center gap-2">
              <Clock className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>Nenhuma ocorrência nas últimas 24h deste turno. Você pode consultar todo o acervo histórico.</span>
            </div>
            <Button
              size="xs"
              variant="outline"
              onClick={() => handleModeChange('all')}
              className="h-5 text-[11px] border-amber-500/30 hover:bg-amber-500/20 shrink-0 font-bold"
            >
              Ver Todo o Período
            </Button>
          </div>
        )}

        {/* ----------------- OCCURRENCES MAIN FEED & VIEWER ----------------- */}
        <div className="flex-1 overflow-hidden">
          <Occurrences
            initialFilters={computedFilters}
            hideFilterBar={true}
          />
        </div>
      </div>
    </div>
  )
}
