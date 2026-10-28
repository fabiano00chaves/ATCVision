import React, { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from 'react-resizable-panels'
import { occurrencesApi } from '@/api'
import type {
  BBox,
  FieldKey,
  Mapping,
  OccurrenceDetail,
  OccurrenceFilters,
  OccurrenceSummary,
} from '@/api/types'
import { FilterBar } from '@/components/filters/FilterBar'
import { OccurrenceCard } from '@/components/occurrence/OccurrenceCard'
import { OccurrenceTechnicalSheet } from '@/components/occurrence/OccurrenceTechnicalSheet'
import { PdfViewer } from '@/components/pdf/PdfViewer'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Columns2,
  FileText,
  LayoutList,
  Loader2,
  Maximize2,
  SlidersHorizontal,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export type LayoutMode = 'list' | 'split' | 'fullscreen_pdf'

interface OccurrencesProps {
  initialFilters?: OccurrenceFilters
  hideFilterBar?: boolean
  headerExtra?: React.ReactNode
}

export function Occurrences({ initialFilters, hideFilterBar = false, headerExtra }: OccurrencesProps) {
  const { id: paramId } = useParams()
  const [filters, setFilters] = useState<OccurrenceFilters>(initialFilters || {})
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('split')

  const [occurrences, setOccurrences] = useState<OccurrenceSummary[]>([])
  const [total, setTotal] = useState<number>(0)
  const [loading, setLoading] = useState<boolean>(true)
  const [selectedId, setSelectedId] = useState<string | null>(paramId || null)
  const [detail, setDetail] = useState<OccurrenceDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState<boolean>(false)

  const [activeMapping, setActiveMapping] = useState<Mapping | null>(null)
  const [highlightFieldKey, setHighlightFieldKey] = useState<FieldKey | null>(null)
  const [highlightBBoxes, setHighlightBBoxes] = useState<BBox[]>([])

  // Synchronize changes to initialFilters from parent (e.g. DailyReport Quickbar presets or document picker)
  useEffect(() => {
    if (!initialFilters) return
    setFilters((prev) => {
      const next: OccurrenceFilters = { ...prev }

      if (initialFilters.preset_id) {
        next.preset_id = initialFilters.preset_id
      } else {
        delete next.preset_id
      }

      if (initialFilters.start !== undefined) next.start = initialFilters.start
      else delete next.start

      if (initialFilters.end !== undefined) next.end = initialFilters.end
      else delete next.end

      if (initialFilters.document_ids !== undefined) next.document_ids = initialFilters.document_ids
      else delete next.document_ids

      return next
    })
  }, [initialFilters])

  // Load occurrences list
  const loadOccurrences = async () => {
    setLoading(true)
    try {
      const res = await occurrencesApi.list(filters, 100, 0)
      setOccurrences(res.items)
      setTotal(res.total)
      if (!selectedId && res.items.length > 0) {
        setSelectedId(res.items[0].id)
      } else if (res.items.length > 0 && !res.items.some((x) => x.id === selectedId)) {
        setSelectedId(res.items[0].id)
      } else if (res.items.length === 0) {
        setSelectedId(null)
      }
    } catch {
      toast.error('Erro ao carregar ocorrências')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadOccurrences()
  }, [filters])

  // Load selected occurrence detail
  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      setActiveMapping(null)
      return
    }
    let isCancelled = false
    setDetailLoading(true)
    occurrencesApi
      .get(selectedId)
      .then((data) => {
        if (!isCancelled) {
          setDetail(data)
          if (data.mappings && data.mappings.length > 0) {
            setActiveMapping(data.mappings[0])
            // Default highlight on record box
            const recBBoxes = data.mappings[0].field_bboxes?.['record'] || []
            setHighlightBBoxes(recBBoxes)
          } else {
            setActiveMapping(null)
            setHighlightBBoxes([])
          }
        }
      })
      .catch(() => {
        if (!isCancelled) toast.error('Erro ao carregar detalhes da ocorrência')
      })
      .finally(() => {
        if (!isCancelled) setDetailLoading(false)
      })

    return () => {
      isCancelled = true
    }
  }, [selectedId])

  // Click-to-highlight field in PDF
  const handleHighlightField = (key: FieldKey) => {
    setHighlightFieldKey(key)
    if (activeMapping && activeMapping.field_bboxes?.[key]) {
      setHighlightBBoxes(activeMapping.field_bboxes[key] || [])
    }
  }

  // Keyboard shortcuts (1, 2, 3, j, k, a, r, /)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input, textarea, or select
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      if (['input', 'textarea', 'select'].includes(tag)) return

      if (e.key === '1') {
        setLayoutMode('list')
      } else if (e.key === '2') {
        setLayoutMode('split')
      } else if (e.key === '3') {
        setLayoutMode('fullscreen_pdf')
      } else if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault()
        if (occurrences.length > 0) {
          const idx = occurrences.findIndex((x) => x.id === selectedId)
          if (idx < occurrences.length - 1) setSelectedId(occurrences[idx + 1].id)
        }
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault()
        if (occurrences.length > 0) {
          const idx = occurrences.findIndex((x) => x.id === selectedId)
          if (idx > 0) setSelectedId(occurrences[idx - 1].id)
        }
      } else if (e.key === 'a' && selectedId && detail) {
        e.preventDefault()
        occurrencesApi.patch(selectedId, { flag_analisar: !detail.flag_analisar }).then((u) => {
          setDetail(u)
          toast.success(u.flag_analisar ? 'Marcado p/ Analisar' : 'Desmarcado')
        })
      } else if (e.key === 'r' && selectedId && detail) {
        e.preventDefault()
        occurrencesApi.patch(selectedId, { flag_relevante: !detail.flag_relevante }).then((u) => {
          setDetail(u)
          toast.success(u.flag_relevante ? 'Marcado como Relevante' : 'Desmarcado')
        })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [occurrences, selectedId, detail])

  const selectedPdfDocId = activeMapping?.pdf_document_id || detail?.primary_document_id

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-background">
      {/* Top Header / Extra & Filter Bar */}
      {headerExtra}
      {!hideFilterBar && (
        <FilterBar
          filters={filters}
          onChange={setFilters}
          onSavePresetSuccess={loadOccurrences}
        />
      )}

      {/* Layout Toolbar */}
      <div className="h-8 border-b bg-muted/40 px-3 flex items-center justify-between shrink-0 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-muted-foreground">
            {loading ? 'Carregando...' : `${total} ocorrência(s) encontrada(s)`}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant={layoutMode === 'list' ? 'default' : 'ghost'}
            size="xs"
            onClick={() => setLayoutMode('list')}
            title="Modo Lista / Cards (Atalho: 1)"
          >
            <LayoutList className="size-3" />
            <span className="hidden sm:inline">Lista</span>
          </Button>

          <Button
            variant={layoutMode === 'split' ? 'default' : 'ghost'}
            size="xs"
            onClick={() => setLayoutMode('split')}
            title="Modo Lado a Lado (Atalho: 2)"
          >
            <Columns2 className="size-3" />
            <span className="hidden sm:inline">Lado a Lado</span>
          </Button>

          <Button
            variant={layoutMode === 'fullscreen_pdf' ? 'default' : 'ghost'}
            size="xs"
            onClick={() => setLayoutMode('fullscreen_pdf')}
            title="Modo PDF Tela Cheia (Atalho: 3)"
          >
            <Maximize2 className="size-3" />
            <span className="hidden sm:inline">PDF Tela Cheia</span>
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden relative">
        {layoutMode === 'list' && (
          <div className="h-full overflow-y-auto p-4 max-w-5xl mx-auto space-y-2">
            {occurrences.map((o) => (
              <OccurrenceCard
                key={o.id}
                occurrence={o}
                isSelected={o.id === selectedId}
                onClick={() => {
                  setSelectedId(o.id)
                  setLayoutMode('split')
                }}
              />
            ))}
            {occurrences.length === 0 && !loading && (
              <div className="p-12 text-center text-muted-foreground">
                <p className="font-semibold text-sm">Nenhuma ocorrência encontrada com estes filtros.</p>
                <p className="text-xs mt-1">Tente ajustar o intervalo de datas ou remover filtros restritivos.</p>
              </div>
            )}
          </div>
        )}

        {layoutMode === 'split' && (
          <PanelGroup orientation="horizontal" className="h-full w-full">
            {/* Left Panel: Occurrence List & Technical Sheet */}
            <Panel defaultSize={50} minSize={30} className="flex flex-col h-full border-r">
              <div className="flex-1 flex overflow-hidden">
                {/* Compact List Sidebar */}
                <div className="w-64 border-r overflow-y-auto p-2 space-y-1.5 shrink-0 hidden lg:block bg-muted/10">
                  {occurrences.map((o) => (
                    <OccurrenceCard
                      key={o.id}
                      occurrence={o}
                      isSelected={o.id === selectedId}
                      onClick={() => setSelectedId(o.id)}
                    />
                  ))}
                </div>

                {/* Technical Sheet */}
                <div className="flex-1 overflow-y-auto flex flex-col">
                  {detailLoading ? (
                    <div className="flex-1 flex items-center justify-center text-muted-foreground p-8">
                      <Loader2 className="size-6 animate-spin mr-2" />
                      <span>Carregando dados estruturados...</span>
                    </div>
                  ) : detail ? (
                    <OccurrenceTechnicalSheet
                      occurrence={detail}
                      activeMapping={activeMapping}
                      onMappingChange={setActiveMapping}
                      onHighlightField={handleHighlightField}
                      onOccurrenceUpdated={setDetail}
                    />
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-muted-foreground p-8">
                      Selecione uma ocorrência para inspecionar
                    </div>
                  )}
                </div>
              </div>
            </Panel>

            <PanelResizeHandle className="w-1.5 bg-border hover:bg-primary transition-colors cursor-col-resize" />

            {/* Right Panel: Interactive PDF.js Viewer */}
            <Panel defaultSize={50} minSize={30} className="h-full">
              {selectedPdfDocId ? (
                <ErrorBoundary fallbackTitle="Falha ao renderizar o visualizador PDF">
                  <PdfViewer
                    documentId={selectedPdfDocId}
                    activeMapping={activeMapping}
                    highlightFieldKey={highlightFieldKey}
                    highlightBBoxes={highlightBBoxes}
                  />
                </ErrorBoundary>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8">
                  <FileText className="size-10 mb-2 opacity-40" />
                  <p className="text-xs font-semibold">Nenhum documento PDF vinculado</p>
                </div>
              )}
            </Panel>
          </PanelGroup>
        )}

        {layoutMode === 'fullscreen_pdf' && (
          <div className="h-full w-full relative flex">
            {/* 100% PDF */}
            <div className="flex-1 h-full">
              {selectedPdfDocId ? (
                <ErrorBoundary fallbackTitle="Falha ao renderizar o visualizador PDF">
                  <PdfViewer
                    documentId={selectedPdfDocId}
                    activeMapping={activeMapping}
                    highlightFieldKey={highlightFieldKey}
                    highlightBBoxes={highlightBBoxes}
                  />
                </ErrorBoundary>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  Nenhum PDF selecionado
                </div>
              )}
            </div>

            {/* Floating Drawer on Right */}
            {detail && (
              <div className="w-96 border-l bg-background shadow-2xl h-full flex flex-col z-20 overflow-hidden">
                <div className="p-2 border-b bg-card flex items-center justify-between">
                  <span className="font-bold text-xs truncate">{detail.titulo}</span>
                  <Button size="xs" variant="ghost" onClick={() => setLayoutMode('split')}>
                    Modo Dividido
                  </Button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <OccurrenceTechnicalSheet
                    occurrence={detail}
                    activeMapping={activeMapping}
                    onMappingChange={setActiveMapping}
                    onHighlightField={handleHighlightField}
                    onOccurrenceUpdated={setDetail}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
