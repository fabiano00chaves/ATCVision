import React, { useEffect, useMemo, useRef, useState } from 'react'
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
  SortKey,
} from '@/api/types'
import { FilterSidebar } from '@/components/filters/FilterSidebar'
import { QuickbarPresets } from '@/components/filters/QuickbarPresets'
import { OccurrenceCard } from '@/components/occurrence/OccurrenceCard'
import { OccurrenceTechnicalSheet } from '@/components/occurrence/OccurrenceTechnicalSheet'
import { PdfViewer } from '@/components/pdf/PdfViewer'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ArrowDownUp,
  ArrowLeft,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Eye,
  FileText,
  Layers,
  LayoutList,
  Loader2,
  Maximize2,
  PanelRightClose,
  PanelRightOpen,
  Tag,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { fmtNaiveDate } from '@/lib/datetime'
import { useIsMobile } from '@/hooks/useMediaQuery'

export type LayoutMode = 'list' | 'split' | 'fullscreen_pdf'

const SORT_STORAGE_KEY = 'atc_occurrences_sort_v1'
const PDF_COLLAPSED_KEY = 'atc_occurrences_pdf_collapsed_v1'

interface SortOptionMeta {
  value: SortKey
  label: string
  shortLabel: string
  group: 'chronological' | 'tree' | 'sequential' | 'priority'
}

export const SORT_OPTIONS: SortOptionMeta[] = [
  {
    value: 'abertura_desc',
    label: 'Data de Abertura ↓ (Mais recentes)',
    shortLabel: 'Abertura ↓',
    group: 'chronological',
  },
  {
    value: 'abertura_asc',
    label: 'Data de Abertura ↑ (Mais antigas)',
    shortLabel: 'Abertura ↑',
    group: 'chronological',
  },
  {
    value: 'atividade_desc',
    label: 'Última Atividade ↓ (Abertura ou Confirmação)',
    shortLabel: 'Atividade ↓',
    group: 'chronological',
  },
  {
    value: 'confirmacao_desc',
    label: 'Data de Confirmação ↓ (Mais recentes)',
    shortLabel: 'Confirmação ↓',
    group: 'chronological',
  },
  {
    value: 'confirmacao_asc',
    label: 'Data de Confirmação ↑ (Mais antigas)',
    shortLabel: 'Confirmação ↑',
    group: 'chronological',
  },
  {
    value: 'arvore_asc',
    label: 'Agrupado por Árvore de Cadastro (A → Z)',
    shortLabel: 'Árvore (A→Z)',
    group: 'tree',
  },
  {
    value: 'arvore_desc',
    label: 'Agrupado por Árvore de Cadastro (Z → A)',
    shortLabel: 'Árvore (Z→A)',
    group: 'tree',
  },
  {
    value: 'arvore_abertura_asc',
    label: 'Sequencial: Árvore → Data Crescente → Ordem',
    shortLabel: 'Árvore + Data ↑',
    group: 'sequential',
  },
  {
    value: 'data_desc_arvore',
    label: 'Sequencial: Data ↓ → Árvore → Ordem',
    shortLabel: 'Data ↓ + Árvore',
    group: 'sequential',
  },
  {
    value: 'data_asc_arvore',
    label: 'Sequencial: Data ↑ → Árvore → Ordem',
    shortLabel: 'Data ↑ + Árvore',
    group: 'sequential',
  },
  {
    value: 'pane_desc',
    label: 'Maior Duração de Pane ↓',
    shortLabel: 'Pane ↓',
    group: 'priority',
  },
  {
    value: 'relevance',
    label: 'Prioridade (Reunião / Relevantes / Análise)',
    shortLabel: 'Prioridade',
    group: 'priority',
  },
]

interface OccurrencesProps {
  initialFilters?: OccurrenceFilters
  hideFilterBar?: boolean
  headerExtra?: React.ReactNode
  onSortChange?: (sort: SortKey) => void
  onFilterLocationExternal?: (pf: string | null) => void
}

export function Occurrences({
  initialFilters,
  hideFilterBar = false,
  headerExtra,
  onSortChange,
  onFilterLocationExternal,
}: OccurrencesProps) {
  const { id: paramId } = useParams()
  const isMobile = useIsMobile()

  const [sortOrder, setSortOrder] = useState<SortKey>(() => {
    try {
      const saved = localStorage.getItem(SORT_STORAGE_KEY) as SortKey | null
      if (saved && SORT_OPTIONS.some((o) => o.value === saved)) return saved
    } catch {}
    return 'abertura_desc'
  })

  const [quickLocationPf, setQuickLocationPf] = useState<string | null>(null)

  const [filters, setFilters] = useState<OccurrenceFilters>(() => ({
    ...(initialFilters || {}),
    sort: initialFilters?.sort || sortOrder,
  }))

  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return 'list'
    }
    return 'split'
  })

  const [pdfCollapsed, setPdfCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(PDF_COLLAPSED_KEY) === 'true'
    } catch {}
    return false
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

  // Persist PDF collapsed preference
  useEffect(() => {
    try {
      localStorage.setItem(PDF_COLLAPSED_KEY, String(pdfCollapsed))
    } catch {}
  }, [pdfCollapsed])

  // Persist sort preference
  useEffect(() => {
    try {
      localStorage.setItem(SORT_STORAGE_KEY, sortOrder)
    } catch {}
  }, [sortOrder])

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
      const next: OccurrenceFilters = {
        ...prev,
        ...initialFilters,
        sort: initialFilters.sort || prev.sort || sortOrder,
      }

      if (!initialFilters.preset_id) delete next.preset_id
      if (initialFilters.start === undefined) delete next.start
      if (initialFilters.end === undefined) delete next.end
      if (!initialFilters.date_mode) delete next.date_mode
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
      if (!initialFilters.only_meeting) delete next.only_meeting

      return next
    })
  }, [initialFilters])

  const handleSortChange = (nextSort: SortKey) => {
    setSortOrder(nextSort)
    setFilters((prev) => ({ ...prev, sort: nextSort }))
    onSortChange?.(nextSort)
  }

  const handleToggleLocationFilter = (pf: string) => {
    const isSame = quickLocationPf === pf
    const nextPf = isSame ? null : pf
    setQuickLocationPf(nextPf)

    if (onFilterLocationExternal) {
      onFilterLocationExternal(nextPf)
    } else if (!hideFilterBar) {
      setFilters((prev) => ({
        ...prev,
        fl_prefixes: nextPf ? [nextPf] : undefined,
      }))
    }
    toast.info(
      nextPf
        ? `Filtrando local: ${nextPf}`
        : 'Filtro de local específico removido'
    )
  }

  // Merge quick local location filter if active
  const effectiveFilters: OccurrenceFilters = useMemo(() => {
    const merged: OccurrenceFilters = {
      ...filters,
      sort: sortOrder,
    }
    if (quickLocationPf && !onFilterLocationExternal && hideFilterBar) {
      merged.fl_prefixes = [quickLocationPf]
    }
    return merged
  }, [filters, sortOrder, quickLocationPf, onFilterLocationExternal, hideFilterBar])

  const [page, setPage] = useState<number>(1)
  const pageSize = 100
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  // Load occurrences list
  const loadOccurrences = async (targetPage = page) => {
    setLoading(true)
    try {
      const offset = (targetPage - 1) * pageSize
      const res = await occurrencesApi.list(effectiveFilters, pageSize, offset)
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
    setPage(1)
    loadOccurrences(1)
  }, [effectiveFilters])

  // Local location count fallback computed from loaded list
  const localPfCounts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const o of occurrences) {
      if (o.posicao_funcional) {
        map[o.posicao_funcional] = (map[o.posicao_funcional] || 0) + 1
      }
    }
    return map
  }, [occurrences])

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
              flag_destaque_reuniao: updatedSummary.flag_destaque_reuniao,
              status_atc: updatedSummary.status_atc,
              prioridade_atc: updatedSummary.prioridade_atc,
              jump_status: updatedSummary.jump_status,
            }
          : item
      )
    )
    if (detail && detail.id === updatedSummary.id) {
      setDetail((prev) => (prev ? { ...prev, ...updatedSummary } : null))
    }
    window.dispatchEvent(new CustomEvent('atc:occurrence-updated'))
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

  // Click-to-highlight field in PDF (auto-expands PDF panel if collapsed!)
  const handleHighlightField = (key: FieldKey) => {
    setHighlightFieldKey(key)
    const bboxes = activeMapping?.field_bboxes?.[key] || []
    setHighlightBBoxes(bboxes)
    if (layoutMode === 'list' && !isMobile) {
      setLayoutMode('split')
    }
    if (pdfCollapsed && !isMobile) {
      setPdfCollapsed(false)
    }
    if (isMobile) {
      setMobileViewTab('pdf')
    }
  }

  // Keyboard shortcuts (1, 2, 3, j, k, a, r, m)
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
      } else if (e.key === 'm' && selectedId && detail) {
        e.preventDefault()
        occurrencesApi
          .patch(selectedId, { flag_destaque_reuniao: !detail.flag_destaque_reuniao })
          .then((u) => {
            handleOccurrenceUpdated(u)
            toast.success(
              u.flag_destaque_reuniao
                ? 'Destacado para Pauta da Reunião Diária'
                : 'Removido da Pauta da Reunião Diária'
            )
          })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [occurrences, selectedId, detail, isMobile, currentIndex])

  const selectedPdfDocId = activeMapping?.pdf_document_id || detail?.primary_document_id
  const activeSortMeta = SORT_OPTIONS.find((s) => s.value === sortOrder) || SORT_OPTIONS[0]

  // Helper to compute visual group label when sorted by tree or sequential date+tree
  const getGroupLabel = (o: OccurrenceSummary): string | null => {
    if (sortOrder === 'arvore_asc' || sortOrder === 'arvore_desc' || sortOrder === 'arvore_abertura_asc') {
      return `Árvore: ${o.arvore_planta || 'SEM ÁRVORE'}`
    }
    if (sortOrder === 'data_desc_arvore' || sortOrder === 'data_asc_arvore') {
      const d = o.data_abertura ? fmtNaiveDate(o.data_abertura) : 'Sem data'
      return `${d} • ${o.arvore_planta || 'SEM ÁRVORE'}`
    }
    return null
  }

  const renderOccurrencesWithGroups = (compactCards = false) => {
    let lastGroup: string | null = null
    return occurrences.map((o) => {
      const grp = getGroupLabel(o)
      const showHeader = grp !== null && grp !== lastGroup
      if (grp !== null) lastGroup = grp

      const pfLocCount = o.posicao_funcional
        ? Math.max(o.same_location_count ?? 1, localPfCounts[o.posicao_funcional] ?? 1)
        : 1

      return (
        <React.Fragment key={o.id}>
          {showHeader && (
            <div className="sticky top-0 z-10 flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/90 backdrop-blur-xs border border-border/60 text-[10px] font-bold uppercase tracking-wider text-primary shadow-2xs">
              {sortOrder.startsWith('data_') ? (
                <Calendar className="size-3 shrink-0" />
              ) : (
                <Layers className="size-3 shrink-0" />
              )}
              <span className="truncate">{grp}</span>
            </div>
          )}
          <OccurrenceCard
            occurrence={o}
            isSelected={o.id === selectedId}
            sameLocationCount={pfLocCount}
            onClick={() => (compactCards ? setSelectedId(o.id) : handleSelectOccurrence(o.id))}
            onOccurrenceUpdated={handleOccurrenceUpdated}
            onFilterLocation={handleToggleLocationFilter}
            compact={compactCards}
          />
        </React.Fragment>
      )
    })
  }

  const layoutControls = (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* Quick Location Filter Active Pill */}
      {quickLocationPf && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 text-[10px] font-mono font-bold">
          <Tag className="size-2.5" />
          <span className="max-w-[140px] truncate">{quickLocationPf}</span>
          <button
            type="button"
            onClick={() => handleToggleLocationFilter(quickLocationPf)}
            className="hover:text-foreground cursor-pointer"
            title="Remover filtro de local"
          >
            <X className="size-2.5" />
          </button>
        </span>
      )}

      {/* Multi-Mode Sort Selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="xs"
            className="h-6 text-[11px] px-2 gap-1 font-semibold bg-background/80 cursor-pointer"
            title="Ordenar registros (Data, Árvore de Cadastro, Sequencial Combinado)"
          >
            <ArrowDownUp className="size-3 text-primary" />
            <span className="hidden md:inline">{activeSortMeta.shortLabel}</span>
            <span className="md:hidden">Ordenar</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72 text-xs z-50">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Ordenação Cronológica (Datas)
          </DropdownMenuLabel>
          {SORT_OPTIONS.filter((o) => o.group === 'chronological').map((opt) => (
            <DropdownMenuItem
              key={opt.value}
              onClick={() => handleSortChange(opt.value)}
              className="flex items-center justify-between cursor-pointer text-xs"
            >
              <span>{opt.label}</span>
              {sortOrder === opt.value && <Check className="size-3.5 text-primary shrink-0" />}
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Agrupamento por Árvore de Cadastro
          </DropdownMenuLabel>
          {SORT_OPTIONS.filter((o) => o.group === 'tree').map((opt) => (
            <DropdownMenuItem
              key={opt.value}
              onClick={() => handleSortChange(opt.value)}
              className="flex items-center justify-between cursor-pointer text-xs"
            >
              <span>{opt.label}</span>
              {sortOrder === opt.value && <Check className="size-3.5 text-primary shrink-0" />}
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Ordenação Sequencial Combinada
          </DropdownMenuLabel>
          {SORT_OPTIONS.filter((o) => o.group === 'sequential').map((opt) => (
            <DropdownMenuItem
              key={opt.value}
              onClick={() => handleSortChange(opt.value)}
              className="flex items-center justify-between cursor-pointer text-xs"
            >
              <span>{opt.label}</span>
              {sortOrder === opt.value && <Check className="size-3.5 text-primary shrink-0" />}
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Criticidade &amp; Reunião
          </DropdownMenuLabel>
          {SORT_OPTIONS.filter((o) => o.group === 'priority').map((opt) => (
            <DropdownMenuItem
              key={opt.value}
              onClick={() => handleSortChange(opt.value)}
              className="flex items-center justify-between cursor-pointer text-xs"
            >
              <span>{opt.label}</span>
              {sortOrder === opt.value && <Check className="size-3.5 text-primary shrink-0" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="h-3.5 w-px bg-border/60 hidden sm:block" />

      {/* Layout Switcher */}
      <div className="flex items-center gap-0.5">
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

        {!isMobile && layoutMode === 'split' && (
          <Button
            variant={pdfCollapsed ? 'secondary' : 'ghost'}
            size="xs"
            onClick={() => setPdfCollapsed((v) => !v)}
            title={pdfCollapsed ? 'Reexibir painel lateral do PDF' : 'Recolher painel do PDF'}
            className="h-6 text-[11px] px-1.5 gap-1"
          >
            {pdfCollapsed ? (
              <PanelRightOpen className="size-3 text-primary" />
            ) : (
              <PanelRightClose className="size-3 text-muted-foreground" />
            )}
            <span className="hidden xl:inline">{pdfCollapsed ? 'Exibir PDF' : 'Ocultar PDF'}</span>
          </Button>
        )}
      </div>
    </div>
  )

  const selectedLocCount =
    detail?.posicao_funcional
      ? Math.max(detail.same_location_count ?? 1, localPfCounts[detail.posicao_funcional] ?? 1)
      : 1

  const mainView = (
    <div className="flex-1 overflow-hidden relative">
      {/* LIST MODE (Feed view on Mobile & Desktop) */}
      {layoutMode === 'list' && (
        <div className="h-full overflow-y-auto p-2 sm:p-4 max-w-5xl mx-auto space-y-2.5">
          {renderOccurrencesWithGroups(false)}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-2.5 border rounded-md bg-card text-xs">
              <span className="text-muted-foreground text-[11px]">
                Mostrando {Math.min((page - 1) * pageSize + 1, total)} - {Math.min(page * pageSize, total)} de {total}
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  size="xs"
                  variant="outline"
                  disabled={page <= 1 || loading}
                  onClick={() => {
                    const p = page - 1
                    setPage(p)
                    loadOccurrences(p)
                  }}
                  className="h-6 px-2 text-[11px]"
                >
                  <ChevronLeft className="size-3 mr-1" /> Anterior
                </Button>
                <span className="font-mono text-muted-foreground text-[11px]">
                  {page} / {totalPages}
                </span>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={page >= totalPages || loading}
                  onClick={() => {
                    const p = page + 1
                    setPage(p)
                    loadOccurrences(p)
                  }}
                  className="h-6 px-2 text-[11px]"
                >
                  Próxima <ChevronRight className="size-3 ml-1" />
                </Button>
              </div>
            </div>
          )}
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

      {/* SPLIT MODE (Side by side on Desktop, with optional Collapsible PDF Pane) */}
      {layoutMode === 'split' && !isMobile && (
        <PanelGroup orientation="horizontal" className="h-full w-full">
          {/* Left Panel: Occurrence List & Technical Sheet */}
          <Panel defaultSize={pdfCollapsed ? 100 : 54} minSize={30} className="flex flex-col h-full border-r">
            <div className="flex-1 flex overflow-hidden">
              {/* Compact List Sidebar */}
              <div className="w-64 xl:w-72 border-r overflow-y-auto p-2 space-y-2 shrink-0 hidden lg:block bg-muted/10">
                {renderOccurrencesWithGroups(true)}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between p-1.5 border-t text-[10px] text-muted-foreground bg-muted/20 rounded">
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={page <= 1 || loading}
                      onClick={() => {
                        const p = page - 1
                        setPage(p)
                        loadOccurrences(p)
                      }}
                      className="h-5 px-1 text-[10px]"
                    >
                      <ChevronLeft className="size-3" />
                    </Button>
                    <span className="font-mono">{page} / {totalPages} ({total})</span>
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={page >= totalPages || loading}
                      onClick={() => {
                        const p = page + 1
                        setPage(p)
                        loadOccurrences(p)
                      }}
                      className="h-5 px-1 text-[10px]"
                    >
                      <ChevronRight className="size-3" />
                    </Button>
                  </div>
                )}
                {occurrences.length === 0 && !loading && (
                  <p className="text-xs text-muted-foreground text-center py-8 px-2">
                    Nenhum registro encontrado.
                  </p>
                )}
              </div>

              {/* Technical Sheet (overflow-hidden keeps top header bar locked & non-scrolling!) */}
              <div className="flex-1 overflow-hidden flex flex-col">
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
                    onFilterLocation={handleToggleLocationFilter}
                    sameLocationCount={selectedLocCount}
                    onPrevious={handlePrevious}
                    onNext={handleNext}
                    hasPrevious={hasPrevious}
                    hasNext={hasNext}
                    currentIndex={currentIndex}
                    totalCount={occurrences.length}
                    pdfCollapsed={pdfCollapsed}
                    onTogglePdfCollapse={() => setPdfCollapsed((v) => !v)}
                  />
                ) : (
                  <div className="flex-1 flex items-center justify-center text-muted-foreground p-8">
                    Selecione uma ocorrência para inspecionar
                  </div>
                )}
              </div>
            </div>
          </Panel>

          {!pdfCollapsed && (
            <>
              <PanelResizeHandle className="w-1.5 bg-border hover:bg-primary transition-colors cursor-col-resize" />

              {/* Right Panel: Interactive PDF.js Viewer */}
              <Panel defaultSize={46} minSize={28} className="h-full">
                {selectedPdfDocId ? (
                  <ErrorBoundary fallbackTitle="Falha ao renderizar o visualizador PDF">
                    <PdfViewer
                      key={selectedPdfDocId}
                      documentId={selectedPdfDocId}
                      activeMapping={activeMapping}
                      highlightFieldKey={highlightFieldKey}
                      highlightBBoxes={highlightBBoxes}
                      onCollapse={() => setPdfCollapsed(true)}
                    />
                  </ErrorBoundary>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8">
                    <FileText className="size-10 mb-2 opacity-40" />
                    <p className="text-xs font-semibold">Nenhum documento PDF vinculado</p>
                  </div>
                )}
              </Panel>
            </>
          )}

          {/* Vertical Slim Strip to Restore Collapsed PDF Immediately */}
          {pdfCollapsed && (
            <button
              type="button"
              onClick={() => setPdfCollapsed(false)}
              title="Clique para reexibir o painel lateral do PDF"
              className="w-8 h-full border-l bg-muted/30 hover:bg-primary/10 text-muted-foreground hover:text-primary flex flex-col items-center justify-center gap-3 shrink-0 transition-colors cursor-pointer select-none"
            >
              <PanelRightOpen className="size-4 text-primary" />
              <span className="[writing-mode:vertical-rl] rotate-180 text-[10px] font-bold uppercase tracking-widest">
                Exibir PDF Original
              </span>
            </button>
          )}
        </PanelGroup>
      )}

      {/* FULLSCREEN PDF MODE */}
      {layoutMode === 'fullscreen_pdf' && (
        <div className="h-full w-full relative flex">
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

          {detail && !isMobile && (
            <div className="w-96 border-l bg-background shadow-2xl h-full flex flex-col z-20 overflow-hidden">
              <div className="p-2 border-b bg-card flex items-center justify-between shrink-0">
                <span className="font-bold text-xs truncate max-w-[200px]">{detail.titulo}</span>
                <Button size="xs" variant="ghost" onClick={() => setLayoutMode('split')}>
                  Modo Dividido
                </Button>
              </div>
              <div className="flex-1 overflow-hidden flex flex-col">
                <OccurrenceTechnicalSheet
                  occurrence={detail}
                  activeMapping={activeMapping}
                  onMappingChange={setActiveMapping}
                  onHighlightField={handleHighlightField}
                  onOccurrenceUpdated={handleOccurrenceUpdated}
                  onFilterLocation={handleToggleLocationFilter}
                  sameLocationCount={selectedLocCount}
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
        <div className="min-h-8 border-b bg-card/60 px-3 py-1 flex flex-wrap items-center justify-between gap-2 shrink-0 text-xs">
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

            <div className="flex items-center bg-muted p-0.5 rounded-lg">
              <button
                type="button"
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
                type="button"
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

          <div
            className="flex-1 overflow-hidden relative"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {mobileViewTab === 'sheet' ? (
              <div className="h-full overflow-hidden flex flex-col">
                <OccurrenceTechnicalSheet
                  occurrence={detail}
                  activeMapping={activeMapping}
                  onMappingChange={setActiveMapping}
                  onHighlightField={handleHighlightField}
                  onOccurrenceUpdated={handleOccurrenceUpdated}
                  onFilterLocation={handleToggleLocationFilter}
                  sameLocationCount={selectedLocCount}
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
