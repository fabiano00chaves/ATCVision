import React, { useEffect, useState } from 'react'
import { dailyApi, documentsApi, occurrencesApi, presetsApi } from '@/api'
import type { DailyMode, DailyWindow, OccurrenceFilters, PdfDocument, Preset } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Occurrences } from './Occurrences'
import {
  AlertTriangle,
  Calendar,
  Check,
  ChevronDown,
  Clock,
  Database,
  FileText,
  Filter,
  Flame,
  Layers,
  OctagonAlert,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Star,
  X,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export function DailyReport() {
  const [mode, setMode] = useState<DailyMode>(() => {
    return (localStorage.getItem('atc_daily_routine_mode') as DailyMode) || 'last24'
  })
  const [accumDays, setAccumDays] = useState<number>(3)
  const [refDate, setRefDate] = useState<string>('')
  const [windowInfo, setWindowInfo] = useState<DailyWindow | null>(null)

  const [presets, setPresets] = useState<Preset[]>([])
  const [presetCounts, setPresetCounts] = useState<Record<string, number>>({})
  const [activePresetId, setActivePresetId] = useState<string | null>(() => {
    return localStorage.getItem('atc_preferred_preset_id') || null
  })

  const [recentDocs, setRecentDocs] = useState<PdfDocument[]>([])
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([])
  const [docPickerOpen, setDocPickerOpen] = useState<boolean>(false)

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

      // Validate persisted preset
      const savedPresetId = localStorage.getItem('atc_preferred_preset_id')
      if (savedPresetId && !pList.some((p) => p.id === savedPresetId)) {
        localStorage.removeItem('atc_preferred_preset_id')
        setActivePresetId(null)
      }
    } catch {
      // Ignored
    }
  }

  useEffect(() => {
    loadPresetsAndDocs()
  }, [])

  const handleModeChange = (newMode: DailyMode) => {
    setMode(newMode)
    localStorage.setItem('atc_daily_routine_mode', newMode)
    setSelectedDocIds([])
  }

  const handlePresetToggle = (preset: Preset) => {
    if (activePresetId === preset.id) {
      setActivePresetId(null)
      localStorage.removeItem('atc_preferred_preset_id')
      toast.info('Filtro rápido desativado')
    } else {
      setActivePresetId(preset.id)
      localStorage.setItem('atc_preferred_preset_id', preset.id)
      toast.success(`Foco rápido: ${preset.name}`, {
        description: 'Filtro preferencial fixado e salvo.',
      })
    }
  }

  const isDocFiltered = selectedDocIds.length > 0
  const isAllMode = mode === 'all'

  const effectiveStart = isAllMode || isDocFiltered || !windowInfo?.start ? undefined : windowInfo.start
  const effectiveEnd = isAllMode || isDocFiltered || !windowInfo?.end ? undefined : windowInfo.end

  // 3. Fetch real-time counts for the active window or selected PDFs
  useEffect(() => {
    if (!windowInfo && !isAllMode) return
    const baseFilters: OccurrenceFilters = {
      start: effectiveStart,
      end: effectiveEnd,
      document_ids: isDocFiltered ? selectedDocIds : undefined,
    }
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
  }, [windowInfo, selectedDocIds, mode, refDate, accumDays])

  // Build filters for the Occurrences component
  const activePreset = presets.find((p) => p.id === activePresetId)
  const presetPayload = activePreset?.filter_payload
  const computedFilters: OccurrenceFilters = {
    start: effectiveStart,
    end: effectiveEnd,
    document_ids: isDocFiltered ? selectedDocIds : undefined,
    preset_id: activePresetId || undefined,
    fl_prefixes: presetPayload?.functional_locations_prefixes?.length
      ? presetPayload.functional_locations_prefixes
      : undefined,
    arvores: presetPayload?.arvores?.length ? presetPayload.arvores : undefined,
    specialties: presetPayload?.specialties?.length ? presetPayload.specialties : undefined,
    turnos: presetPayload?.turnos?.length ? presetPayload.turnos : undefined,
    planning_groups: presetPayload?.planning_groups?.length ? presetPayload.planning_groups : undefined,
    only_pane: presetPayload?.only_pane || undefined,
    only_jump: presetPayload?.only_jump || undefined,
    only_relevant: presetPayload?.only_relevant || undefined,
    only_analyze: presetPayload?.only_analyze || undefined,
    q: presetPayload?.keywords?.length ? presetPayload.keywords.join(' ') : undefined,
  }

  const toggleDocSelection = (id: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const getPresetIcon = (iconName: string) => {
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

  const totalCountInWindow = Object.values(presetCounts).reduce((a, b) => a + b, 0)

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Smart Daily Window Control Header */}
      <div className="bg-card border-b p-3 space-y-2.5 shrink-0 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Window Mode Buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-foreground mr-1 flex items-center gap-1">
              <Calendar className="size-3.5 text-primary" /> Rotina Diária ATC:
            </span>

            <Button
              size="xs"
              variant={mode === 'last24' && selectedDocIds.length === 0 ? 'default' : 'outline'}
              onClick={() => handleModeChange('last24')}
            >
              Último Turno (24h / D-1)
            </Button>

            <Button
              size="xs"
              variant={mode === 'weekend' && selectedDocIds.length === 0 ? 'default' : 'outline'}
              onClick={() => handleModeChange('weekend')}
            >
              Pós-Final de Semana (Sex → Seg)
            </Button>

            <Button
              size="xs"
              variant={mode === 'days' && selectedDocIds.length === 0 ? 'default' : 'outline'}
              onClick={() => handleModeChange('days')}
            >
              Pós-Feriado / Acumulado ({accumDays}d)
            </Button>

            <Button
              size="xs"
              variant={mode === 'all' && selectedDocIds.length === 0 ? 'default' : 'outline'}
              onClick={() => handleModeChange('all')}
              className="gap-1"
              title="Visualiza todo o acervo histórico sem corte de data"
            >
              <Database className="size-3" />
              Todo o Período
            </Button>

            {/* Document Picker Toggle */}
            <div className="relative">
              <Button
                size="xs"
                variant={selectedDocIds.length > 0 ? 'default' : 'outline'}
                onClick={() => setDocPickerOpen(!docPickerOpen)}
                className="gap-1"
              >
                <FileText className="size-3" />
                Por PDF Emitido {selectedDocIds.length > 0 && `(${selectedDocIds.length})`}
                <ChevronDown className="size-3 opacity-60" />
              </Button>

              {docPickerOpen && (
                <div className="absolute left-0 top-7 z-30 w-72 rounded-md border bg-popover p-2 shadow-lg text-xs space-y-1 max-h-60 overflow-y-auto">
                  <div className="flex items-center justify-between pb-1 border-b">
                    <span className="font-semibold text-[11px]">Selecione os PDFs Recentes:</span>
                    {selectedDocIds.length > 0 && (
                      <button
                        onClick={() => setSelectedDocIds([])}
                        className="text-[10px] text-primary hover:underline"
                      >
                        Limpar
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
                          'p-1.5 rounded cursor-pointer flex items-center justify-between text-[11px] hover:bg-accent',
                          selected && 'bg-primary/10 font-medium text-primary'
                        )}
                      >
                        <span className="truncate max-w-[200px]">{doc.filename}</span>
                        {selected && <Check className="size-3 text-primary" />}
                      </div>
                    )
                  })}
                  {recentDocs.length === 0 && (
                    <p className="text-muted-foreground text-center py-2 text-[11px]">Nenhum PDF recente</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Reference Date Picker & Active Window Banner */}
          <div className="flex items-center gap-2">
            {mode !== 'all' && (
              <>
                <span className="text-[11px] text-muted-foreground hidden sm:inline">Data Ref:</span>
                <Input
                  type="date"
                  value={refDate}
                  onChange={(e) => setRefDate(e.target.value)}
                  className="h-6 w-32 text-[11px] bg-background"
                />
              </>
            )}
            {windowInfo && (
              <Badge variant="outline" className="text-[10px] font-mono font-medium max-w-[320px] truncate">
                {isDocFiltered ? `Filtrando ${selectedDocIds.length} PDF(s) específico(s)` : windowInfo.label}
              </Badge>
            )}
          </div>
        </div>

        {/* Informative fallback banner when last24 has zero counts */}
        {mode === 'last24' && totalCountInWindow === 0 && selectedDocIds.length === 0 && (
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-md text-[11px] text-amber-800 dark:text-amber-300">
            <div className="flex items-center gap-1.5">
              <Clock className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>Nenhuma ocorrência nas últimas 24h deste turno. Se enviou PDFs com datas anteriores, você pode consultar todo o acervo.</span>
            </div>
            <Button
              size="xs"
              variant="outline"
              onClick={() => handleModeChange('all')}
              className="h-5 text-[10px] border-amber-500/30 hover:bg-amber-500/20 shrink-0 font-medium"
            >
              Ver Todo o Período
            </Button>
          </div>
        )}

        {/* Real-time 1-Click Quickbar Presets with Persistence */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 border-t border-border/40 scrollbar-none">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground shrink-0 pr-1 flex items-center gap-1">
            <Filter className="size-3 text-primary" /> Foco Rápido:
          </span>

          {presets.map((preset) => {
            const count = presetCounts[preset.id] ?? 0
            const active = activePresetId === preset.id
            return (
              <button
                key={preset.id}
                onClick={() => handlePresetToggle(preset)}
                title={active ? 'Filtro preferencial fixado (clique para desativar)' : `Ativar foco: ${preset.name}`}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all shrink-0 border cursor-pointer',
                  active
                    ? 'bg-primary text-primary-foreground border-primary font-bold shadow-xs'
                    : 'bg-background hover:bg-muted text-foreground border-border'
                )}
              >
                {getPresetIcon(preset.icon)}
                <span>{preset.name}</span>
                {active && <Star className="size-2.5 fill-amber-300 text-amber-300 shrink-0" />}
                <span
                  className={cn(
                    'text-[10px] px-1.5 py-0.2 rounded-full font-bold font-mono',
                    active ? 'bg-background/25 text-primary-foreground' : 'bg-muted text-foreground'
                  )}
                >
                  {count}
                </span>
              </button>
            )
          })}

          {activePresetId && (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                setActivePresetId(null)
                localStorage.removeItem('atc_preferred_preset_id')
                toast.info('Filtro rápido desativado')
              }}
              className="text-[11px] text-muted-foreground hover:text-red-500 h-6 shrink-0"
              title="Limpar foco rápido ativo"
            >
              <X className="size-3 mr-0.5" /> Limpar Foco
            </Button>
          )}

          <Button
            size="xs"
            variant="ghost"
            onClick={() => (window.location.href = '/config')}
            className="text-[11px] text-primary shrink-0 ml-auto"
          >
            <Plus className="size-3 mr-0.5" /> Gerenciar Filtros
          </Button>
        </div>
      </div>

      {/* Embedded Occurrences Component scoped to the Daily Window */}
      <div className="flex-1 overflow-hidden">
        <Occurrences
          initialFilters={computedFilters}
          hideFilterBar={false}
        />
      </div>
    </div>
  )
}
