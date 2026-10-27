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
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export function DailyReport() {
  const [mode, setMode] = useState<DailyMode>('last24')
  const [accumDays, setAccumDays] = useState<number>(3)
  const [refDate, setRefDate] = useState<string>('')
  const [windowInfo, setWindowInfo] = useState<DailyWindow | null>(null)

  const [presets, setPresets] = useState<Preset[]>([])
  const [presetCounts, setPresetCounts] = useState<Record<string, number>>({})
  const [activePresetId, setActivePresetId] = useState<string | null>(null)

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
      setPresets(pList.filter((p) => p.show_in_quickbar))
      setRecentDocs(docs.items)
    } catch {
      // Ignored
    }
  }

  useEffect(() => {
    loadPresetsAndDocs()
  }, [])

  // 3. Fetch real-time counts for the active window
  useEffect(() => {
    if (!windowInfo) return
    const baseFilters: OccurrenceFilters = {
      start: windowInfo.start,
      end: windowInfo.end,
      document_ids: selectedDocIds.length > 0 ? selectedDocIds : undefined,
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
  }, [windowInfo, selectedDocIds])

  // Build filters for the Occurrences component
  const computedFilters: OccurrenceFilters = {
    start: windowInfo?.start,
    end: windowInfo?.end,
    document_ids: selectedDocIds.length > 0 ? selectedDocIds : undefined,
    preset_id: activePresetId || undefined,
  }

  const toggleDocSelection = (id: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

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
              onClick={() => {
                setMode('last24')
                setSelectedDocIds([])
              }}
            >
              Último Turno (24h / D-1)
            </Button>

            <Button
              size="xs"
              variant={mode === 'weekend' && selectedDocIds.length === 0 ? 'default' : 'outline'}
              onClick={() => {
                setMode('weekend')
                setSelectedDocIds([])
              }}
            >
              Pós-Final de Semana (Sex → Seg)
            </Button>

            <Button
              size="xs"
              variant={mode === 'days' && selectedDocIds.length === 0 ? 'default' : 'outline'}
              onClick={() => {
                setMode('days')
                setSelectedDocIds([])
              }}
            >
              Pós-Feriado / Acumulado ({accumDays}d)
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
            <span className="text-[11px] text-muted-foreground hidden sm:inline">Data Ref:</span>
            <Input
              type="date"
              value={refDate}
              onChange={(e) => setRefDate(e.target.value)}
              className="h-6 w-32 text-[11px] bg-background"
            />
            {windowInfo && (
              <Badge variant="outline" className="text-[10px] font-mono font-medium">
                {windowInfo.label}
              </Badge>
            )}
          </div>
        </div>

        {/* Real-time 1-Click Quickbar Presets */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 border-t border-border/40 scrollbar-none">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground shrink-0 pr-1">
            Foco Rápido:
          </span>

          {presets.map((preset) => {
            const count = presetCounts[preset.id] ?? 0
            const active = activePresetId === preset.id
            return (
              <button
                key={preset.id}
                onClick={() => setActivePresetId(active ? null : preset.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all shrink-0 border',
                  active
                    ? 'bg-primary text-primary-foreground border-primary font-bold shadow-xs'
                    : 'bg-background hover:bg-muted text-foreground border-border'
                )}
              >
                <span>{preset.name}</span>
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

          <Button
            size="xs"
            variant="ghost"
            onClick={() => (window.location.href = '/config')}
            className="text-[11px] text-primary shrink-0"
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
