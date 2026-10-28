import React, { useEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import type { BBox, FieldKey, Mapping } from '@/api/types'
import { Button } from '@/components/ui/button'
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import workerCode from 'pdfjs-dist/build/pdf.worker.min.mjs?raw'

// Instantiate worker via in-memory Blob URL (100% immune to network/MIME-type/CORS/Cloudflare errors)
if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
  try {
    const blob = new Blob([workerCode], { type: 'application/javascript' })
    pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob)
  } catch (e) {
    console.warn('Fallback workerSrc:', e)
  }
}

interface PdfViewerProps {
  documentId: string
  activeMapping?: Mapping | null
  highlightFieldKey?: FieldKey | null
  highlightBBoxes?: BBox[]
  onPageChange?: (page: number) => void
}

export function PdfViewer({
  documentId,
  activeMapping,
  highlightFieldKey,
  highlightBBoxes,
  onPageChange,
}: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [scale, setScale] = useState<number>(1.1)
  const [rotation, setRotation] = useState<number>(0)
  const [loading, setLoading] = useState<boolean>(true)

  const containerRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({})

  const pdfUrl = `/api/v1/documents/${documentId}/file`

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    setLoading(false)
  }

  const scrollToPage = (pageNumber: number, yOffset?: number) => {
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
    }
  }

  // Smooth scroll to highlighted bbox or occurrence start page
  useEffect(() => {
    if (highlightBBoxes && highlightBBoxes.length > 0) {
      const targetPage = highlightBBoxes[0].page
      if (targetPage) {
        scrollToPage(targetPage, highlightBBoxes[0].y0)
      }
    } else if (activeMapping?.start_page) {
      scrollToPage(activeMapping.start_page)
    }
  }, [highlightBBoxes, activeMapping])

  // Determine which bboxes to draw
  let bboxesToRender: BBox[] = []
  if (highlightBBoxes && highlightBBoxes.length > 0) {
    bboxesToRender = highlightBBoxes
  } else if (highlightFieldKey && activeMapping?.field_bboxes?.[highlightFieldKey]) {
    bboxesToRender = activeMapping.field_bboxes[highlightFieldKey] || []
  }

  // Check if highlighted field spans multiple pages
  const distinctPages = Array.from(
    new Set((bboxesToRender || []).map((b) => b?.page).filter((p): p is number => typeof p === 'number' && p > 0))
  ).sort((a, b) => a - b)
  const spansMultiplePages = distinctPages.length > 1

  return (
    <div className="flex flex-col h-full w-full bg-muted/30 relative select-none">
      {/* Viewer Toolbar */}
      <div className="h-9 border-b bg-card px-3 flex items-center justify-between z-10 shrink-0 text-xs shadow-2xs">
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => scrollToPage(Math.max(currentPage - 1, 1))}
            disabled={currentPage <= 1}
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <span className="font-mono text-[11px] text-muted-foreground">
            pág. <span className="font-bold text-foreground">{currentPage}</span> / {numPages || '-'}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => scrollToPage(Math.min(currentPage + 1, numPages))}
            disabled={currentPage >= numPages}
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setScale((s) => Math.max(Number((s - 0.15).toFixed(2)), 0.6))}
            title="Reduzir Zoom"
          >
            <ZoomOut className="size-3.5" />
          </Button>
          <span className="font-mono text-[11px] w-10 text-center text-muted-foreground">
            {Math.round(scale * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setScale((s) => Math.min(Number((s + 0.15).toFixed(2)), 2.5))}
            title="Aumentar Zoom"
          >
            <ZoomIn className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            title="Girar 90°"
          >
            <RotateCw className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Floating indicator for field spanning pages */}
      {spansMultiplePages && distinctPages.length > 1 && (
        <div className="absolute top-11 right-4 z-20 bg-cyan-600 text-white text-[11px] font-semibold px-2.5 py-1 rounded-full shadow-lg flex items-center gap-1.5 animate-bounce">
          <span>Continua na pág. {distinctPages.slice(1).join(', ')}</span>
          <button
            onClick={() => scrollToPage(distinctPages[1])}
            className="underline cursor-pointer hover:opacity-80"
          >
            Ver ➔
          </button>
        </div>
      )}

      {/* PDF Scroll Area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto p-4 flex flex-col items-center gap-4 relative"
      >
        <Document
          file={pdfUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={
            <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
              <Loader2 className="size-6 animate-spin mb-2" />
              <p className="text-xs">Carregando visualizador PDF...</p>
            </div>
          }
          error={
            <div className="p-8 text-center text-xs flex flex-col items-center justify-center max-w-sm mx-auto">
              <div className="size-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-600 mb-2.5">
                <FileText className="size-5" />
              </div>
              <p className="font-semibold text-foreground mb-1">Arquivo PDF Físico Não Disponível</p>
              <p className="text-muted-foreground text-[11px] leading-relaxed mb-3">
                O arquivo binário pode ter sido liberado do disco durante o saneamento para economia de armazenamento.
                Todos os dados estruturados e notas SAP continuam íntegros no sistema.
              </p>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-muted text-[10px] text-muted-foreground font-mono">
                <span>Visualização técnica estruturada ativa</span>
              </div>
            </div>
          }
        >
          {Array.from(new Array(numPages), (_, index) => {
            const pageNum = index + 1
            const pageBBoxes = (bboxesToRender || []).filter((b) => b && b.page === pageNum)
            const recordBBoxes = (activeMapping?.field_bboxes?.['record'] || []).filter(
              (b) => b && b.page === pageNum
            )

            return (
              <div
                key={`page_${pageNum}`}
                ref={(el) => {
                  pageRefs.current[pageNum] = el
                }}
                className="relative shadow-md bg-white rounded-xs border border-border"
              >
                <Page
                  pageNumber={pageNum}
                  scale={scale}
                  rotate={rotation}
                  renderAnnotationLayer={false}
                  renderTextLayer={false}
                />

                {/* Overlay Layer for Bounding Box Highlights */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                  {/* Subtle border for the active occurrence record */}
                  {recordBBoxes.map((bb, bbi) => (
                    <div
                      key={`rec_${bbi}`}
                      className="absolute border border-primary/30 bg-primary/5 rounded-xs"
                      style={{
                        left: `${(bb.x0 || 0) * scale}px`,
                        top: `${(bb.y0 || 0) * scale}px`,
                        width: `${Math.max(0, ((bb.x1 || 0) - (bb.x0 || 0)) * scale)}px`,
                        height: `${Math.max(0, ((bb.y1 || 0) - (bb.y0 || 0)) * scale)}px`,
                      }}
                    />
                  ))}

                  {/* Pulsing Glowing Box for Clicked Field */}
                  {pageBBoxes.map((bb, bbi) => (
                    <div
                      key={`hl_${bbi}`}
                      className="absolute border-2 border-cyan-400 bg-cyan-400/25 rounded-xs shadow-[0_0_12px_rgba(6,182,212,0.8)] animate-pulse"
                      style={{
                        left: `${(bb.x0 || 0) * scale - 2}px`,
                        top: `${(bb.y0 || 0) * scale - 2}px`,
                        width: `${Math.max(0, ((bb.x1 || 0) - (bb.x0 || 0)) * scale + 4)}px`,
                        height: `${Math.max(0, ((bb.y1 || 0) - (bb.y0 || 0)) * scale + 4)}px`,
                      }}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </Document>
      </div>
    </div>
  )
}
