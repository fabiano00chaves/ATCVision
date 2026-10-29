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
import { FilterSidebar } from '@/components/filters/FilterSidebar'
import { QuickbarPresets } from '@/components/filters/QuickbarPresets'
import { OccurrenceCard } from '@/components/occurrence/OccurrenceCard'
import { OccurrenceTechnicalSheet } from '@/components/occurrence/OccurrenceTechnicalSheet'
import { PdfViewer } from '@/components/pdf/PdfViewer'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Eye,
  FileText,
  Filter,
  LayoutList,
  Loader2,
  Maximize2,
  OctagonAlert,
  Search,
  SlidersHorizontal,
  Star,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/useMediaQuery'

export type LayoutMode = 'list' | 'split' | 'fullscreen_pdf'

interface OccurrencesProps {
  initialFilters?: OccurrenceFilters
  hideFilterBar?: boolean
  headerExtra?: React.ReactNode
}

export function Occurrences({ initialFilters, hideFilterBar = false, headerExtra }: OccurrencesProps) {
  const { id: paramId } = useParams()
  const isMobile = useIsMobile()

  const [filters, setFilters] = useState<OccurrenceFilters>(initialFilters || {})
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return 'list'
    }
    return 'split'
  })

  const [occurrences, setOccurrences] = useState<OccurrenceSummary[]>([])
  const [total, setTotal] = useState<number>(0)
  const [loading, setLoading] = useState<boolean>(true)
  const [selectedId, setSelectedId] = useState<string | null>(paramId || null)
  const [detail, setDetail] = useState<OccurrenceDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState<boolean>(false)

  // Mobile dedicated modal/view state
  const [mobileDetailOpen, setMobileDetailOpen] = useState<boolean>(false)
  const [mobileViewTab, setMobileViewTab] = useState<'sheet' | 'pdf'>('sheet')

  const [activeMapping, setActiveMapping] = useState<Mapping | null>(null)
  const [highlightFieldKey, setHighlightFieldKey] = useState<FieldKey | null>(null)
  const [highlightBBoxes, setHighlightBBoxes] = useState<BBox[]>([])

  // Responsive mode adjuster
  useEffect(() => {
    if (isMobile && layoutMode === 'split') {
      setLayoutMode('list')
    }
  }, [isMobile])

  // Synchronize changes to initialFilters from parent
  useEffect(() => {
    if (!initialFilters) return
    setFilters((prev) => {
      const next: OccurrenceFilters = { ...prev, ...initialFilters }

      if (!initialFilters.preset_id) delete next.preset_id
      if (initialFilters.start === undefined) delete next.start
      if (initialFilters.end === undefined) delete next.end
      if (!initialFilters.document_ids) delete next.document_ids
      if (!initialFilters.fl_prefixes) delete next.fl_prefixes
      if (!initialFilters.arvores) delete next.arvores
      if (!initialFilters.specialties) delete next.specialties
      if (!initialFilters.turnos) delete next.turnos
      if (!initialFilters.planning_groups) delete next.planning_groups
      if (!initialFilters.only_pane) delete next.only_pane
      if (!initialFilters.only_jump) delete next.only_jump
      if (!initialFilters.only_relevant) delete next.only_relevant
      if (!initialFilters.only_analyze) delete next.only_analyze

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
            const recBBoxes = data.mappings[0].field_bboxes?.['record'] || []
            setHighlightBBoxes(recBBoxes)
            setHighlightFieldKey(null)
          } else {
            setActiveMapping(null)
            setHighlightBBoxes([])
            setHighlightFieldKey(null)
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

  // Handle card click
  const handleSelectOccurrence = (id: string) => {
    setSelectedId(id)
    if (isMobile) {
      setMobileViewTab('sheet')
      setMobileDetailOpen(true)
      // Push history entry so mobile hardware/gesture back button closes the modal
      if (window.history.state?.occurrenceModal !== id) {
        window.history.pushState({ occurrenceModal: id }, '')
      }
    } else if (layoutMode === 'list') {
      setLayoutMode('split')
    }
  }

  const handleCloseMobileModal = () => {
    setMobileDetailOpen(false)
    if (window.history.state?.occurrenceModal) {
      window.history.back()
    }
  }

  // Handle hardware / gesture back button
  useEffect(() => {
    const handlePopState = () => {
      if (mobileDetailOpen) {
        setMobileDetailOpen(false)
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [mobileDetailOpen])

  // Touch gesture swipe left/right for next/previous occurrence
  const touchStartXRef = useRef<number | null>(null)
  const touchStartYRef = useRef<number | null>(null)

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX
    touchStartYRef.current = e.touches[0].clientY
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current
    const deltaY = e.changedTouches[0].clientY - touchStartYRef.current

    if (Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      if (deltaX < 0 && hasNext) {
        handleNext()
      } else if (deltaX > 0 && hasPrevious) {
        handlePrevious()
      }
    }
    touchStartXRef.current = null
    touchStartYRef.current = null
  }

  // Update item in local list when edited in card or sheet
  const handleOccurrenceUpdated = (updatedSummary: OccurrenceSummary | OccurrenceDetail) => {
    setOccurrences((prev) =>
      prev.map((item) =>
        item.id === updatedSummary.id
          ? {
              ...item,
              flag_analisar: updatedSummary.flag_analisar,
              flag_relevante: updatedSummary.flag_relevante,
              status_atc: updatedSummary.status_atc,
              jump_status: updatedSummary.jump_status,
            }
          : item
      )
    )
    if (detail && detail.id === updatedSummary.id) {
      setDetail((prev) => (prev ? { ...prev, ...updatedSummary } : null))
    }
  }

  // Prev / Next index helpers
  const currentIndex = occurrences.findIndex((x) => x.id === selectedId)
  const hasPrevious = currentIndex > 0
  const hasNext = currentIndex >= 0 && currentIndex < occurrences.length - 1

  const handlePrevious = () => {
    if (hasPrevious) {
      setSelectedId(occurrences[currentIndex - 1].id)
    }
  }

  const handleNext = () => {
    if (hasNext) {
      setSelectedId(occurrences[currentIndex + 1].id)
    }
  }

  // Click-to-highlight field in PDF
  const handleHighlightField = (key: FieldKey) => {
    setHighlightFieldKey(key)
    const bboxes = activeMapping?.field_bboxes?.[key] || []
    setHighlightBBoxes(bboxes)
    if (layoutMode === 'list' && !isMobile) {
      setLayoutMode('split')
    }
    if (isMobile) {
      setMobileViewTab('pdf')
    }
  }

  // Keyboard shortcuts (1, 2, 3, j, k, a, r)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      if (['input', 'textarea', 'select'].includes(tag)) return

      if (e.key === '1') {
        setLayoutMode('list')
      } else if (e.key === '2' && !isMobile) {
        setLayoutMode('split')
      } else if (e.key === '3') {
        setLayoutMode('fullscreen_pdf')
      } else if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault()
        handleNext()
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault()
        handlePrevious()
      } else if (e.key === 'a' && selectedId && detail) {
        e.preventDefault()
        occurrencesApi.patch(selectedId, { flag_analisar: !detail.flag_analisar }).then((u) => {
          handleOccurrenceUpdated(u)
          toast.success(u.flag_analisar ? 'Marcado p/ Analisar' : 'Desmarcado')
        })
      } else if (e.key === 'r' && selectedId && detail) {
        e.preventDefault()
        occurrencesApi.patch(selectedId, { flag_relevante: !detail.flag_relevante }).then((u) => {
          handleOccurrenceUpdated(u)
          toast.success(u.flag_relevante ? 'Marcado como Relevante' : 'Desmarcado')
        })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [occurrences, selectedId, detail, isMobile, currentIndex])

  const selectedPdfDocId = activeMapping?.pdf_document_id || detail?.primary_document_id

  const layoutControls = (
    <div className="flex items-center gap-1">
      <Button
        variant={layoutMode === 'list' ? 'default' : 'ghost'}
        size="xs"
        onClick={() => setLayoutMode('list')}
        title="Modo Lista Completa (Atalho: 1)"
        className="h-6 text-xs px-2"
      >
        <LayoutList className="size-3" />
        <span className="hidden sm:inline">Lista</span>
      </Button>

      {!isMobile && (
        <Button
          variant={layoutMode === 'split' ? 'default' : 'ghost'}
          size="xs"
          onClick={() => setLayoutMode('split')}
          title="Modo Lado a Lado (Atalho: 2)"
          className="h-6 text-xs px-2"
        >
          <Columns2 className="size-3" />
          <span className="hidden sm:inline">Lado a Lado</span>
        </Button>
      )}

      <Button
        variant={layoutMode === 'fullscreen_pdf' ? 'default' : 'ghost'}
        size="xs"
        onClick={() => setLayoutMode('fullscreen_pdf')}
        title="Modo PDF Tela Cheia (Atalho: 3)"
        className="h-6 text-xs px-2"
      >
        <Maximize2 className="size-3" />
        <span className="hidden sm:inline">PDF</span>
      </Button>
    </div>
  )

  const mainView = (
    <div className="flex-1 overflow-hidden relative">
      {/* LIST MODE (Feed view on Mobile & Desktop) */}
      {layoutMode === 'list' && (
        <div className="h-full overflow-y-auto p-2 sm:p-4 max-w-5xl mx-auto space-y-2.5">
          {occurrences.map((o) => (
            <OccurrenceCard
              key={o.id}
              occurrence={o}
              isSelected={o.id === selectedId}
              onClick={() => handleSelectOccurrence(o.id)}
              onOccurrenceUpdated={handleOccurrenceUpdated}
            />
          ))}
          {occurrences.length === 0 && !loading && (
            <div className="p-12 text-center text-muted-foreground">
              <p className="font-semibold text-sm text-foreground">
                Nenhuma ocorrência encontrada com os filtros ativos.
              </p>
              <p className="text-xs mt-1 text-muted-foreground">
                Tente ampliar a janela de datas ou limpar os filtros de texto e especialidade.
              </p>
            </div>
          )}
        </div>
      )}

      {/* SPLIT MODE (Side by side on Desktop) */}
      {layoutMode === 'split' && !isMobile && (
        <PanelGroup orientation="horizontal" className="h-full w-full">
          {/* Left Panel: Occurrence List & Technical Sheet */}
          <Panel defaultSize={52} minSize={30} className="flex flex-col h-full border-r">
            <div className="flex-1 flex overflow-hidden">
              {/* Compact List Sidebar */}
              <div className="w-64 border-r overflow-y-auto p-2 space-y-2 shrink-0 hidden lg:block bg-muted/10">
                {occurrences.map((o) => (
                  <OccurrenceCard
                    key={o.id}
                    occurrence={o}
                    isSelected={o.id === selectedId}
                    onClick={() => setSelectedId(o.id)}
                    onOccurrenceUpdated={handleOccurrenceUpdated}
                  />
                ))}
              </div>

              {/* Technical Sheet */}
              <div className="flex-1 overflow-y-auto flex flex-col">
                {detailLoading ? (
                  <div className="flex-1 flex items-center justify-center text-muted-foreground p-8">
                    <Loader2 className="size-6 animate-spin mr-2 text-primary" />
                    <span>Carregando dados estruturados...</span>
                  </div>
                ) : detail ? (
                  <OccurrenceTechnicalSheet
                    occurrence={detail}
                    activeMapping={activeMapping}
                    onMappingChange={setActiveMapping}
                    onHighlightField={handleHighlightField}
                    onOccurrenceUpdated={handleOccurrenceUpdated}
                    onPrevious={handlePrevious}
                    onNext={handleNext}
                    hasPrevious={hasPrevious}
                    hasNext={hasNext}
                    currentIndex={currentIndex}
                    totalCount={occurrences.length}
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
          <Panel defaultSize={48} minSize={30} className="h-full">
            {selectedPdfDocId ? (
              <ErrorBoundary fallbackTitle="Falha ao renderizar o visualizador PDF">
                <PdfViewer
                  key={selectedPdfDocId}
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

      {/* FULLSCREEN PDF MODE */}
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

          {/* Floating Drawer on Right (Desktop) */}
          {detail && !isMobile && (
            <div className="w-96 border-l bg-background shadow-2xl h-full flex flex-col z-20 overflow-hidden">
              <div className="p-2 border-b bg-card flex items-center justify-between">
                <span className="font-bold text-xs truncate max-w-[200px]">{detail.titulo}</span>
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
                  onOccurrenceUpdated={handleOccurrenceUpdated}
                  onPrevious={handlePrevious}
                  onNext={handleNext}
                  hasPrevious={hasPrevious}
                  hasNext={hasNext}
                  currentIndex={currentIndex}
                  totalCount={occurrences.length}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )

  if (hideFilterBar) {
    return (
      <div className="flex flex-col h-full w-full overflow-hidden bg-background">
        {headerExtra}
        <div className="h-8 border-b bg-card/60 px-3 flex items-center justify-between shrink-0 text-xs">
          <span className="font-semibold text-foreground">
            {loading ? (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Loader2 className="size-3 animate-spin text-primary" /> Carregando...
              </span>
            ) : (
              <span>
                <b className="text-primary font-mono">{total}</b> ocorrência(s) encontrada(s)
              </span>
            )}
          </span>
          {layoutControls}
        </div>
        {mainView}
      </div>
    )
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      {/* Left Filter Sidebar */}
      <FilterSidebar
        filters={filters}
        onChange={setFilters}
        onPresetSaved={loadOccurrences}
      />

      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        {headerExtra}
        <QuickbarPresets
          filters={filters}
          onChange={setFilters}
          totalCount={total}
          rightExtra={layoutControls}
        />
        {mainView}
      </div>

      {/* MOBILE FULL-SCREEN OCCURRENCE VIEW / MODAL */}
      {isMobile && mobileDetailOpen && detail && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col animate-in fade-in duration-150">
          {/* Mobile Top App Bar */}
          <header className="h-12 border-b bg-card px-3 flex items-center justify-between shrink-0 shadow-xs">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCloseMobileModal}
              className="h-8 gap-1.5 pl-1 text-primary font-bold active:opacity-70"
            >
              <ArrowLeft className="size-4" />
              <span>Ocorrências</span>
            </Button>

            {/* Mobile Tab Switcher: Ficha Técnica vs PDF */}
            <div className="flex items-center bg-muted p-0.5 rounded-lg">
              <button
                onClick={() => setMobileViewTab('sheet')}
                className={cn(
                  'px-2.5 py-1 text-xs font-semibold rounded-md transition-all',
                  mobileViewTab === 'sheet'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground'
                )}
              >
                Ficha Técnica
              </button>
              <button
                onClick={() => setMobileViewTab('pdf')}
                className={cn(
                  'px-2.5 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1',
                  mobileViewTab === 'pdf'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground'
                )}
              >
                <Eye className="size-3" />
                <span>PDF</span>
              </button>
            </div>

            {/* Prev / Next occurrence buttons on Mobile with Counter */}
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                disabled={!hasPrevious}
                onClick={handlePrevious}
                className="size-8"
                title="Anterior"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="font-mono text-[10px] text-muted-foreground px-1 select-none">
                {currentIndex >= 0 ? `${currentIndex + 1}/${occurrences.length}` : ''}
              </span>
              <Button
                variant="outline"
                size="icon"
                disabled={!hasNext}
                onClick={handleNext}
                className="size-8"
                title="Próxima"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </header>

          {/* Mobile Tab Content with Swipe Gesture Support */}
          <div
            className="flex-1 overflow-hidden relative"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {mobileViewTab === 'sheet' ? (
              <div className="h-full overflow-y-auto">
                <OccurrenceTechnicalSheet
                  occurrence={detail}
                  activeMapping={activeMapping}
                  onMappingChange={setActiveMapping}
                  onHighlightField={handleHighlightField}
                  onOccurrenceUpdated={handleOccurrenceUpdated}
                  onPrevious={handlePrevious}
                  onNext={handleNext}
                  hasPrevious={hasPrevious}
                  hasNext={hasNext}
                  currentIndex={currentIndex}
                  totalCount={occurrences.length}
                  isMobileModal={true}
                  onCloseMobile={handleCloseMobileModal}
                  onViewPdfMobile={() => setMobileViewTab('pdf')}
                />
              </div>
            ) : (
              <div className="h-full w-full">
                {selectedPdfDocId ? (
                  <ErrorBoundary fallbackTitle="Falha ao renderizar PDF no dispositivo móvel">
                    <PdfViewer
                      documentId={selectedPdfDocId}
                      activeMapping={activeMapping}
                      highlightFieldKey={highlightFieldKey}
                      highlightBBoxes={highlightBBoxes}
                    />
                  </ErrorBoundary>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
                    <FileText className="size-10 mb-2 opacity-50" />
                    <p className="font-semibold text-xs">Nenhum PDF associado a esta ocorrência.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
