import React, { useRef, useState } from 'react'
import { documentsApi } from '@/api'
import type { UploadResultItem } from '@/api/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import {
  AlertCircle,
  CheckCircle2,
  FilePlus2,
  FileUp,
  Loader2,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface UploadModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

interface QueuedFile {
  key: string
  file: File
  status: 'pending' | 'uploading' | 'done' | 'error'
  progress: number
  result?: UploadResultItem
  errorMsg?: string
}

function fileKey(f: File): string {
  return `${f.name}__${f.size}__${f.lastModified}`
}

export function UploadModal({ open, onOpenChange, onSuccess }: UploadModalProps) {
  const [queue, setQueue] = useState<QueuedFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [finished, setFinished] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const dragDepthRef = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const addIncomingFiles = (incoming: FileList | File[]) => {
    const arr = Array.from(incoming)
    const pdfs = arr.filter(
      (f) => f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf'
    )
    const ignoredCount = arr.length - pdfs.length
    if (ignoredCount > 0) {
      toast.warning(`${ignoredCount} arquivo(s) ignorado(s): apenas arquivos .PDF são aceitos.`)
    }
    if (!pdfs.length) return

    setQueue((prev) => {
      // If a previous batch had already finished, start fresh with new selection
      const base = finished ? [] : prev
      const existingKeys = new Set(base.map((q) => q.key))
      const additions: QueuedFile[] = []
      let dupes = 0
      for (const f of pdfs) {
        const k = fileKey(f)
        if (existingKeys.has(k)) {
          dupes++
          continue
        }
        existingKeys.add(k)
        additions.push({
          key: k,
          file: f,
          status: 'pending',
          progress: 0,
        })
      }
      if (dupes > 0 && additions.length === 0) {
        toast.info('Arquivo(s) já estão na fila de envio.')
      } else if (additions.length > 0 && base.length > 0) {
        toast.success(`${additions.length} arquivo(s) adicionado(s) à fila.`)
      }
      return [...base, ...additions]
    })

    if (finished) setFinished(false)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addIncomingFiles(e.target.files)
    }
    // Reset input value so selecting the same file again triggers onChange
    e.target.value = ''
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragDepthRef.current += 1
    if (e.dataTransfer?.types?.includes('Files')) {
      setDragActive(true)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy'
    }
    if (!dragActive && e.dataTransfer?.types?.includes('Files')) {
      setDragActive(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragDepthRef.current = 0
    setDragActive(false)
    if (uploading) return
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      addIncomingFiles(e.dataTransfer.files)
    }
  }

  const removeQueuedFile = (key: string) => {
    if (uploading) return
    setQueue((prev) => prev.filter((item) => item.key !== key))
  }

  const handleUpload = async () => {
    const pendingItems = queue.filter((q) => q.status === 'pending' || q.status === 'error')
    if (!pendingItems.length) return

    setUploading(true)
    setFinished(false)

    let successCount = 0
    let errorCount = 0

    for (const item of pendingItems) {
      setQueue((prev) =>
        prev.map((q) =>
          q.key === item.key ? { ...q, status: 'uploading', progress: 0, errorMsg: undefined } : q
        )
      )

      try {
        const res = await documentsApi.upload([item.file], (fraction) => {
          const pct = Math.min(99, Math.max(1, Math.round(fraction * 100)))
          setQueue((prev) =>
            prev.map((q) => (q.key === item.key ? { ...q, progress: pct } : q))
          )
        })

        const firstResult = res.results?.[0]
        if (firstResult?.status === 'error') {
          errorCount++
          setQueue((prev) =>
            prev.map((q) =>
              q.key === item.key
                ? {
                    ...q,
                    status: 'error',
                    progress: 100,
                    result: firstResult,
                    errorMsg: firstResult.error || 'Erro ao processar PDF',
                  }
                : q
            )
          )
        } else {
          successCount++
          setQueue((prev) =>
            prev.map((q) =>
              q.key === item.key
                ? {
                    ...q,
                    status: 'done',
                    progress: 100,
                    result: firstResult,
                  }
                : q
            )
          )
        }
      } catch (err: any) {
        errorCount++
        setQueue((prev) =>
          prev.map((q) =>
            q.key === item.key
              ? {
                  ...q,
                  status: 'error',
                  progress: 0,
                  errorMsg: err?.message || 'Falha ao enviar arquivo ao servidor',
                }
              : q
          )
        )
      }
    }

    setUploading(false)
    setFinished(true)

    if (successCount > 0 && errorCount === 0) {
      toast.success(`${successCount} arquivo(s) processado(s) com sucesso!`)
      onSuccess?.()
    } else if (successCount > 0 && errorCount > 0) {
      toast.warning(`${successCount} arquivo(s) processado(s), mas ${errorCount} falhou(aram).`)
      onSuccess?.()
    } else if (errorCount > 0) {
      toast.error(`Falha no processamento de ${errorCount} arquivo(s).`)
    }
  }

  const handleClose = (nextOpen?: boolean) => {
    if (uploading) return
    if (nextOpen === true) {
      onOpenChange(true)
      return
    }
    setQueue([])
    setFinished(false)
    setDragActive(false)
    dragDepthRef.current = 0
    onOpenChange(false)
  }

  const pendingCount = queue.filter((q) => q.status === 'pending' || q.status === 'error').length
  const doneCount = queue.filter((q) => q.status === 'done').length
  const totalBytes = queue.reduce((acc, q) => acc + q.file.size, 0)

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'sm:max-w-2xl transition-all duration-150',
          dragActive && 'ring-2 ring-primary border-primary bg-primary/5'
        )}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <UploadCloud className="size-4 text-primary" />
            Ingestão em Lote de Relatórios SAP PM (PDF)
          </DialogTitle>
          <DialogDescription className="text-xs">
            Arraste vários relatórios de turno para qualquer área desta janela ou selecione múltiplos PDFs. Cada arquivo é validado e processado em fila individual para evitar falhas ou timeouts.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={inputRef}
          id="pdf-upload-input"
          type="file"
          multiple
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={handleFileChange}
        />

        <div className="space-y-3">
          {/* Dropzone Header / Trigger Box */}
          {!uploading && (
            <div
              onClick={() => inputRef.current?.click()}
              className={cn(
                'flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all select-none',
                dragActive
                  ? 'border-primary bg-primary/15 scale-[1.01]'
                  : 'border-border/80 hover:border-primary/60 hover:bg-muted/40'
              )}
            >
              <FileUp className={cn('size-7 mb-1.5', dragActive ? 'text-primary animate-bounce' : 'text-muted-foreground')} />
              <p className="text-xs font-semibold text-foreground">
                {dragActive
                  ? 'Solte os arquivos PDF aqui para adicionar à fila'
                  : queue.length > 0
                    ? 'Clique ou arraste mais relatórios PDF para adicionar ao lote'
                    : 'Clique para selecionar ou arraste vários relatórios PDF para cá'}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Suporta múltiplos arquivos .PDF simultâneos (máx. 100 MB por arquivo)
              </p>
            </div>
          )}

          {/* Queue & Results List */}
          {queue.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] px-1">
                <span className="font-semibold text-muted-foreground">
                  Fila de Processamento: <b className="text-foreground">{queue.length} arquivo(s)</b> ({(totalBytes / 1024 / 1024).toFixed(2)} MB)
                </span>
                <div className="flex items-center gap-2">
                  {uploading ? (
                    <span className="text-primary font-mono font-bold">
                      {doneCount}/{queue.length} concluído(s)
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        className="inline-flex items-center gap-1 text-primary hover:underline font-semibold cursor-pointer"
                      >
                        <FilePlus2 className="size-3" /> Adicionar mais
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setQueue([])
                          setFinished(false)
                        }}
                        className="inline-flex items-center gap-1 text-muted-foreground hover:text-red-500 font-medium cursor-pointer"
                      >
                        <Trash2 className="size-3" /> Limpar fila
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="max-h-64 overflow-y-auto space-y-1.5 rounded-xl border border-border/70 p-2 bg-muted/10">
                {queue.map((item) => {
                  const r = item.result
                  return (
                    <div
                      key={item.key}
                      className={cn(
                        'rounded-lg border p-2 text-xs space-y-1 transition-colors bg-card',
                        item.status === 'uploading' && 'border-primary/60 bg-primary/5',
                        item.status === 'done' && r?.status === 'created' && 'border-emerald-500/40',
                        item.status === 'error' && 'border-red-500/50 bg-red-500/5'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {item.status === 'uploading' ? (
                            <Loader2 className="size-3.5 animate-spin text-primary shrink-0" />
                          ) : item.status === 'done' ? (
                            <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                          ) : item.status === 'error' ? (
                            <AlertCircle className="size-3.5 text-red-500 shrink-0" />
                          ) : (
                            <FileUp className="size-3.5 text-muted-foreground shrink-0" />
                          )}
                          <span className="font-medium truncate text-foreground">{item.file.name}</span>
                          <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                            {(item.file.size / 1024 / 1024).toFixed(2)} MB
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {item.status === 'pending' && (
                            <Badge variant="outline" className="text-[10px]">Na fila</Badge>
                          )}
                          {item.status === 'uploading' && (
                            <Badge variant="info" className="text-[10px] font-mono">
                              {item.progress < 99 ? `Enviando ${item.progress}%` : 'Extraindo PDF...'}
                            </Badge>
                          )}
                          {item.status === 'done' && r?.status === 'created' && (
                            <Badge variant="success" className="text-[10px]">Criado</Badge>
                          )}
                          {item.status === 'done' && r?.status === 'duplicate' && (
                            <Badge variant="secondary" className="text-[10px]">Duplicado</Badge>
                          )}
                          {item.status === 'error' && (
                            <Badge variant="destructive" className="text-[10px]">Erro</Badge>
                          )}

                          {!uploading && (
                            <button
                              type="button"
                              onClick={() => removeQueuedFile(item.key)}
                              className="p-0.5 rounded text-muted-foreground hover:text-red-500 hover:bg-muted cursor-pointer"
                              title="Remover arquivo da fila"
                            >
                              <X className="size-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Progress bar while uploading */}
                      {item.status === 'uploading' && (
                        <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all duration-200"
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                      )}

                      {/* Detailed Extraction Result */}
                      {item.status === 'done' && r && (
                        <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-3 pl-5">
                          <span>Ocorrências novas: <b className="text-foreground">{r.occurrences_created}</b></span>
                          <span>Atualizadas: <b className="text-foreground">{r.occurrences_updated}</b></span>
                          {r.document?.ocr_applied && <Badge variant="info" className="text-[9px] h-4">OCR</Badge>}
                        </div>
                      )}

                      {item.status === 'error' && item.errorMsg && (
                        <p className="text-[11px] text-red-500 pl-5">{item.errorMsg}</p>
                      )}

                      {r?.document?.parse_warnings && r.document.parse_warnings.length > 0 && (
                        <div className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 p-1 rounded ml-5">
                          {r.document.parse_warnings.map((w, wi) => (
                            <p key={wi}>⚠️ {w}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between items-center sm:justify-between">
          <Button variant="ghost" size="sm" onClick={() => handleClose(false)} disabled={uploading}>
            {finished && pendingCount === 0 ? 'Fechar' : 'Cancelar'}
          </Button>
          {pendingCount > 0 && (
            <Button size="sm" onClick={handleUpload} disabled={uploading}>
              {uploading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                  Processando lote...
                </>
              ) : (
                `Iniciar Processamento (${pendingCount})`
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
