import React, { useEffect, useState } from 'react'
import { documentsApi } from '@/api'
import type {
  DocumentCleanupPreview,
  DocumentCleanupRequest,
  PdfDocument,
} from '@/api/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertTriangle,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  FileText,
  HardDrive,
  Info,
  Loader2,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface DocumentCleanupModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedDocIds: string[]
  allDocuments: PdfDocument[]
  onSuccess: () => void
}

export function DocumentCleanupModal({
  open,
  onOpenChange,
  selectedDocIds,
  allDocuments,
  onSuccess,
}: DocumentCleanupModalProps) {
  const hasManualSelection = selectedDocIds.length > 0
  const [scopeType, setScopeType] = useState<'selected' | 'days_30' | 'days_60' | 'days_90' | 'custom_date'>(
    hasManualSelection ? 'selected' : 'days_60'
  )
  const [customDate, setCustomDate] = useState<string>('')
  const [action, setAction] = useState<'purge_binaries' | 'delete_complete'>('purge_binaries')
  const [confirmedRisk, setConfirmedRisk] = useState<boolean>(false)

  const [preview, setPreview] = useState<DocumentCleanupPreview | null>(null)
  const [loadingPreview, setLoadingPreview] = useState<boolean>(false)
  const [executing, setExecuting] = useState<boolean>(false)
  const [showList, setShowList] = useState<boolean>(false)

  // Reset or adjust scope when opening
  useEffect(() => {
    if (open) {
      if (hasManualSelection) {
        setScopeType('selected')
      } else {
        setScopeType('days_60')
      }
      setConfirmedRisk(false)
      setShowList(false)
    }
  }, [open, hasManualSelection])

  // Build the request payload based on current state
  const buildRequest = (): DocumentCleanupRequest => {
    const req: DocumentCleanupRequest = {
      action,
      delete_occurrences: action === 'delete_complete',
    }

    if (scopeType === 'selected') {
      req.document_ids = selectedDocIds
    } else if (scopeType === 'days_30') {
      req.older_than_days = 30
    } else if (scopeType === 'days_60') {
      req.older_than_days = 60
    } else if (scopeType === 'days_90') {
      req.older_than_days = 90
    } else if (scopeType === 'custom_date' && customDate) {
      req.before_date = `${customDate}T23:59:59`
    }

    return req
  }

  // Load live preview
  useEffect(() => {
    if (!open) return
    const req = buildRequest()
    if (scopeType === 'selected' && (!req.document_ids || req.document_ids.length === 0)) {
      setPreview(null)
      return
    }
    if (scopeType === 'custom_date' && !customDate) {
      setPreview(null)
      return
    }

    setLoadingPreview(true)
    documentsApi
      .cleanupPreview(req)
      .then((data) => {
        setPreview(data)
      })
      .catch(() => {
        setPreview(null)
      })
      .finally(() => {
        setLoadingPreview(false)
      })
  }, [open, scopeType, customDate, action, selectedDocIds])

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  const handleExecute = async () => {
    const req = buildRequest()
    setExecuting(true)
    try {
      const res = await documentsApi.cleanup(req)
      toast.success(res.message)
      onSuccess()
      onOpenChange(false)
    } catch (err: any) {
      toast.error(err.message || 'Erro ao executar saneamento')
    } finally {
      setExecuting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-5">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <HardDrive className="size-5 text-primary" />
            Saneamento & Gestão de Armazenamento ATC
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Otimize o uso de espaço em disco no servidor com segurança, mantendo todo o banco histórico de ocorrências intacto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1 text-xs">
          {/* Step 1: Escolha da Ação */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              1. Selecione a Modalidade de Limpeza:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Option A: Otimizar Espaço (Recomendado) */}
              <div
                onClick={() => setAction('purge_binaries')}
                className={cn(
                  'border rounded-lg p-3 cursor-pointer transition-all flex flex-col justify-between space-y-2',
                  action === 'purge_binaries'
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-border hover:bg-muted/40'
                )}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs flex items-center gap-1.5 text-foreground">
                      <Sparkles className="size-3.5 text-emerald-500" />
                      Liberar Espaço em Disco
                    </span>
                    <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                      Recomendado
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
                    Remove os arquivos <code className="text-[10px]">.pdf</code> físicos do disco. <strong>Todas as ocorrências, confirmações e notas SAP são preservadas 100% no banco de dados.</strong>
                  </p>
                </div>
                <div className="text-[10px] text-emerald-700 dark:text-emerald-300 font-medium flex items-center gap-1 pt-1">
                  <Check className="size-3" /> Zero perda de dados analíticos
                </div>
              </div>

              {/* Option B: Expurgo Completo */}
              <div
                onClick={() => setAction('delete_complete')}
                className={cn(
                  'border rounded-lg p-3 cursor-pointer transition-all flex flex-col justify-between space-y-2',
                  action === 'delete_complete'
                    ? 'border-destructive bg-destructive/5 ring-1 ring-destructive'
                    : 'border-border hover:bg-muted/40'
                )}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs flex items-center gap-1.5 text-destructive">
                      <Trash2 className="size-3.5" />
                      Expurgo Total
                    </span>
                    <Badge variant="outline" className="text-[9px] text-destructive border-destructive/30">
                      Permanente
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
                    Exclui os arquivos <code className="text-[10px]">.pdf</code> do disco e <strong>apaga todas as ocorrências exclusivas vinculadas a eles</strong>.
                  </p>
                </div>
                <div className="text-[10px] text-destructive font-medium flex items-center gap-1 pt-1">
                  <AlertTriangle className="size-3" /> Exclui ocorrências do sistema
                </div>
              </div>
            </div>
          </div>

          {/* Step 2: Escolha do Escopo */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              2. Definir Escopo de Arquivos:
            </label>
            <div className="flex flex-wrap gap-1.5">
              {hasManualSelection && (
                <Button
                  size="xs"
                  type="button"
                  variant={scopeType === 'selected' ? 'default' : 'outline'}
                  onClick={() => setScopeType('selected')}
                >
                  <FileText className="size-3 mr-1" />
                  Selecionados ({selectedDocIds.length})
                </Button>
              )}

              <Button
                size="xs"
                type="button"
                variant={scopeType === 'days_30' ? 'default' : 'outline'}
                onClick={() => setScopeType('days_30')}
              >
                Anteriores a 30 dias
              </Button>

              <Button
                size="xs"
                type="button"
                variant={scopeType === 'days_60' ? 'default' : 'outline'}
                onClick={() => setScopeType('days_60')}
              >
                Anteriores a 60 dias
              </Button>

              <Button
                size="xs"
                type="button"
                variant={scopeType === 'days_90' ? 'default' : 'outline'}
                onClick={() => setScopeType('days_90')}
              >
                Anteriores a 90 dias
              </Button>

              <Button
                size="xs"
                type="button"
                variant={scopeType === 'custom_date' ? 'default' : 'outline'}
                onClick={() => setScopeType('custom_date')}
              >
                <Calendar className="size-3 mr-1" />
                Data de Corte
              </Button>
            </div>

            {scopeType === 'custom_date' && (
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[11px] text-muted-foreground">Limpar arquivos anteriores a:</span>
                <Input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="h-7 w-36 text-xs bg-background"
                />
              </div>
            )}
          </div>

          {/* Step 3: Prévia de Impacto em Tempo Real */}
          <div className="border rounded-lg bg-card p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs flex items-center gap-1.5 text-foreground">
                <Info className="size-3.5 text-primary" />
                Prévia de Impacto
              </span>
              {loadingPreview && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
            </div>

            {preview ? (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-muted/40 p-2 rounded">
                    <span className="block text-[10px] text-muted-foreground">Relatórios</span>
                    <span className="text-sm font-bold font-mono text-foreground">
                      {preview.documents_count}
                    </span>
                  </div>
                  <div className="bg-muted/40 p-2 rounded">
                    <span className="block text-[10px] text-muted-foreground">Espaço a Liberar</span>
                    <span className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">
                      {formatBytes(preview.total_bytes_to_free)}
                    </span>
                  </div>
                  <div className="bg-muted/40 p-2 rounded">
                    <span className="block text-[10px] text-muted-foreground">
                      {action === 'purge_binaries' ? 'Ocorrências Mantidas' : 'Ocorrências Excluídas'}
                    </span>
                    <span
                      className={cn(
                        'text-sm font-bold font-mono',
                        action === 'purge_binaries' ? 'text-primary' : 'text-destructive'
                      )}
                    >
                      {preview.occurrences_affected}
                    </span>
                  </div>
                </div>

                {preview.documents.length > 0 && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowList(!showList)}
                      className="text-[11px] text-primary hover:underline flex items-center gap-1 font-medium"
                    >
                      {showList ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                      {showList ? 'Ocultar lista de relatórios' : `Ver os ${preview.documents.length} relatórios afetados`}
                    </button>

                    {showList && (
                      <div className="mt-1.5 max-h-36 overflow-y-auto rounded border bg-background p-1.5 space-y-1 text-[11px]">
                        {preview.documents.map((d) => (
                          <div
                            key={d.id}
                            className="flex items-center justify-between p-1 rounded hover:bg-muted/40"
                          >
                            <span className="truncate max-w-[260px] font-mono text-[10px]">{d.filename}</span>
                            <div className="flex items-center gap-2 shrink-0 text-muted-foreground text-[10px]">
                              <span>{d.occurrence_count} ocorrências</span>
                              <Badge variant="outline" className="text-[9px] font-mono">
                                {formatBytes(d.file_size_bytes)}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {preview.documents_count === 0 && (
                  <p className="text-[11px] text-muted-foreground italic text-center py-1">
                    Nenhum documento atende aos critérios deste filtro.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground italic text-center py-2">
                {loadingPreview ? 'Calculando impacto...' : 'Defina os critérios acima para visualizar o impacto.'}
              </p>
            )}
          </div>

          {/* Confirmação de Risco para Expurgo Completo */}
          {action === 'delete_complete' && preview && preview.documents_count > 0 && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-2.5">
              <ShieldAlert className="size-4 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-1 text-[11px]">
                <p className="font-semibold text-destructive">Confirmação de Segurança Requerida</p>
                <p className="text-muted-foreground leading-snug">
                  Esta ação não pode ser desfeita. {preview.occurrences_affected} ocorrência(s) serão removidas permanentemente do banco de dados.
                </p>
                <label className="flex items-center gap-2 pt-1 font-medium cursor-pointer text-foreground">
                  <input
                    type="checkbox"
                    checked={confirmedRisk}
                    onChange={(e) => setConfirmedRisk(e.target.checked)}
                    className="rounded border-destructive text-destructive focus:ring-destructive size-3.5"
                  />
                  <span>Estou ciente e autorizo a exclusão definitiva destes registros.</span>
                </label>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={executing}
          >
            Cancelar
          </Button>

          <Button
            size="sm"
            variant={action === 'delete_complete' ? 'destructive' : 'default'}
            disabled={
              executing ||
              loadingPreview ||
              !preview ||
              preview.documents_count === 0 ||
              (action === 'delete_complete' && !confirmedRisk)
            }
            onClick={handleExecute}
            className="gap-1.5"
          >
            {executing ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Processando Saneamento...
              </>
            ) : action === 'purge_binaries' ? (
              <>
                <Sparkles className="size-3.5" />
                Liberar {preview ? formatBytes(preview.total_bytes_to_free) : ''} em Disco
              </>
            ) : (
              <>
                <Trash2 className="size-3.5" />
                Confirmar Expurgo de {preview?.documents_count} Relatório(s)
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
