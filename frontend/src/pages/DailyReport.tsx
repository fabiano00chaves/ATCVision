import React, { useEffect, useState } from 'react'
import { dailyApi, dashboardsApi, documentsApi, occurrencesApi, presetsApi, reportsApi } from '@/api'
import type {
  DailyMode,
  DailyWindow,
  DateMode,
  Kpis,
  OccurrenceFilters,
  PdfDocument,
  Preset,
  SortKey,
} from '@/api/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Flame,
  Layers,
  Loader2,
  Maximize2,
  MessageSquare,
  Minimize2,
  OctagonAlert,
  Presentation,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  X,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { QuickbarPresetSelect } from '@/components/filters/QuickbarPresetSelect'
import { PresetManagerModal } from '@/components/presets/PresetManagerModal'

const DAILY_DATE_MODE_KEY = 'atc_daily_date_mode_v1'

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
  const [dateMode, setDateMode] = useState<DateMode>(() => {
    const saved = localStorage.getItem(DAILY_DATE_MODE_KEY) as DateMode | null
    return saved && ['atividade', 'abertura', 'confirmacao'].includes(saved) ? saved : 'atividade'
  })
  const [accumDays, setAccumDays] = useState<number>(3)
  const [refDate, setRefDate] = useState<string>('')
  const [windowInfo, setWindowInfo] = useState<DailyWindow | null>(null)
  const [dailySort, setDailySort] = useState<SortKey>('abertura_desc')
  const [kpiRefreshTick, setKpiRefreshTick] = useState(0)

  // Document selection for "Por PDF" mode
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([])
  const [recentDocs, setRecentDocs] = useState<PdfDocument[]>([])
  const [docPickerOpen, setDocPickerOpen] = useState(false)

  // Active user filters
  const [filters, setFilters] = useState<OccurrenceFilters>({})
  const [presets, setPresets] = useState<Preset[]>([])
  const [presetCounts, setPresetCounts] = useState<Record<string, number>>({})
  const [totalCountInWindow, setTotalCountInWindow] = useState<number>(0)
  const [kpis, setKpis] = useState<Kpis | null>(null)
  const [managerOpen, setManagerOpen] = useState(false)
  const [selectedPresetToEdit, setSelectedPresetToEdit] = useState<Preset | null | undefined>(undefined)

  // 1. Load Presets
  const loadPresets = async () => {
    try {
      const list = await presetsApi.list()
      const quick = list.filter((p) => p.show_in_quickbar)
      setPresets(quick)

      // Auto-apply saved preferred preset if no filter active
      const savedId = localStorage.getItem(PREFERRED_PRESET_KEY)
      if (savedId && !filters.preset_id) {
        const found = quick.find((p) => p.id === savedId)
        if (found) {
          setFilters((prev) => applyPresetToFilters(prev, found))
        }
      }
    } catch {
      // Ignored
    }
  }

  useEffect(() => {
    loadPresets()

    const onPresetsChanged = () => loadPresets()
    window.addEventListener('atc:presets-changed', onPresetsChanged)
    return () => window.removeEventListener('atc:presets-changed', onPresetsChanged)
  }, [])

  // 2. Fetch recent PDF documents for "Por PDF" selector
  useEffect(() => {
    documentsApi
      .list(30, 0)
      .then((res) => {
        setRecentDocs(res.items || [])
      })
      .catch(() => {})
  }, [])

  // Subscribe to occurrence updates to refresh live KPI/Reunião counts
  useEffect(() => {
    const onOccUpdated = () => setKpiRefreshTick((t) => t + 1)
    window.addEventListener('atc:occurrence-updated', onOccUpdated)
    return () => window.removeEventListener('atc:occurrence-updated', onOccUpdated)
  }, [])

  // 3. Fetch real-time counts and KPIs for the active window or selected PDFs
  useEffect(() => {
    let active = true

    async function fetchWindowAndCounts() {
      try {
        let win: DailyWindow | null = null
        if (selectedDocIds.length === 0) {
          win = await dailyApi.window(mode, accumDays, refDate || undefined)
          if (!active) return
          setWindowInfo(win)
        } else {
          setWindowInfo(null)
        }

        // Base window criteria
        const baseCriteria: OccurrenceFilters = {}
        if (selectedDocIds.length > 0) {
          baseCriteria.document_ids = selectedDocIds
        } else if (win) {
          baseCriteria.start = win.start
          baseCriteria.end = win.end
          baseCriteria.date_mode = dateMode
        }

        // Fetch overall KPI counts
        dashboardsApi.kpis(baseCriteria).then((data) => {
          if (active) setKpis(data)
        }).catch(() => {})

        // Total count in window
        occurrencesApi.list(baseCriteria, 1).then((res) => {
          if (active) setTotalCountInWindow(res.total)
        }).catch(() => {})

        // Real counts per preset
        const countMap: Record<string, number> = {}
        await Promise.all(
          presets.map(async (p) => {
            try {
              const presetFilters = applyPresetToFilters(baseCriteria, p)
              const res = await occurrencesApi.list(presetFilters, 1)
              countMap[p.id] = res.total
            } catch {
              countMap[p.id] = 0
            }
          })
        )
        if (active) setPresetCounts(countMap)
      } catch {
        // Fallback
      }
    }

    fetchWindowAndCounts()
    return () => {
      active = false
    }
  }, [mode, dateMode, accumDays, refDate, selectedDocIds, presets, kpiRefreshTick])

  // Preset Handlers
  const handlePresetSelect = (preset: Preset) => {
    try {
      localStorage.setItem(PREFERRED_PRESET_KEY, preset.id)
    } catch {}
    setFilters(applyPresetToFilters(filters, preset))
    toast.success(`Foco rápido: ${preset.name}`, {
      description: 'Filtro preferencial fixado e aplicado.',
    })
  }

  const handleClearActivePreset = () => {
    try {
      localStorage.removeItem(PREFERRED_PRESET_KEY)
    } catch {}
    setFilters(clearPresetFromFilters(filters))
    toast.info('Foco rápido desativado')
  }

  // Toggle routine mode
  const handleModeChange = (newMode: DailyMode) => {
    setMode(newMode)
    setSelectedDocIds([])
    try {
      localStorage.setItem('atc_daily_routine_mode', newMode)
    } catch {}
  }

  const handleDateModeChange = (newDateMode: DateMode) => {
    setDateMode(newDateMode)
    try {
      localStorage.setItem(DAILY_DATE_MODE_KEY, newDateMode)
    } catch {}
  }

  const toggleDocSelection = (docId: string) => {
    setSelectedDocIds((prev) => {
      if (prev.includes(docId)) {
        return prev.filter((id) => id !== docId)
      }
      return [...prev, docId]
    })
  }

  const toggleMetricFilter = (key: 'only_pane' | 'only_jump' | 'only_relevant' | 'only_meeting') => {
    setFilters((prev) => ({
      ...prev,
      [key]: prev[key] ? undefined : true,
    }))
  }

  // Merge Routine Window into Query Filters
  const computedFilters: OccurrenceFilters = {
    ...filters,
    sort: dailySort,
  }

  if (selectedDocIds.length > 0) {
    computedFilters.document_ids = selectedDocIds
    delete computedFilters.start
    delete computedFilters.end
    delete computedFilters.date_mode
  } else if (windowInfo) {
    computedFilters.start = windowInfo.start
    computedFilters.end = windowInfo.end
    computedFilters.date_mode = dateMode
  }

  const [exporting, setExporting] = useState<boolean>(false)

  const handleExportDaily = async (
    fmt: 'pdf' | 'xlsx' | 'csv' | 'whatsapp',
    scopeOverride: 'all' | 'meeting' = 'all'
  ) => {
    setExporting(true)
    try {
      const prefix = scopeOverride === 'meeting' ? 'Pauta Reunião Diária ATC' : 'Relatório Diário ATC'
      const headerTitle = windowInfo?.label
        ? `${prefix} — ${windowInfo.label}`
        : `${prefix} — ATC Vision`

      const res = await reportsApi.generate({
        header_title: headerTitle,
        format: fmt,
        scope: scopeOverride,
        filters: computedFilters,
        include_atc_comments: true,
      })

      if (res.kind === 'json') {
        await navigator.clipboard.writeText(res.data.text)
        toast.success(
          scopeOverride === 'meeting'
            ? 'Pauta da Reunião copiada para a área de transferência!'
            : 'Resumo de turno copiado para a área de transferência!'
        )
      } else {
        const url = window.URL.createObjectURL(res.data.blob)
        const a = document.createElement('a')
        a.href = url
        a.download =
          res.data.filename ||
          `${scopeOverride === 'meeting' ? 'pauta_reuniao' : 'relatorio_diario'}_atc.${fmt}`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
        toast.success(`Relatório ${fmt.toUpperCase()} exportado com sucesso!`)
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao exportar relatório')
    } finally {
      setExporting(false)
    }
  }

  const handleClearMeetingAgenda = async () => {
    try {
      const scopeFilters: OccurrenceFilters = {}
      if (selectedDocIds.length > 0) {
        scopeFilters.document_ids = selectedDocIds
      } else if (windowInfo?.start || windowInfo?.end) {
        scopeFilters.start = windowInfo.start
        scopeFilters.end = windowInfo.end
        scopeFilters.date_mode = dateMode
      }
      const res = await occurrencesApi.clearMeetingHighlights(scopeFilters)
      toast.success(res.message)
      if (filters.only_meeting) {
        setFilters((prev) => ({ ...prev, only_meeting: undefined }))
      }
      setKpiRefreshTick((t) => t + 1)
    } catch {
      toast.error('Erro ao limpar pauta de reunião')
    }
  }

  const activeFiltersCount = countActiveFilters(filters)
  const isDocFiltered = selectedDocIds.length > 0
  const activePreset = presets.find((p) => p.id === filters.preset_id)

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      {/* Left Collapsible Filter Sidebar (Area/Specialty/FunctionalLocation) */}
      <FilterSidebar
        filters={filters}
        onChange={setFilters}
        showPeriod={false}
      />

      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        {/* ================= TOP COCKPIT (COLLAPSED vs STREAMLINED EXPANDED) ================= */}
        <div className="border-b bg-card shrink-0 select-none transition-all">
          {headerCollapsed ? (
            /* ---------------- MINIMAL COLLAPSED BAR (32px) ---------------- */
            <div className="h-8 px-3 flex items-center justify-between text-xs gap-2">
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-0.5">
                {/* Filter Sidebar Toggle Button */}
                <Button
                  variant="outline"
                  size="xs"
                  onClick={toggleFilterPanel}
                  className={cn(
                    'h-6 px-2 text-[11px] font-semibold gap-1 shrink-0',
                    filterPanelMode === 'pinned' && 'bg-primary/10 border-primary/40 text-primary'
                  )}
                  title="Abrir ou fixar filtros da área na esquerda (Ctrl+Shift+F)"
                >
                  <SlidersHorizontal className="size-3 text-primary" />
                  <span>Filtros</span>
                  {activeFiltersCount > 0 && (
                    <span className="size-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                      {activeFiltersCount}
                    </span>
                  )}
                </Button>

                {/* Active Routine Badge */}
                <span className="font-semibold text-foreground shrink-0 flex items-center gap-1.5 font-mono text-[11px]">
                  <Calendar className="size-3 text-primary" />
                  <span>
                    {isDocFiltered ? `Filtrando ${selectedDocIds.length} PDF(s)` : windowInfo?.label?.split('—')[0]?.trim() || '24h'}
                  </span>
                </span>

                {/* Active preset pill */}
                {activePreset && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary text-primary-foreground text-[10px] font-bold shrink-0 shadow-2xs">
                    <span>{activePreset.name}</span>
                    <button
                      type="button"
                      onClick={handleClearActivePreset}
                      className="hover:bg-primary-foreground/20 rounded p-0.5 cursor-pointer"
                      title="Desativar foco"
                    >
                      <X className="size-2.5" />
                    </button>
                  </span>
                )}

                {/* KPI badges summary */}
                {kpis && (
                  <div className="hidden md:flex items-center gap-1.5 text-[11px] text-muted-foreground shrink-0 ml-1">
                    {(kpis.meeting_count || 0) > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleMetricFilter('only_meeting')}
                        className={cn(
                          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-semibold cursor-pointer border transition-colors',
                          filters.only_meeting
                            ? 'bg-violet-500/20 text-violet-600 dark:text-violet-300 border-violet-500/40'
                            : 'border-transparent text-violet-600 dark:text-violet-400 hover:bg-violet-500/10'
                        )}
                      >
                        • {kpis.meeting_count} Reunião
                      </button>
                    )}
                    {kpis.pane_count > 0 && (
                      <span className="text-red-500 font-semibold">
                        • {kpis.pane_count} Panes
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={exporting}
                      className="h-6 text-[10px] gap-1 px-2 text-primary font-semibold hover:bg-muted"
                      title="Exportar Relatório Diário de Turno (PDF, Excel, WhatsApp)"
                    >
                      {exporting ? (
                        <Loader2 className="size-3 animate-spin text-primary" />
                      ) : (
                        <Download className="size-3 text-primary" />
                      )}
                      <span className="hidden sm:inline">Exportar</span>
                      <ChevronDown className="size-2.5 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 text-xs">
                    <DropdownMenuItem
                      onClick={() => handleExportDaily('pdf')}
                      className="gap-2 cursor-pointer"
                    >
                      <FileText className="size-4 text-red-500" />
                      <div className="flex flex-col">
                        <span className="font-semibold">Relatório em PDF</span>
                        <span className="text-[10px] text-muted-foreground">Layout executivo A4</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleExportDaily('xlsx')}
                      className="gap-2 cursor-pointer"
                    >
                      <FileSpreadsheet className="size-4 text-emerald-600" />
                      <div className="flex flex-col">
                        <span className="font-semibold">Planilha Excel (.xlsx)</span>
                        <span className="text-[10px] text-muted-foreground">Com autofiltro e dados SAP</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleExportDaily('csv')}
                      className="gap-2 cursor-pointer"
                    >
                      <Database className="size-4 text-blue-500" />
                      <div className="flex flex-col">
                        <span className="font-semibold">Arquivo CSV</span>
                        <span className="text-[10px] text-muted-foreground">UTF-8 estruturado</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleExportDaily('whatsapp')}
                      className="gap-2 cursor-pointer"
                    >
                      <MessageSquare className="size-4 text-emerald-500" />
                      <div className="flex flex-col">
                        <span className="font-semibold">Copiar p/ WhatsApp / Teams</span>
                        <span className="text-[10px] text-muted-foreground">Texto formatado com emojis</span>
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

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
            /* ---------------- EXPANDED COCKPIT (Ultra-Clean Non-Wrapping Rows) ---------------- */
            <div className="p-2 space-y-2">
              {/* Row 1: Routine Selector & Date Reference & Sidebar Controls */}
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
                              className="text-[10px] text-primary hover:underline font-semibold cursor-pointer"
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

                {/* Reference Date Picker & Date Mode Reconciliation & Active Window Badge */}
                <div className="flex items-center gap-1.5 shrink-0 ml-auto flex-wrap">
                  {mode !== 'all' && selectedDocIds.length === 0 && (
                    <div className="flex items-center gap-1.5">
                      <select
                        value={dateMode}
                        onChange={(e) => handleDateModeChange(e.target.value as DateMode)}
                        title="Critério de Data da Rotina: concilia abertura e confirmações"
                        className="h-7 rounded-md border bg-background px-1.5 text-[11px] font-semibold text-foreground focus:ring-1 focus:ring-primary cursor-pointer"
                      >
                        <option value="atividade">Data: Abertura + Confirmação</option>
                        <option value="abertura">Data: Somente Abertura</option>
                        <option value="confirmacao">Data: Somente Confirmação</option>
                      </select>

                      <span className="text-[11px] text-muted-foreground font-medium hidden md:inline">
                        Ref:
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

                  {/* Export Daily Report Button */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="xs"
                        disabled={exporting}
                        className="h-7 px-2.5 text-xs font-semibold gap-1.5 shrink-0 bg-background hover:bg-muted/60"
                        title="Exportar Relatório Diário ou Pauta da Reunião (PDF, Excel, WhatsApp)"
                      >
                        {exporting ? (
                          <Loader2 className="size-3.5 animate-spin text-primary" />
                        ) : (
                          <Download className="size-3.5 text-primary" />
                        )}
                        <span className="hidden sm:inline">Exportar Diário</span>
                        <ChevronDown className="size-3 text-muted-foreground ml-0.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64 text-xs">
                      <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Rotina Completa (Filtros Atuais)
                      </DropdownMenuLabel>
                      <DropdownMenuItem
                        onClick={() => handleExportDaily('pdf', 'all')}
                        className="gap-2 cursor-pointer"
                      >
                        <FileText className="size-4 text-red-500" />
                        <div className="flex flex-col">
                          <span className="font-semibold">Relatório em PDF</span>
                          <span className="text-[10px] text-muted-foreground">Layout executivo A4</span>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleExportDaily('xlsx', 'all')}
                        className="gap-2 cursor-pointer"
                      >
                        <FileSpreadsheet className="size-4 text-emerald-600" />
                        <div className="flex flex-col">
                          <span className="font-semibold">Planilha Excel (.xlsx)</span>
                          <span className="text-[10px] text-muted-foreground">Com autofiltro e dados SAP</span>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleExportDaily('csv', 'all')}
                        className="gap-2 cursor-pointer"
                      >
                        <Database className="size-4 text-blue-500" />
                        <div className="flex flex-col">
                          <span className="font-semibold">Arquivo CSV</span>
                          <span className="text-[10px] text-muted-foreground">UTF-8 estruturado</span>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleExportDaily('whatsapp', 'all')}
                        className="gap-2 cursor-pointer"
                      >
                        <MessageSquare className="size-4 text-emerald-500" />
                        <div className="flex flex-col">
                          <span className="font-semibold">Copiar p/ WhatsApp / Teams</span>
                          <span className="text-[10px] text-muted-foreground">Texto formatado com emojis</span>
                        </div>
                      </DropdownMenuItem>

                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-violet-500">
                        Pauta da Reunião Diária ({kpis?.meeting_count || 0})
                      </DropdownMenuLabel>
                      <DropdownMenuItem
                        disabled={!kpis?.meeting_count}
                        onClick={() => handleExportDaily('pdf', 'meeting')}
                        className="gap-2 cursor-pointer"
                      >
                        <Presentation className="size-4 text-violet-500" />
                        <div className="flex flex-col">
                          <span className="font-semibold">PDF Somente Pauta da Reunião</span>
                          <span className="text-[10px] text-muted-foreground">Apenas registros destacados</span>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={!kpis?.meeting_count}
                        onClick={() => handleExportDaily('whatsapp', 'meeting')}
                        className="gap-2 cursor-pointer"
                      >
                        <MessageSquare className="size-4 text-violet-500" />
                        <div className="flex flex-col">
                          <span className="font-semibold">WhatsApp Pauta da Reunião</span>
                          <span className="text-[10px] text-muted-foreground">Resumo dos itens selecionados</span>
                        </div>
                      </DropdownMenuItem>
                      {(kpis?.meeting_count || 0) > 0 && (
                        <DropdownMenuItem
                          onClick={handleClearMeetingAgenda}
                          className="gap-2 cursor-pointer text-amber-600 dark:text-amber-400"
                        >
                          <RotateCcw className="size-4" />
                          <span className="font-semibold">Limpar Pauta da Reunião</span>
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Collapse Top Bar Button */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={toggleHeader}
                        className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1 px-1.5 cursor-pointer"
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

              {/* Row 2: Search Input + Foco Rápido ListBox + KPI Snapshot (Fits on a Single Row!) */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/40">
                <div className="flex items-center gap-2 flex-1 min-w-[240px] max-w-lg">
                  {/* Keyword Search */}
                  <div className="relative flex-1">
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
                        className="absolute right-2 top-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </div>

                  {/* Foco Rápido Listbox Dropdown (Saves an entire horizontal line!) */}
                  <QuickbarPresetSelect
                    presets={presets}
                    activePresetId={filters.preset_id}
                    counts={presetCounts}
                    onSelect={handlePresetSelect}
                    onClear={handleClearActivePreset}
                    onManage={() => {
                      setSelectedPresetToEdit(undefined)
                      setManagerOpen(true)
                    }}
                    onCreate={() => {
                      setSelectedPresetToEdit(null)
                      setManagerOpen(true)
                    }}
                    onEdit={(preset) => {
                      setSelectedPresetToEdit(preset)
                      setManagerOpen(true)
                    }}
                  />
                </div>

                {/* KPI Quick Filter Badges */}
                {kpis && (
                  <div className="flex items-center gap-1 shrink-0 ml-auto flex-wrap">
                    <button
                      onClick={() => toggleMetricFilter('only_meeting')}
                      className={cn(
                        'px-2 py-0.5 rounded text-[11px] font-semibold border flex items-center gap-1 transition-colors cursor-pointer',
                        filters.only_meeting
                          ? 'bg-violet-500/20 text-violet-700 dark:text-violet-300 border-violet-500/60 font-bold shadow-2xs'
                          : 'bg-muted/40 text-muted-foreground border-border/50 hover:text-foreground hover:border-violet-500/40'
                      )}
                      title="Mostrar somente os registros destacados para a Reunião Diária"
                    >
                      <Presentation className="size-3 text-violet-500" />
                      <span>Pauta Reunião: {kpis.meeting_count ?? 0}</span>
                    </button>

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
            onSortChange={setDailySort}
            onFilterLocationExternal={(pf) =>
              setFilters((prev) => ({ ...prev, fl_prefixes: pf ? [pf] : undefined }))
            }
          />
        </div>
      </div>

      <PresetManagerModal
        open={managerOpen}
        onOpenChange={setManagerOpen}
        initialPreset={selectedPresetToEdit}
        activePresetId={filters.preset_id}
        onSelectPreset={handlePresetSelect}
        onSuccess={loadPresets}
      />
    </div>
  )
}
