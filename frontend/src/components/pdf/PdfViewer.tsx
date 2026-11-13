import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import type { BBox, FieldKey, Mapping } from '@/api/types'
import { Button } from '@/components/ui/button'
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  FileText,
  Loader2,
  Maximize2,
  PanelRightClose,
  RefreshCw,
  RotateCw,
  Scaling,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs'

// In-memory fake worker registration
if (typeof window !== 'undefined') {
  ;(window as any).pdfjsWorker = pdfjsWorker
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
  }
}

interface PdfViewerProps {
  documentId: string
  activeMapping?: Mapping | null
  highlightFieldKey?: FieldKey | null
  highlightBBoxes?: BBox[]
  onPageChange?: (page: number) => void
  onCollapse?: () => void
}

function transformBBox(
  bb: BBox,
  rotation: number,
  origW: number,
  origH: number,
  scale: number
): { left: number; top: number; width: number; height: number } {
  const normRot = ((rotation % 360) + 360) % 360
  const x0 = bb.x0 || 0
  const y0 = bb.y0 || 0
  const x1 = bb.x1 || 0
  const y1 = bb.y1 || 0

  let left = 0
  let top = 0
  let width = 0
  let height = 0

  if (normRot === 90) {
    left = (origH - y1) * scale
    top = x0 * scale
    width = (y1 - y0) * scale
    height = (x1 - x0) * scale
  } else if (normRot === 180) {
    left = (origW - x1) * scale
    top = (origH - y1) * scale
    width = (x1 - x0) * scale
    height = (y1 - y0) * scale
  } else if (normRot === 270) {
    left = y0 * scale
    top = (origW - x1) * scale
    width = (y1 - y0) * scale
    height = (x1 - x0) * scale
  } else {
    // 0 deg
    left = x0 * scale
    top = y0 * scale
    width = (x1 - x0) * scale
    height = (y1 - y0) * scale
  }

  return {
    left: Math.max(0, left),
    top: Math.max(0, top),
    width: Math.max(0, width),
    height: Math.max(0, height),
  }
}

export function PdfViewer({
  documentId,
  activeMapping,
  highlightFieldKey,
  highlightBBoxes,
  onPageChange,
  onCollapse,
}: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [scale, setScale] = useState<number>(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return 0.58
    }
    return 1.05
  })
  const [rotation, setRotation] = useState<number>(0)
  const [loading, setLoading] = useState<boolean>(true)
  const [fetchingBinary, setFetchingBinary] = useState<boolean>(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [docLoadError, setDocLoadError] = useState<string | null>(null)
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null)
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState<number>(0)
  const [viewMode, setViewMode] = useState<'canvas' | 'native'>('canvas')

  const containerRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({})

  // 1. Fetch PDF Binary directly with native fetch and credentials
  useEffect(() => {
    let active = true
    let currentBlobUrl: string | null = null
    setFetchingBinary(true)
    setFetchError(null)
    setDocLoadError(null)
    setLoading(true)
    setNumPages(0)
    pageRefs.current = {}

    // Revoke previous blob URL to prevent memory leaks
    if (pdfBlobUrl) {
      try {
        URL.revokeObjectURL(pdfBlobUrl)
      } catch {}
    }

    const pdfFileUrl = `/api/v1/documents/${documentId}/file?v=${reloadKey}`

    fetch(pdfFileUrl, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          let detail = `Erro HTTP ${res.status}`
          try {
            const errJson = await res.json()
            if (errJson && errJson.detail) {
              detail = errJson.detail
            }
          } catch {}
          throw new Error(detail)
        }
        return res.blob()
      })
      .then(async (blob) => {
        if (!active) return
        const blobUrl = URL.createObjectURL(blob)
        currentBlobUrl = blobUrl
        setPdfBlobUrl(blobUrl)

        const buffer = await blob.arrayBuffer()
        if (!active) return
        setPdfData(buffer)
        setFetchingBinary(false)
      })
      .catch((err) => {
        if (!active) return
        console.error('Fetch PDF binary error:', err)
        setFetchError(err.message || 'Falha ao descarregar PDF do servidor')
        setFetchingBinary(false)
        setLoading(false)
      })

    return () => {
      active = false
      if (currentBlobUrl) {
        try {
          URL.revokeObjectURL(currentBlobUrl)
        } catch {}
      }
    }
  }, [documentId, reloadKey])

  // Memoize file input for react-pdf as binary data
  const fileSource = useMemo(() => {
    if (!pdfData) return null
    return { data: pdfData }
  }, [pdfData])

  // Fit scale dynamically to container width
  const fitToWidth = () => {
    if (!containerRef.current) return
    const containerW = containerRef.current.clientWidth
    if (!containerW) return
    const normRot = ((rotation % 360) + 360) % 360
    const pageSize0 = activeMapping?.page_sizes?.[0]
    const effectivePageW = (normRot === 90 || normRot === 270)
      ? (pageSize0?.h || 842)
      : (pageSize0?.w || 595)
    const padding = containerW < 640 ? 16 : 32
    const availableW = Math.max(180, containerW - padding)
    const newScale = Math.min(2.5, Math.max(0.4, Number((availableW / effectivePageW).toFixed(2))))
    setScale(newScale)
  }

  // Window resize handler for narrow/mobile screens
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && (containerRef.current.clientWidth < 768 || window.innerWidth < 768)) {
        fitToWidth()
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [activeMapping])

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    setLoading(false)
    setDocLoadError(null)
    setTimeout(() => {
      fitToWidth()
    }, 60)
  }

  const onDocumentLoadError = (err: any) => {
    console.error('PDF Document parse error:', err)
    setLoading(false)
    setDocLoadError(err?.message || 'Erro ao processar as páginas do documento PDF')
  }

  const scrollToPage = (pageNumber: number, yOffset?: number, attempt = 0) => {
    if (pageNumber < 1 || (numPages > 0 && pageNumber > numPages)) return
    const el = pageRefs.current[pageNumber]
    if (el && containerRef.current) {
      if (yOffset !== undefined && !isNaN(yOffset)) {
        const pageW = el.clientWidth || 595
        const origW = activeMapping?.page_sizes?.[pageNumber - 1]?.w || 595
        const pageScale = origW > 0 ? pageW / origW : scale
        const targetTop = Math.max(0, el.offsetTop + yOffset * pageScale - 60)
        containerRef.current.scrollTo({ top: targetTop, behavior: 'smooth' })
      } else {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      setCurrentPage(pageNumber)
      if (onPageChange) onPageChange(pageNumber)
    } else if (attempt < 8) {
      setTimeout(() => scrollToPage(pageNumber, yOffset, attempt + 1), 60)
    }
  }

  // Determine target bboxes to render and highlight
  const targetBBoxes = useMemo(() => {
    if (highlightBBoxes && highlightBBoxes.length > 0) {
      return highlightBBoxes
    }
    if (highlightFieldKey && activeMapping?.field_bboxes?.[highlightFieldKey]) {
      return activeMapping.field_bboxes[highlightFieldKey] || []
    }
    return []
  }, [highlightBBoxes, highlightFieldKey, activeMapping])

  // Smooth scroll to highlighted bbox or occurrence start page
  useEffect(() => {
    if (loading || numPages === 0) return

    if (targetBBoxes && targetBBoxes.length > 0) {
      const targetPage = targetBBoxes[0].page
      if (targetPage && targetPage <= numPages) {
        // If in native mode, automatically switch to canvas so user sees the glowing bounding box
        if (viewMode === 'native') {
          setViewMode('canvas')
        }
        scrollToPage(targetPage, targetBBoxes[0].y0)
      }
    } else if (activeMapping?.start_page && activeMapping.start_page <= numPages) {
      scrollToPage(activeMapping.start_page)
    }
  }, [targetBBoxes, activeMapping, loading, numPages])

  const bboxesToRender = targetBBoxes

  // Check if highlighted field spans multiple pages
  const distinctPages = Array.from(
    new Set((bboxesToRender || []).map((b) => b?.page).filter((p): p is number => typeof p === 'number' && p > 0))
  ).sort((a, b) => a - b)
  const spansMultiplePages = distinctPages.length > 1

  return (
    <div className="flex flex-col h-full w-full bg-zinc-950/60 relative select-none">
      {/* Viewer Toolbar */}
      <div className="h-9 border-b bg-card px-2 sm:px-3 flex items-center justify-between z-10 shrink-0 text-xs shadow-2xs">
        {/* Page navigation controls */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => scrollToPage(Math.max(currentPage - 1, 1))}
            disabled={currentPage <= 1 || loading || numPages === 0 || viewMode === 'native'}
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <span className="font-mono text-[11px] text-muted-foreground">
            pág.{' '}
            <span className="font-bold text-foreground">
              {loading ? '-' : currentPage}
            </span>{' '}
            / {numPages || '-'}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => scrollToPage(Math.min(currentPage + 1, numPages))}
            disabled={currentPage >= numPages || loading || numPages === 0 || viewMode === 'native'}
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>

        {/* View Mode Toggle & Zoom & Reload controls */}
        <div className="flex items-center gap-1">
          {/* Native vs Interactive Toggle */}
          {pdfBlobUrl && (
            <Button
              variant={viewMode === 'native' ? 'default' : 'outline'}
              size="xs"
              onClick={() => setViewMode((m) => (m === 'native' ? 'canvas' : 'native'))}
              className="h-6 text-[10px] px-1.5 gap-1 font-semibold"
              title={
                viewMode === 'native'
                  ? 'Voltar ao modo interativo com destaque de campos'
                  : 'Abrir no leitor nativo do navegador'
              }
            >
              <Eye className="size-3" />
              <span>{viewMode === 'native' ? 'Destaque SAP' : 'Leitor Nativo'}</span>
            </Button>
          )}

          {viewMode === 'canvas' && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={fitToWidth}
                title="Ajustar à largura da tela"
              >
                <Scaling className="size-3.5 text-primary" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setScale((s) => Math.max(0.4, Number((s - 0.15).toFixed(2))))}
                title="Reduzir Zoom (-)"
              >
                <ZoomOut className="size-3.5" />
              </Button>
              <span className="font-mono text-[11px] w-10 text-center text-muted-foreground select-none">
                {Math.round(scale * 100)}%
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setScale((s) => Math.min(2.5, Number((s + 0.15).toFixed(2))))}
                title="Aumentar Zoom (+)"
              >
                <ZoomIn className="size-3.5" />
              </Button>
              <div className="h-3 w-px bg-border mx-0.5" />
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setRotation((r) => (r + 90) % 360)}
                title="Girar 90°"
              >
                <RotateCw className="size-3.5" />
              </Button>
            </>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => {
              setReloadKey((k) => k + 1)
            }}
            title="Recarregar PDF"
          >
            <RefreshCw className="size-3.5" />
          </Button>

          {pdfBlobUrl && (
            <a
              href={pdfBlobUrl}
              target="_blank"
              rel="noreferrer"
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
              title="Abrir PDF em nova aba"
            >
              <ExternalLink className="size-3.5" />
            </a>
          )}

          {onCollapse && (
            <>
              <div className="h-3 w-px bg-border mx-0.5" />
              <Button
                variant="outline"
                size="xs"
                onClick={onCollapse}
                className="h-6 px-1.5 text-[10px] gap-1 text-muted-foreground hover:text-foreground font-semibold"
                title="Recolher painel do PDF para ampliar a leitura"
              >
                <PanelRightClose className="size-3" />
                <span className="hidden xl:inline">Recolher PDF</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Multi-page highlight helper alert */}
      {viewMode === 'canvas' && spansMultiplePages && (
        <div className="bg-cyan-500/10 border-b border-cyan-500/20 px-3 py-1 flex items-center justify-between text-[11px] text-cyan-700 dark:text-cyan-300 z-10 shrink-0">
          <span>
            ℹ️ O campo destacado estende-se por{' '}
            <strong>{distinctPages.length} páginas</strong> ({distinctPages.join(', ')}).
          </span>
          <button
            onClick={() => {
              const nextPage = distinctPages.find((p) => p > currentPage) || distinctPages[0]
              scrollToPage(nextPage)
            }}
            className="underline font-semibold ml-2 hover:opacity-80 cursor-pointer"
          >
            Ver ➔
          </button>
        </div>
      )}

      {/* MAIN VIEWER AREA */}
      <div className="flex-1 overflow-hidden relative flex flex-col">
        {/* 1. Fetching Binary State */}
        {fetchingBinary && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
            <Loader2 className="size-8 animate-spin mb-3 text-primary" />
            <p className="text-xs font-semibold text-foreground">Carregando relatório PDF SAP...</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Transferindo arquivo binário com segurança
            </p>
          </div>
        )}

        {/* 2. Fetch Binary Error State */}
        {!fetchingBinary && fetchError && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-sm mx-auto my-auto">
            <div className="size-12 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-600 mb-3">
              <FileText className="size-6" />
            </div>
            <p className="font-bold text-sm text-foreground mb-1">PDF Físico Não Disponível</p>
            <p className="text-muted-foreground text-xs leading-relaxed mb-4">
              {fetchError.includes('404')
                ? 'O arquivo binário do PDF não foi localizado ou foi liberado para economia de espaço no servidor. Todos os dados da notificação e ordem SAP continuam preservados no sistema.'
                : fetchError}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReloadKey((k) => k + 1)}
              className="gap-1.5 text-xs font-semibold"
            >
              <RefreshCw className="size-3" />
              <span>Tentar novamente</span>
            </Button>
          </div>
        )}

        {/* 3. NATIVE BROWSER EMBED VIEW (100% Guaranteed Native Chromium Engine) */}
        {!fetchingBinary && !fetchError && pdfBlobUrl && viewMode === 'native' && (
          <div className="h-full w-full bg-white flex flex-col">
            <iframe
              src={`${pdfBlobUrl}#page=${currentPage}`}
              className="w-full h-full border-0"
              title="Leitor Nativo PDF"
            />
          </div>
        )}

        {/* 4. INTERACTIVE CANVAS VIEW WITH SAP BOUNDING BOXES */}
        {!fetchingBinary && !fetchError && fileSource && viewMode === 'canvas' && (
          <div
            ref={containerRef}
            className="flex-1 overflow-auto p-2 sm:p-4 flex flex-col items-center gap-3 sm:gap-4 relative touch-pan-x touch-pan-y"
          >
            <Document
              file={fileSource}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={
                <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
                  <Loader2 className="size-7 animate-spin mb-2 text-primary" />
                  <p className="text-xs">Renderizando páginas com alta precisão...</p>
                </div>
              }
              error={
                <div className="p-8 text-center text-xs flex flex-col items-center justify-center max-w-sm mx-auto my-auto">
                  <AlertCircle className="size-8 text-amber-500 mb-2" />
                  <p className="font-semibold text-foreground mb-1">Visualização Interativa Indisponível</p>
                  <p className="text-muted-foreground text-[11px] leading-relaxed mb-3">
                    {docLoadError || 'O navegador não conseguiu renderizar via canvas.'}
                  </p>
                  {pdfBlobUrl && (
                    <Button
                      size="xs"
                      onClick={() => setViewMode('native')}
                      className="gap-1.5 text-xs font-semibold"
                    >
                      <Eye className="size-3" />
                      <span>Abrir no Leitor Nativo do Navegador</span>
                    </Button>
                  )}
                </div>
              }
            >
              {!loading &&
                numPages > 0 &&
                Array.from(new Array(numPages), (_, index) => {
                  const pageNum = index + 1
                  const pageSize = activeMapping?.page_sizes?.[pageNum - 1]
                  const origW = pageSize?.w || 595
                  const origH = pageSize?.h || 842
                  const pageBBoxes = (bboxesToRender || []).filter((b) => b && b.page === pageNum)
                  const recordBBoxes = (activeMapping?.field_bboxes?.['record'] || []).filter(
                    (b) => b && b.page === pageNum
                  )

                  return (
                    <div
                      key={`doc_${documentId}_p_${pageNum}`}
                      ref={(el) => {
                        pageRefs.current[pageNum] = el
                      }}
                      className="relative shadow-md bg-white rounded-xs border border-border shrink-0"
                    >
                      <Page
                        pageNumber={pageNum}
                        scale={scale}
                        rotate={rotation}
                        renderAnnotationLayer={false}
                        renderTextLayer={false}
                        error={
                          <div className="p-4 text-center text-xs text-muted-foreground">
                            Página {pageNum} indisponível
                          </div>
                        }
                      />

                      {/* Overlay Layer for Bounding Box Highlights */}
                      <div className="absolute inset-0 pointer-events-none overflow-hidden">
                        {/* Subtle border for the active occurrence record */}
                        {recordBBoxes.map((bb, bbi) => {
                          const box = transformBBox(bb, rotation, origW, origH, scale)
                          return (
                            <div
                              key={`rec_${bbi}`}
                              className="absolute border border-primary/30 bg-primary/5 rounded-xs"
                              style={{
                                left: `${box.left}px`,
                                top: `${box.top}px`,
                                width: `${box.width}px`,
                                height: `${box.height}px`,
                              }}
                            />
                          )
                        })}

                        {/* Pulsing Glowing Box for Clicked Field */}
                        {pageBBoxes.map((bb, bbi) => {
                          const box = transformBBox(bb, rotation, origW, origH, scale)
                          return (
                            <div
                              key={`hl_${bbi}`}
                              className="absolute border-2 border-cyan-400 bg-cyan-400/25 rounded-xs shadow-[0_0_12px_rgba(6,182,212,0.8)] animate-pulse"
                              style={{
                                left: `${box.left - 2}px`,
                                top: `${box.top - 2}px`,
                                width: `${box.width + 4}px`,
                                height: `${box.height + 4}px`,
                              }}
                            />
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
            </Document>
          </div>
        )}
      </div>
    </div>
  )
}
