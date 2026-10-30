import React, { useEffect, useMemo, useState } from 'react'
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
  Lock,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface DocumentCleanupModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialAction?: 'purge_binaries' | 'delete_complete'
  selectedDocIds: string[]
  allDocuments: PdfDocument[]
  onSuccess: () => void
}

export function DocumentCleanupModal({
  open,
  onOpenChange,
  initialAction = 'purge_binaries',
  selectedDocIds,
  allDocuments,
  onSuccess,
}: DocumentCleanupModalProps) {
  const hasManualSelection = selectedDocIds.length > 0

  // Scope & Action States
  const [scopeType, setScopeType] = useState<'selected' | 'days_30' | 'days_60' | 'days_90' | 'custom_date'>(
    () => (hasManualSelection ? 'selected' : 'days_60')
  )
  const [customDate, setCustomDate] = useState<string>('')
  const [action, setAction] = useState<'purge_binaries' | 'delete_complete'>(initialAction)

  // Safety Confirmation States
  const [confirmedRisk, setConfirmedRisk] = useState<boolean>(false)
  const [confirmText, setConfirmText] = useState<string>('')

  // Preview States
  const [preview, setPreview] = useState<DocumentCleanupPreview | null>(null)
  const [loadingPreview, setLoadingPreview] = useState<boolean>(false)
  const [executing, setExecuting] = useState<boolean>(false)
  const [showList, setShowList] = useState<boolean>(() => hasManualSelection && selectedDocIds.length <= 5)

  // Local instant calculation fallback from allDocuments when scope is 'selected'
  const localSelectedEstimate = useMemo(() => {
    if (scopeType !== 'selected' || selectedDocIds.length === 0) return null
    const matched = allDocuments.filter((d) => selectedDocIds.includes(d.id))
    const totalBytes = matched.reduce((acc, d) => acc + (d.file_size_bytes || 0), 0)
    const totalOccs = matched.reduce((acc, d) => acc + (d.occurrence_count || 0), 0)
    return {
      documents_count: matched.length,
      total_bytes_to_free: totalBytes,
      occurrences_affected: totalOccs,
      documents: matched.map((d) => ({
        id: d.id,
        filename: d.filename,
        file_size_bytes: d.file_size_bytes || 0,
        occurrence_count: d.occurrence_count || 0,
        has_binary: d.has_binary ?? true,
        report_period_start: d.report_period_start ? new Date(d.report_period_start) : undefined,
        emitted_at: d.emitted_at ? new Date(d.emitted_at) : undefined,
      })),
    }
  }, [scopeType, selectedDocIds, allDocuments])

  // Synchronize when open or initial inputs change
  useEffect(() => {
    if (open) {
      setScopeType(selectedDocIds.length > 0 ? 'selected' : 'days_60')
      setAction(initialAction)
      setConfirmedRisk(false)
      setConfirmText('')
      setShowList(selectedDocIds.length > 0 && selectedDocIds.length <= 5)
    }
  }, [open, selectedDocIds.length, initialAction])

  // Build the request payload based on current state
  const buildRequest = (): DocumentCleanupRequest => {
    const req: DocumentCleanupRequest = {
      action,
      delete_occurrences: action === 'delete_complete',
      confirmation_challenge: action === 'delete_complete' ? confirmText.trim().toUpperCase() : undefined,
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

  // Load live preview with race condition protection
  useEffect(() => {
    if (!open) {
      setPreview(null)
      return
    }

    const req = buildRequest()
    if (scopeType === 'selected' && (!req.document_ids || req.document_ids.length === 0)) {
      setPreview(null)
      return
    }
    if (scopeType === 'custom_date' && !customDate) {
      setPreview(null)
      return
    }

    let isCurrent = true
    setLoadingPreview(true)

    documentsApi
      .cleanupPreview(req)
      .then((data) => {
        if (isCurrent) {
          setPreview(data)
          if (data.documents.length <= 5) {
            setShowList(true)
          }
        }
      })
      .catch(() => {
        if (isCurrent) {
          setPreview(null)
        }
      })
      .finally(() => {
        if (isCurrent) {
          setLoadingPreview(false)
        }
      })

    return () => {
      isCurrent = false
    }
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

  // Active preview data: either server preview or fallback local estimate during initial load
  const activePreview = preview || (loadingPreview && localSelectedEstimate ? localSelectedEstimate : null)
  const isExpurgo = action === 'delete_complete'

  // Safety validation
  const isExpurgoAuthorized =
    isExpurgo &&
    confirmedRisk &&
    confirmText.trim().toUpperCase() === 'EXPURGAR' &&
    !!activePreview &&
    activePreview.documents_count > 0

  const isPurgeAuthorized =
    !isExpurgo &&
    confirmedRisk &&
    !!activePreview &&
    activePreview.documents_count > 0 &&
    activePreview.total_bytes_to_free > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto p-5">
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
                onClick={() => {
                  setAction('purge_binaries')
                  setConfirmedRisk(false)
                  setConfirmText('')
                }}
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
                onClick={() => {
                  setAction('delete_complete')
                  setConfirmedRisk(false)
                  setConfirmText('')
                }}
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
                  onClick={() => {
                    setScopeType('selected')
                    setConfirmedRisk(false)
                  }}
                  className="gap-1 font-semibold"
                >
                  <FileText className="size-3" />
                  Selecionados ({selectedDocIds.length})
                </Button>
              )}

              <Button
                size="xs"
                type="button"
                variant={scopeType === 'days_30' ? 'default' : 'outline'}
                onClick={() => {
                  setScopeType('days_30')
                  setConfirmedRisk(false)
                }}
              >
                Anteriores a 30 dias
              </Button>

              <Button
                size="xs"
                type="button"
                variant={scopeType === 'days_60' ? 'default' : 'outline'}
                onClick={() => {
                  setScopeType('days_60')
                  setConfirmedRisk(false)
                }}
              >
                Anteriores a 60 dias
              </Button>

              <Button
                size="xs"
                type="button"
                variant={scopeType === 'days_90' ? 'default' : 'outline'}
                onClick={() => {
                  setScopeType('days_90')
                  setConfirmedRisk(false)
                }}
              >
                Anteriores a 90 dias
              </Button>

              <Button
                size="xs"
                type="button"
                variant={scopeType === 'custom_date' ? 'default' : 'outline'}
                onClick={() => {
                  setScopeType('custom_date')
                  setConfirmedRisk(false)
                }}
                className="gap-1"
              >
                <Calendar className="size-3" />
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
              {loadingPreview && (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Loader2 className="size-3 animate-spin text-primary" />
                  <span>Calculando impacto...</span>
                </div>
              )}
            </div>

            {activePreview ? (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-muted/40 p-2 rounded">
                    <span className="block text-[10px] text-muted-foreground">Relatórios</span>
                    <span className="text-sm font-bold font-mono text-foreground">
                      {activePreview.documents_count}
                    </span>
                  </div>
                  <div className="bg-muted/40 p-2 rounded">
                    <span className="block text-[10px] text-muted-foreground">Espaço a Liberar</span>
                    <span className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">
                      {formatBytes(activePreview.total_bytes_to_free)}
                    </span>
                  </div>
                  <div className="bg-muted/40 p-2 rounded">
                    <span className="block text-[10px] text-muted-foreground">
                      {isExpurgo ? 'Ocorrências Excluídas' : 'Ocorrências Mantidas'}
                    </span>
                    <span
                      className={cn(
                        'text-sm font-bold font-mono',
                        !isExpurgo ? 'text-primary' : 'text-destructive'
                      )}
                    >
                      {activePreview.occurrences_affected}
                    </span>
                  </div>
                </div>

                {activePreview.documents.length > 0 && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowList(!showList)}
                      className="text-[11px] text-primary hover:underline flex items-center gap-1 font-medium cursor-pointer"
                    >
                      {showList ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                      {showList
                        ? 'Ocultar lista de relatórios'
                        : `Ver os ${activePreview.documents.length} relatórios afetados`}
                    </button>

                    {showList && (
                      <div className="mt-1.5 max-h-36 overflow-y-auto rounded border bg-background p-1.5 space-y-1 text-[11px]">
                        {activePreview.documents.map((d) => (
                          <div
                            key={d.id}
                            className="flex items-center justify-between p-1 rounded hover:bg-muted/40"
                          >
                            <span className="truncate max-w-[260px] font-mono text-[10px]">
                              {d.filename}
                            </span>
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

                {activePreview.documents_count === 0 && (
                  <p className="text-[11px] text-muted-foreground italic text-center py-1">
                    Nenhum documento atende aos critérios deste filtro.
                  </p>
                )}

                {/* Aviso quando os arquivos já foram liberados */}
                {!isExpurgo && activePreview.documents_count > 0 && activePreview.total_bytes_to_free === 0 && (
                  <div className="p-2 rounded bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-700 dark:text-amber-300">
                    ℹ️ Os {activePreview.documents_count} relatório(s) selecionados já tiveram seus arquivos binários físicos liberados anteriormente (0 B restantes para liberar).
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground italic text-center py-2">
                {loadingPreview ? 'Calculando impacto...' : 'Defina os critérios acima para visualizar o impacto.'}
              </p>
            )}
          </div>

          {/* PROTOCOLO DE SEGURANÇA 1: Confirmação para Liberar Espaço em Disco */}
          {!isExpurgo && activePreview && activePreview.documents_count > 0 && activePreview.total_bytes_to_free > 0 && (
            <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg space-y-2 text-[11px]">
              <div className="flex items-center gap-1.5 font-semibold text-primary">
                <Check className="size-4" />
                <span>Protocolo de Segurança: Confirmação de Liberação</span>
              </div>
              <p className="text-muted-foreground leading-snug">
                Os arquivos <code className="text-[10px]">.pdf</code> serão apagados do disco no servidor ({formatBytes(activePreview.total_bytes_to_free)} recuperados). <strong>Todas as {activePreview.occurrences_affected} ocorrências, gráficos e históricos continuarão 100% disponíveis no ATC Vision.</strong>
              </p>
              <label className="flex items-center gap-2 pt-1 font-medium cursor-pointer text-foreground select-none">
                <input
                  type="checkbox"
                  checked={confirmedRisk}
                  onChange={(e) => setConfirmedRisk(e.target.checked)}
                  className="rounded border-primary text-primary focus:ring-primary size-3.5 cursor-pointer"
                />
                <span>Confirmar liberação do espaço físico dos relatórios selecionados.</span>
              </label>
            </div>
          )}

          {/* PROTOCOLO DE SEGURANÇA 2: Confirmação Estrita para Expurgo Total */}
          {isExpurgo && activePreview && activePreview.documents_count > 0 && (
            <div className="p-3.5 bg-destructive/10 border-2 border-destructive/30 rounded-lg space-y-2.5 text-[11px]">
              <div className="flex items-center gap-2">
                <ShieldAlert className="size-4 text-destructive shrink-0" />
                <span className="font-bold text-destructive text-xs">
                  Protocolo de Segurança Crítico: Expurgo Permanente
                </span>
              </div>

              <div className="space-y-1 text-muted-foreground leading-snug">
                <p>
                  <strong className="text-destructive font-semibold">Esta ação é irreversível.</strong> Os documentos e suas <strong>{activePreview.occurrences_affected} ocorrência(s) exclusivas vinculadas serão excluídos definitivamente</strong> do banco de dados e do disco.
                </p>
              </div>

              {/* Requirement A: Checkbox */}
              <label className="flex items-start gap-2 pt-1 font-medium cursor-pointer text-foreground select-none">
                <input
                  type="checkbox"
                  checked={confirmedRisk}
                  onChange={(e) => setConfirmedRisk(e.target.checked)}
                  className="rounded border-destructive text-destructive focus:ring-destructive size-3.5 mt-0.5 cursor-pointer"
                />
                <span>
                  Estou ciente de que as ocorrências e relatórios serão excluídos permanentemente sem possibilidade de recuperação.
                </span>
              </label>

              {/* Requirement B: Type-to-confirm challenge */}
              <div className="pt-1.5 border-t border-destructive/20 space-y-1.5">
                <label className="block text-[10px] uppercase font-bold text-destructive tracking-wider flex items-center gap-1">
                  <Lock className="size-3 text-destructive" /> Digite a palavra "EXPURGAR" para desbloquear:
                </label>
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="EXPURGAR"
                  className="h-7 text-xs font-mono font-bold uppercase tracking-wider bg-background border-destructive/40 focus:border-destructive"
                />
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
            variant={isExpurgo ? 'destructive' : 'default'}
            disabled={
              executing ||
              loadingPreview ||
              !activePreview ||
              activePreview.documents_count === 0 ||
              (isExpurgo && !isExpurgoAuthorized) ||
              (!isExpurgo && !isPurgeAuthorized)
            }
            onClick={handleExecute}
            className="gap-1.5 font-semibold"
          >
            {executing ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Processando Saneamento...
              </>
            ) : !isExpurgo ? (
              <>
                <Sparkles className="size-3.5" />
                {activePreview && activePreview.total_bytes_to_free > 0
                  ? `Liberar ${formatBytes(activePreview.total_bytes_to_free)} em Disco`
                  : 'Nenhum Espaço a Liberar'}
              </>
            ) : (
              <>
                <Trash2 className="size-3.5" />
                {isExpurgoAuthorized
                  ? `Confirmar Expurgo de ${activePreview?.documents_count} Relatório(s)`
                  : 'Expurgo Bloqueado (Confirmação Pendente)'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
