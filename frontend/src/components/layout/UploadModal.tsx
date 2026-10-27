import React, { useState } from 'react'
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
import { AlertCircle, CheckCircle2, FileUp, Loader2, UploadCloud, X } from 'lucide-react'
import { toast } from 'sonner'

interface UploadModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function UploadModal({ open, onOpenChange, onSuccess }: UploadModalProps) {
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState<UploadResultItem[] | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selected = Array.from(e.target.files).filter((f) => f.name.toLowerCase().endsWith('.pdf'))
      setFiles(selected)
      setResults(null)
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (e.dataTransfer.files) {
      const dropped = Array.from(e.dataTransfer.files).filter((f) => f.name.toLowerCase().endsWith('.pdf'))
      setFiles(dropped)
      setResults(null)
    }
  }

  const handleUpload = async () => {
    if (!files.length) return
    setUploading(true)
    try {
      const res = await documentsApi.upload(files)
      setResults(res.results)
      toast.success(`${files.length} arquivo(s) processado(s) com sucesso!`)
      if (onSuccess) onSuccess()
    } catch (err: any) {
      toast.error(err.message || 'Falha ao processar upload de PDF')
    } finally {
      setUploading(false)
    }
  }

  const handleClose = () => {
    setFiles([])
    setResults(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <UploadCloud className="size-4 text-primary" />
            Ingestão de Relatórios SAP PM (PDF)
          </DialogTitle>
          <DialogDescription className="text-xs">
            Arraste ou selecione relatórios de turno gerados pelo SAP PM. Extração com memória espacial
            e OCR automático para PDFs escaneados.
          </DialogDescription>
        </DialogHeader>

        {!results ? (
          <div className="space-y-4">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => document.getElementById('pdf-upload-input')?.click()}
            >
              <FileUp className="size-8 text-muted-foreground mb-2" />
              <p className="text-xs font-medium">Clique para selecionar ou arraste relatórios aqui</p>
              <p className="text-[11px] text-muted-foreground mt-1">Apenas arquivos .PDF (máx. 100 MB por arquivo)</p>
              <input
                id="pdf-upload-input"
                type="file"
                multiple
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {files.length > 0 && (
              <div className="max-h-48 overflow-y-auto space-y-1 rounded-md border p-2">
                <p className="text-[11px] font-semibold text-muted-foreground px-1 pb-1">
                  Arquivos selecionados ({files.length}):
                </p>
                {files.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-muted/40">
                    <span className="truncate max-w-[340px]">{f.name}</span>
                    <span className="text-[10px] text-muted-foreground">{(f.size / 1024 / 1024).toFixed(2)} MB</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3 max-h-72 overflow-y-auto">
            <p className="text-xs font-semibold">Resultado do Processamento:</p>
            {results.map((r, i) => (
              <div key={i} className="border rounded-md p-2.5 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium truncate max-w-[280px]">{r.filename}</span>
                  {r.status === 'created' ? (
                    <Badge variant="success">Criado</Badge>
                  ) : r.status === 'duplicate' ? (
                    <Badge variant="secondary">Duplicado (Já Ingerido)</Badge>
                  ) : (
                    <Badge variant="destructive">Erro</Badge>
                  )}
                </div>
                {r.status !== 'error' ? (
                  <div className="text-[11px] text-muted-foreground flex gap-3">
                    <span>Ocorrências novas: <b>{r.occurrences_created}</b></span>
                    <span>Atualizadas: <b>{r.occurrences_updated}</b></span>
                    {r.document?.ocr_applied && <Badge variant="info">OCR Aplicado</Badge>}
                  </div>
                ) : (
                  <p className="text-[11px] text-red-500">{r.error}</p>
                )}
                {r.document?.parse_warnings && r.document.parse_warnings.length > 0 && (
                  <div className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 p-1 rounded">
                    {r.document.parse_warnings.map((w, wi) => (
                      <p key={wi}>⚠️ {w}</p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="flex justify-between items-center sm:justify-between">
          <Button variant="ghost" size="sm" onClick={handleClose} disabled={uploading}>
            {results ? 'Fechar' : 'Cancelar'}
          </Button>
          {!results && (
            <Button size="sm" onClick={handleUpload} disabled={uploading || files.length === 0}>
              {uploading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                  Processando...
                </>
              ) : (
                'Iniciar Processamento'
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
