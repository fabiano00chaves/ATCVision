import React, { useState } from 'react'
import { occurrencesApi } from '@/api'
import type { FieldKey, Mapping, OccurrenceDetail, PrioridadeATC, StatusATC } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Eye,
  FileText,
  Flame,
  ListOrdered,
  MessageSquare,
  OctagonAlert,
  Search,
  Send,
  Star,
  Tag,
  Trash2,
  Users,
  Wrench,
  X,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn, copyToClipboard } from '@/lib/utils'

interface OccurrenceTechnicalSheetProps {
  occurrence: OccurrenceDetail
  activeMapping?: Mapping | null
  onMappingChange?: (m: Mapping) => void
  onHighlightField?: (key: FieldKey) => void
  onOccurrenceUpdated: (updated: OccurrenceDetail) => void
  onPrevious?: () => void
  onNext?: () => void
  hasPrevious?: boolean
  hasNext?: boolean
  currentIndex?: number
  totalCount?: number
  isMobileModal?: boolean
  onCloseMobile?: () => void
  onViewPdfMobile?: () => void
}

export function OccurrenceTechnicalSheet({
  occurrence: o,
  activeMapping,
  onMappingChange,
  onHighlightField,
  onOccurrenceUpdated,
  onPrevious,
  onNext,
  hasPrevious = false,
  hasNext = false,
  currentIndex,
  totalCount,
  isMobileModal = false,
  onCloseMobile,
  onViewPdfMobile,
}: OccurrenceTechnicalSheetProps) {
  const [commentText, setCommentText] = useState('')
  const [isActionItem, setIsActionItem] = useState(false)
  const [submittingComment, setSubmittingComment] = useState(false)
  const [copiedItem, setCopiedItem] = useState<string | null>(null)

  const handleCopy = async (text: string, label: string) => {
    const ok = await copyToClipboard(text)
    if (ok) {
      setCopiedItem(label)
      toast.success(`${label} copiado: ${text}`)
      setTimeout(() => setCopiedItem(null), 1500)
    }
  }

  // Patch handlers
  const handleToggleAnalisar = async () => {
    try {
      const updated = await occurrencesApi.patch(o.id, { flag_analisar: !o.flag_analisar })
      onOccurrenceUpdated(updated)
      toast.success(updated.flag_analisar ? 'Marcado para Analisar' : 'Desmarcado de Analisar')
    } catch {
      toast.error('Erro ao atualizar status')
    }
  }

  const handleToggleRelevante = async () => {
    try {
      const updated = await occurrencesApi.patch(o.id, { flag_relevante: !o.flag_relevante })
      onOccurrenceUpdated(updated)
      toast.success(updated.flag_relevante ? 'Marcado como Ocorrência Relevante' : 'Desmarcado')
    } catch {
      toast.error('Erro ao atualizar status')
    }
  }

  const handleStatusChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    try {
      const updated = await occurrencesApi.patch(o.id, { status_atc: e.target.value as StatusATC })
      onOccurrenceUpdated(updated)
      toast.success(`Status ATC atualizado para ${e.target.value}`)
    } catch {
      toast.error('Erro ao atualizar status ATC')
    }
  }

  const handlePriorityChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    try {
      const val = e.target.value ? (e.target.value as PrioridadeATC) : null
      const updated = await occurrencesApi.patch(o.id, { prioridade_atc: val })
      onOccurrenceUpdated(updated)
      toast.success('Prioridade ATC atualizada')
    } catch {
      toast.error('Erro ao atualizar prioridade')
    }
  }

  const handleJumpStatusToggle = async () => {
    const nextStatus = o.jump_status === 'RETIRADO' ? 'PENDENTE' : 'RETIRADO'
    try {
      const updated = await occurrencesApi.patch(o.id, { jump_status: nextStatus })
      onOccurrenceUpdated(updated)
      toast.success(`Status do Jump atualizado para ${nextStatus}`)
    } catch {
      toast.error('Erro ao alterar status do Jump')
    }
  }

  const handleAddComment = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!commentText.trim()) return
    setSubmittingComment(true)
    try {
      await occurrencesApi.addComment(o.id, commentText.trim(), isActionItem)
      const fresh = await occurrencesApi.get(o.id)
      onOccurrenceUpdated(fresh)
      setCommentText('')
      setIsActionItem(false)
      toast.success('Comentário registrado com sucesso')
    } catch {
      toast.error('Erro ao registrar comentário')
    } finally {
      setSubmittingComment(false)
    }
  }

  const handleDeleteComment = async (commentId: string) => {
    try {
      await occurrencesApi.deleteComment(commentId)
      const fresh = await occurrencesApi.get(o.id)
      onOccurrenceUpdated(fresh)
      toast.success('Comentário removido')
    } catch {
      toast.error('Erro ao remover comentário')
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 text-xs bg-background">
      {/* Top Header Navigation Bar (Desktop Split Mode only) */}
      {!isMobileModal && totalCount !== undefined && (
        <div className="flex items-center justify-between pb-2 border-b border-border/60 text-xs">
          <span className="font-semibold text-muted-foreground">
            {currentIndex !== undefined
              ? `Ocorrência ${currentIndex + 1} de ${totalCount}`
              : 'Ficha Técnica da Ocorrência'}
          </span>

          {/* Quick Prev / Next Buttons */}
          <div className="flex items-center gap-1">
            {onPrevious && (
              <Button
                variant="outline"
                size="icon"
                disabled={!hasPrevious}
                onClick={onPrevious}
                className="size-7"
                title="Ocorrência anterior (Atalho: k)"
              >
                <ChevronLeft className="size-4" />
              </Button>
            )}
            {onNext && (
              <Button
                variant="outline"
                size="icon"
                disabled={!hasNext}
                onClick={onNext}
                className="size-7"
                title="Próxima ocorrência (Atalho: j)"
              >
                <ChevronRight className="size-4" />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Header Card: Identifiers & Triage Toolbar */}
      <div className="border rounded-xl p-3 sm:p-4 bg-card shadow-2xs space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {/* Order / Notification Chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {o.numero_ordem && (
              <button
                onClick={() => handleCopy(o.numero_ordem!, 'Ordem')}
                title="Clique para copiar a Ordem"
                className="inline-flex items-center gap-1 font-mono text-xs font-bold px-2 py-0.5 rounded bg-muted hover:bg-muted/80 text-foreground border border-border transition-colors cursor-pointer"
              >
                <span>Ordem {o.numero_ordem}</span>
                {copiedItem === 'Ordem' ? (
                  <Check className="size-3 text-emerald-500" />
                ) : (
                  <Copy className="size-3 text-muted-foreground" />
                )}
              </button>
            )}

            {o.numero_nota && (
              <button
                onClick={() => handleCopy(o.numero_nota!, 'Nota')}
                title="Clique para copiar a Nota"
                className="inline-flex items-center gap-1 font-mono text-xs font-bold px-2 py-0.5 rounded bg-muted hover:bg-muted/80 text-foreground border border-border transition-colors cursor-pointer"
              >
                <span>Nota {o.numero_nota}</span>
                {copiedItem === 'Nota' ? (
                  <Check className="size-3 text-emerald-500" />
                ) : (
                  <Copy className="size-3 text-muted-foreground" />
                )}
              </button>
            )}

            <Badge variant="outline" className="font-medium">
              {o.tipo_ocorrencia.replace(/_/g, ' ')}
            </Badge>

            {o.status_ordem && (
              <Badge variant="secondary" className="font-mono text-[10px]">
                {o.status_ordem}
              </Badge>
            )}
          </div>

          {/* Multiple PDF Reports Selector */}
          {o.mappings && o.mappings.length > 1 && (
            <div className="flex items-center gap-1 text-[11px] shrink-0">
              <span className="text-muted-foreground">PDF Vinculado:</span>
              <select
                value={activeMapping?.id || ''}
                onChange={(e) => {
                  const m = o.mappings.find((x) => x.id === e.target.value)
                  if (m && onMappingChange) onMappingChange(m)
                }}
                className="h-6 rounded border bg-background px-1.5 text-[11px]"
              >
                {o.mappings.map((m, idx) => (
                  <option key={m.id} value={m.id}>
                    Relatório {idx + 1} ({m.document_filename})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Title */}
        <h2 className="text-sm sm:text-base font-bold text-foreground leading-snug">
          {o.titulo}
        </h2>

        {/* Triage & Operational Action Controls */}
        <div className="pt-2.5 border-t border-border/60 grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-2">
          <Button
            size="sm"
            variant={o.flag_analisar ? 'default' : 'outline'}
            onClick={handleToggleAnalisar}
            className={cn(
              'h-9 sm:h-7 text-xs font-semibold gap-1.5 justify-center w-full sm:w-auto',
              o.flag_analisar && 'bg-sky-600 hover:bg-sky-700 text-white'
            )}
          >
            <Search className="size-3.5 sm:size-3" />
            <span>{o.flag_analisar ? 'Em Análise' : 'P/ Analisar'}</span>
          </Button>

          <Button
            size="sm"
            variant={o.flag_relevante ? 'default' : 'outline'}
            onClick={handleToggleRelevante}
            className={cn(
              'h-9 sm:h-7 text-xs font-semibold gap-1.5 justify-center w-full sm:w-auto',
              o.flag_relevante && 'bg-amber-600 hover:bg-amber-700 text-white'
            )}
          >
            <Star className={cn('size-3.5 sm:size-3', o.flag_relevante && 'fill-current')} />
            <span>{o.flag_relevante ? 'Relevante' : 'Relevância'}</span>
          </Button>

          {/* Status ATC Picker */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:ml-auto w-full sm:w-auto">
            <span className="text-muted-foreground text-[10px] sm:text-[11px] font-medium">
              Status ATC:
            </span>
            <select
              value={o.status_atc}
              onChange={handleStatusChange}
              className="h-9 sm:h-7 rounded-md border bg-background px-2 text-xs font-bold text-foreground focus:ring-1 focus:ring-primary w-full sm:w-auto"
            >
              <option value="NOVO">NOVO</option>
              <option value="EM_ANALISE">EM ANÁLISE</option>
              <option value="AGUARDANDO_PARADA">AGUARDANDO PARADA</option>
              <option value="ENCAMINHADO_INSPECAO">ENCAMINHADO INSPEÇÃO</option>
              <option value="JUMP_ATIVO">JUMP ATIVO</option>
              <option value="CONCLUIDO">CONCLUÍDO</option>
            </select>
          </div>

          {/* Prioridade ATC Picker */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 w-full sm:w-auto">
            <span className="text-muted-foreground text-[10px] sm:text-[11px] font-medium">
              Prioridade:
            </span>
            <select
              value={o.prioridade_atc || ''}
              onChange={handlePriorityChange}
              className="h-9 sm:h-7 rounded-md border bg-background px-2 text-xs text-foreground focus:ring-1 focus:ring-primary w-full sm:w-auto"
            >
              <option value="">(Sem prioridade)</option>
              <option value="BAIXA">Baixa</option>
              <option value="MEDIA">Média</option>
              <option value="ALTA">Alta</option>
              <option value="CRITICA">Crítica</option>
            </select>
          </div>
        </div>

        {/* Jump Active Status Banner */}
        {o.tem_jump_force && (
          <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <div>
                <p className="font-bold text-amber-900 dark:text-amber-200">
                  By-pass ou Jump Provisório Registrado
                </p>
                <p className="text-[11px] text-amber-800 dark:text-amber-300">
                  Status atual: <b className="uppercase">{o.jump_status || 'PENDENTE'}</b>
                  {o.jump_retirado_em && ` (Retirado em: ${o.jump_retirado_em.split('T')[0]})`}
                </p>
              </div>
            </div>
            <Button
              size="xs"
              variant={o.jump_status === 'RETIRADO' ? 'outline' : 'jump'}
              onClick={handleJumpStatusToggle}
              className="shrink-0"
            >
              {o.jump_status === 'RETIRADO' ? 'Reabrir como Pendente' : 'Marcar como Retirado'}
            </Button>
          </div>
        )}
      </div>

      {/* Field: Posição Funcional & Ativo */}
      <div
        onClick={() => onHighlightField?.('posicao_funcional')}
        className={cn(
          'border rounded-xl p-3 sm:p-4 bg-card hover:border-primary/60 transition-colors space-y-1.5 group',
          onHighlightField && 'cursor-pointer'
        )}
      >
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="font-semibold text-foreground flex items-center gap-1.5">
            <Wrench className="size-3.5 text-primary" /> Posição Funcional & Ativo
          </span>
          {onHighlightField && (
            <span className="text-[11px] opacity-0 group-hover:opacity-100 text-primary flex items-center gap-1 font-medium transition-opacity">
              <Eye className="size-3" /> Ver no PDF
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm sm:text-base font-bold text-primary">
            {o.posicao_funcional || '(Não informada)'}
          </span>
          {o.posicao_funcional && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleCopy(o.posicao_funcional!, 'Tag')
              }}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              title="Copiar Tag"
            >
              {copiedItem === 'Tag' ? (
                <Check className="size-3.5 text-emerald-500" />
              ) : (
                <Copy className="size-3.5" />
              )}
            </button>
          )}
        </div>
        {o.descricao_posicao_funcional && (
          <p className="text-foreground leading-relaxed font-medium">
            {o.descricao_posicao_funcional}
          </p>
        )}
        {o.descricao_curta_objeto && (
          <p className="text-muted-foreground text-[11px]">
            Objeto Técnico: <span className="text-foreground">{o.descricao_curta_objeto}</span>
          </p>
        )}
      </div>

      {/* Field: Pane e Dados Operacionais */}
      <div
        onClick={() => onHighlightField?.('pane')}
        className={cn(
          'border rounded-xl p-3 sm:p-4 bg-card hover:border-primary/60 transition-colors space-y-2 group',
          onHighlightField && 'cursor-pointer'
        )}
      >
        <div className="flex items-center justify-between">
          <span className="font-semibold text-foreground flex items-center gap-1.5">
            <OctagonAlert
              className={cn('size-3.5', o.teve_pane ? 'text-red-500' : 'text-muted-foreground')}
            />
            Dados Operacionais & Pane
          </span>
          {onHighlightField && (
            <span className="text-[11px] opacity-0 group-hover:opacity-100 text-primary flex items-center gap-1 font-medium transition-opacity">
              <Eye className="size-3" /> Ver no PDF
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
          <div className="p-2 rounded-lg bg-muted/30">
            <span className="text-[11px] text-muted-foreground block">Houve Pane:</span>
            <p className={cn('font-bold mt-0.5', o.teve_pane ? 'text-red-600 dark:text-red-400' : 'text-foreground')}>
              {o.teve_pane ? `SIM (${Math.round(o.duracao_pane_min)} min)` : 'NÃO'}
            </p>
          </div>
          <div className="p-2 rounded-lg bg-muted/30">
            <span className="text-[11px] text-muted-foreground block">Duração Avaria:</span>
            <p className="font-bold text-foreground mt-0.5">
              {o.duracao_avaria_min ? `${Math.round(o.duracao_avaria_min)} min` : '-'}
            </p>
          </div>
          <div className="p-2 rounded-lg bg-muted/30">
            <span className="text-[11px] text-muted-foreground block">Turno:</span>
            <p className="font-bold text-foreground mt-0.5">
              {o.turno ? `Turno ${o.turno}` : '-'}
            </p>
          </div>
          <div className="p-2 rounded-lg bg-muted/30">
            <span className="text-[11px] text-muted-foreground block">Especialidade:</span>
            <p className="font-bold text-foreground mt-0.5">
              {o.especialidade}
            </p>
          </div>
        </div>
      </div>

      {/* Field: Modo de Falha (Defeito e Causa) */}
      {(o.defeito || o.causa) && (
        <div
          onClick={() => onHighlightField?.('defeito')}
          className={cn(
            'border rounded-xl p-3 sm:p-4 bg-card hover:border-primary/60 transition-colors space-y-2 group',
            onHighlightField && 'cursor-pointer'
          )}
        >
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <Zap className="size-3.5 text-amber-500" /> Modo de Falha SAP
            </span>
            {onHighlightField && (
              <span className="text-[11px] opacity-0 group-hover:opacity-100 text-primary flex items-center gap-1 font-medium transition-opacity">
                <Eye className="size-3" /> Ver no PDF
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-2.5 rounded-lg bg-muted/20 border border-border/40">
              <span className="text-[11px] text-muted-foreground font-semibold block">Defeito:</span>
              <p className="font-medium text-foreground mt-0.5">{o.defeito || '-'}</p>
            </div>
            <div className="p-2.5 rounded-lg bg-muted/20 border border-border/40">
              <span className="text-[11px] text-muted-foreground font-semibold block">Causa Raiz:</span>
              <p className="font-medium text-foreground mt-0.5">{o.causa || '-'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Field: Descrição Longa da Notificação */}
      {o.descricao_longa_notificacao && (
        <div
          onClick={() => onHighlightField?.('descricao_longa_notificacao')}
          className={cn(
            'border rounded-xl p-3 sm:p-4 bg-card hover:border-primary/60 transition-colors space-y-2 group',
            onHighlightField && 'cursor-pointer'
          )}
        >
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <FileText className="size-3.5 text-primary" /> Descrição Longa da Notificação
            </span>
            {onHighlightField && (
              <span className="text-[11px] opacity-0 group-hover:opacity-100 text-primary flex items-center gap-1 font-medium transition-opacity">
                <Eye className="size-3" /> Ver no PDF
              </span>
            )}
          </div>
          <p className="text-foreground leading-relaxed whitespace-pre-line bg-muted/30 p-3 rounded-lg border border-border/40 font-mono text-[11px]">
            {o.descricao_longa_notificacao}
          </p>
        </div>
      )}

      {/* Field: Descrição Longa da Ordem */}
      {o.descricao_longa_ordem && (
        <div
          onClick={() => onHighlightField?.('descricao_longa_ordem')}
          className={cn(
            'border rounded-xl p-3 sm:p-4 bg-card hover:border-primary/60 transition-colors space-y-2 group',
            onHighlightField && 'cursor-pointer'
          )}
        >
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <FileText className="size-3.5 text-primary" /> Descrição Longa da Ordem
            </span>
            {onHighlightField && (
              <span className="text-[11px] opacity-0 group-hover:opacity-100 text-primary flex items-center gap-1 font-medium transition-opacity">
                <Eye className="size-3" /> Ver no PDF
              </span>
            )}
          </div>
          <p className="text-foreground leading-relaxed whitespace-pre-line bg-muted/30 p-3 rounded-lg border border-border/40 font-mono text-[11px]">
            {o.descricao_longa_ordem}
          </p>
        </div>
      )}

      {/* Field: Operações de Manutenção */}
      {o.operacoes && o.operacoes.length > 0 && (
        <div
          onClick={() => onHighlightField?.('operacoes')}
          className={cn(
            'border rounded-xl p-3 sm:p-4 bg-card hover:border-primary/60 transition-colors space-y-2 group',
            onHighlightField && 'cursor-pointer'
          )}
        >
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <ListOrdered className="size-3.5 text-primary" /> Operações Registradas ({o.operacoes.length})
            </span>
            {onHighlightField && (
              <span className="text-[11px] opacity-0 group-hover:opacity-100 text-primary flex items-center gap-1 font-medium transition-opacity">
                <Eye className="size-3" /> Ver no PDF
              </span>
            )}
          </div>
          <div className="space-y-1.5">
            {o.operacoes.map((op, i) => (
              <div
                key={i}
                className="flex items-start gap-2 text-xs p-2 rounded-lg bg-muted/20 border border-border/30"
              >
                <span className="font-mono font-bold text-primary px-1.5 py-0.5 rounded bg-primary/10 shrink-0">
                  {op.numero}
                </span>
                <span className="text-foreground mt-0.5">{op.descricao}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Field: Executantes, HH e Apontamentos */}
      {o.confirmations && o.confirmations.length > 0 && (
        <div
          onClick={() => onHighlightField?.('confirmacoes')}
          className={cn(
            'border rounded-xl p-3 sm:p-4 bg-card hover:border-primary/60 transition-colors space-y-2 group',
            onHighlightField && 'cursor-pointer'
          )}
        >
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <Users className="size-3.5 text-primary" /> Executantes e HH ({o.hh_total_minutos} min)
            </span>
            {onHighlightField && (
              <span className="text-[11px] opacity-0 group-hover:opacity-100 text-primary flex items-center gap-1 font-medium transition-opacity">
                <Eye className="size-3" /> Ver no PDF
              </span>
            )}
          </div>
          <div className="overflow-x-auto rounded-lg border border-border/50">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 border-b border-border/50 text-muted-foreground">
                <tr>
                  <th className="py-1.5 px-2 font-semibold">Nome</th>
                  <th className="py-1.5 px-2 font-semibold">Centro</th>
                  <th className="py-1.5 px-2 font-semibold">Matrícula</th>
                  <th className="py-1.5 px-2 text-right font-semibold">Duração</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {o.confirmations.map((c, i) => (
                  <tr key={i} className="hover:bg-muted/20">
                    <td className="py-1.5 px-2 font-medium text-foreground">{c.nome_executante || '-'}</td>
                    <td className="py-1.5 px-2 text-muted-foreground">{c.centro_trabalho || '-'}</td>
                    <td className="py-1.5 px-2 font-mono text-muted-foreground">{c.matricula || '-'}</td>
                    <td className="py-1.5 px-2 text-right font-bold text-foreground">{c.duracao_min} min</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {o.texto_confirmacao && (
            <p className="text-[11px] text-muted-foreground italic bg-muted/20 p-2 rounded-lg border border-border/30 mt-1">
              "{o.texto_confirmacao}"
            </p>
          )}
        </div>
      )}

      {/* ATC Engineering Pareceres & Action Items */}
      <div className="border rounded-xl p-3 sm:p-4 bg-card space-y-3 shadow-2xs">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-foreground flex items-center gap-1.5">
            <MessageSquare className="size-3.5 text-primary" /> Parecer Técnico & Ações ATC ({o.comments.length})
          </span>
        </div>

        {/* Form to add a new comment */}
        <form onSubmit={handleAddComment} className="space-y-2">
          <Textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault()
                handleAddComment()
              }
            }}
            placeholder="Adicione um parecer técnico, causa provável ou ação preventiva para este ativo... (Ctrl+Enter para enviar)"
            className="text-xs min-h-[70px] resize-y"
          />
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isActionItem}
                onChange={(e) => setIsActionItem(e.target.checked)}
                className="size-4 rounded border-border text-primary focus:ring-primary"
              />
              <span className={cn(isActionItem && 'font-bold text-red-600 dark:text-red-400')}>
                Marcar como Item de Ação
              </span>
            </label>
            <Button
              size="xs"
              type="submit"
              disabled={submittingComment || !commentText.trim()}
              className="gap-1 font-semibold"
            >
              <Send className="size-3" />
              <span>Registrar</span>
            </Button>
          </div>
        </form>

        {/* Existing Comments List */}
        <div className="space-y-2 pt-2 border-t border-border/50">
          {o.comments.map((c) => (
            <div
              key={c.id}
              className={cn(
                'p-2.5 rounded-lg border text-xs space-y-1 transition-all',
                c.is_action_item
                  ? 'bg-red-500/5 border-red-500/30 dark:bg-red-950/20'
                  : 'bg-muted/30 border-border/40'
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-foreground">{c.author_name}</span>
                  {c.is_action_item && (
                    <Badge variant="destructive" className="text-[10px] py-0 px-1.5 h-4">
                      Item de Ação
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {new Date(c.created_at).toLocaleString('pt-BR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </span>
                  <button
                    onClick={() => handleDeleteComment(c.id)}
                    className="text-muted-foreground hover:text-red-500 p-0.5 rounded transition-colors"
                    title="Excluir parecer"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-foreground leading-relaxed whitespace-pre-line text-[11px] sm:text-xs">
                {c.comment_text}
              </p>
            </div>
          ))}
          {o.comments.length === 0 && (
            <p className="text-[11px] text-muted-foreground italic text-center py-2">
              Nenhum parecer técnico registrado para esta ocorrência.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
