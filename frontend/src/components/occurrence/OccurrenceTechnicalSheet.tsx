import React, { useState } from 'react'
import { occurrencesApi } from '@/api'
import type { FieldKey, Mapping, OccurrenceDetail, PrioridadeATC, StatusATC } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  ListOrdered,
  MessageSquare,
  OctagonAlert,
  Send,
  Star,
  Tag,
  Trash2,
  Users,
  Wrench,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface OccurrenceTechnicalSheetProps {
  occurrence: OccurrenceDetail
  activeMapping?: Mapping | null
  onMappingChange?: (m: Mapping) => void
  onHighlightField: (key: FieldKey) => void
  onOccurrenceUpdated: (updated: OccurrenceDetail) => void
}

export function OccurrenceTechnicalSheet({
  occurrence: o,
  activeMapping,
  onMappingChange,
  onHighlightField,
  onOccurrenceUpdated,
}: OccurrenceTechnicalSheetProps) {
  const [commentText, setCommentText] = useState('')
  const [isActionItem, setIsActionItem] = useState(false)
  const [submittingComment, setSubmittingComment] = useState(false)

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

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault()
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
    <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs bg-background">
      {/* Top Header Card */}
      <div className="border rounded-lg p-3 bg-card shadow-2xs space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono text-sm font-bold text-foreground">
              {o.numero_ordem ? `Ordem ${o.numero_ordem}` : `Nota ${o.numero_nota || '-'}`}
            </span>
            {o.numero_nota && o.numero_ordem && (
              <span className="text-muted-foreground text-[11px]">(Nota: {o.numero_nota})</span>
            )}
            <Badge variant="outline">{o.tipo_ocorrencia.replace('_', ' ')}</Badge>
            {o.status_ordem && <Badge variant="secondary">{o.status_ordem}</Badge>}
          </div>

          {/* PDF Source Selector if mapped to multiple PDFs */}
          {o.mappings && o.mappings.length > 1 && (
            <div className="flex items-center gap-1 text-[11px]">
              <span className="text-muted-foreground">PDF:</span>
              <select
                value={activeMapping?.id || ''}
                onChange={(e) => {
                  const m = o.mappings.find((x) => x.id === e.target.value)
                  if (m && onMappingChange) onMappingChange(m)
                }}
                className="h-6 rounded border bg-background px-1 text-[11px]"
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

        <h2 className="text-sm font-bold text-foreground leading-snug">{o.titulo}</h2>

        {/* ATC Control Toolbar */}
        <div className="pt-2 border-t flex flex-wrap items-center gap-2">
          <Button
            size="xs"
            variant={o.flag_analisar ? 'default' : 'outline'}
            onClick={handleToggleAnalisar}
          >
            Analisar
          </Button>

          <Button
            size="xs"
            variant={o.flag_relevante ? 'default' : 'outline'}
            onClick={handleToggleRelevante}
          >
            <Star className="size-3 fill-current mr-1" />
            Relevante
          </Button>

          <div className="flex items-center gap-1 ml-auto">
            <span className="text-muted-foreground text-[11px]">Status ATC:</span>
            <select
              value={o.status_atc}
              onChange={handleStatusChange}
              className="h-6 rounded border bg-background px-1.5 text-[11px] font-semibold"
            >
              <option value="NOVO">NOVO</option>
              <option value="EM_ANALISE">EM ANÁLISE</option>
              <option value="AGUARDANDO_PARADA">AGUARDANDO PARADA</option>
              <option value="ENCAMINHADO_INSPECAO">ENCAMINHADO INSPEÇÃO</option>
              <option value="JUMP_ATIVO">JUMP ATIVO</option>
              <option value="CONCLUIDO">CONCLUÍDO</option>
            </select>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-muted-foreground text-[11px]">Prioridade:</span>
            <select
              value={o.prioridade_atc || ''}
              onChange={handlePriorityChange}
              className="h-6 rounded border bg-background px-1.5 text-[11px]"
            >
              <option value="">(Nenhuma)</option>
              <option value="BAIXA">Baixa</option>
              <option value="MEDIA">Média</option>
              <option value="ALTA">Alta</option>
              <option value="CRITICA">Crítica</option>
            </select>
          </div>
        </div>

        {/* Jump Active Status Banner */}
        {o.tem_jump_force && (
          <div className="p-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-600" />
              <div>
                <p className="font-bold text-amber-800 dark:text-amber-300">
                  By-pass ou Jump Provisório Registrado
                </p>
                <p className="text-[10px] text-amber-700 dark:text-amber-400">
                  Status atual: <b>{o.jump_status || 'PENDENTE'}</b>
                  {o.jump_retirado_em && ` (Retirado em: ${o.jump_retirado_em.split('T')[0]})`}
                </p>
              </div>
            </div>
            <Button
              size="xs"
              variant={o.jump_status === 'RETIRADO' ? 'outline' : 'jump'}
              onClick={handleJumpStatusToggle}
            >
              {o.jump_status === 'RETIRADO' ? 'Reabrir como Pendente' : 'Marcar como Retirado'}
            </Button>
          </div>
        )}
      </div>

      {/* Field: Posição Funcional */}
      <div
        onClick={() => onHighlightField('posicao_funcional')}
        className="border rounded-lg p-3 bg-card hover:border-primary cursor-pointer transition-colors space-y-1 group"
      >
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="font-semibold text-foreground flex items-center gap-1.5">
            <Wrench className="size-3.5 text-primary" /> Posição Funcional & Ativo
          </span>
          <span className="text-[10px] opacity-0 group-hover:opacity-100 text-primary flex items-center gap-1">
            <Eye className="size-3" /> Ver no PDF
          </span>
        </div>
        <p className="font-mono text-sm font-bold text-primary">{o.posicao_funcional || '(Não informada)'}</p>
        {o.descricao_posicao_funcional && (
          <p className="text-foreground leading-relaxed">{o.descricao_posicao_funcional}</p>
        )}
        {o.descricao_curta_objeto && (
          <p className="text-muted-foreground text-[11px]">Objeto: {o.descricao_curta_objeto}</p>
        )}
      </div>

      {/* Field: Pane e Avaria */}
      <div
        onClick={() => onHighlightField('pane')}
        className="border rounded-lg p-3 bg-card hover:border-primary cursor-pointer transition-colors space-y-1.5 group"
      >
        <div className="flex items-center justify-between">
          <span className="font-semibold text-foreground flex items-center gap-1.5">
            <OctagonAlert className={cn('size-3.5', o.teve_pane ? 'text-red-500' : 'text-muted-foreground')} />
            Dados Operacionais e Pane
          </span>
          <span className="text-[10px] opacity-0 group-hover:opacity-100 text-primary flex items-center gap-1">
            <Eye className="size-3" /> Ver no PDF
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] pt-1">
          <div>
            <span className="text-muted-foreground">Houve Pane:</span>
            <p className={cn('font-bold', o.teve_pane ? 'text-red-600' : 'text-foreground')}>
              {o.teve_pane ? `SIM (${Math.round(o.duracao_pane_min)} min)` : 'NÃO'}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Duração da Avaria:</span>
            <p className="font-bold text-foreground">
              {o.duracao_avaria_min ? `${Math.round(o.duracao_avaria_min)} min` : '-'}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Turno / Especialidade:</span>
            <p className="font-bold text-foreground">
              {o.turno || '-'} ({o.especialidade})
            </p>
          </div>
        </div>
      </div>

      {/* Field: Defeito e Causa */}
      {(o.defeito || o.causa) && (
        <div
          onClick={() => onHighlightField('defeito')}
          className="border rounded-lg p-3 bg-card hover:border-primary cursor-pointer transition-colors space-y-1.5 group"
        >
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <Zap className="size-3.5 text-amber-500" /> Modo de Falha
            </span>
            <span className="text-[10px] opacity-0 group-hover:opacity-100 text-primary flex items-center gap-1">
              <Eye className="size-3" /> Ver no PDF
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
            <div>
              <span className="text-muted-foreground">Defeito:</span>
              <p className="font-medium text-foreground">{o.defeito || '-'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Causa Raiz:</span>
              <p className="font-medium text-foreground">{o.causa || '-'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Field: Descrição Longa da Notificação */}
      {o.descricao_longa_notificacao && (
        <div
          onClick={() => onHighlightField('descricao_longa_notificacao')}
          className="border rounded-lg p-3 bg-card hover:border-primary cursor-pointer transition-colors space-y-1.5 group"
        >
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <FileText className="size-3.5 text-primary" /> Descrição Longa da Notificação
            </span>
            <span className="text-[10px] opacity-0 group-hover:opacity-100 text-primary flex items-center gap-1">
              <Eye className="size-3" /> Ver no PDF
            </span>
          </div>
          <p className="text-foreground leading-relaxed whitespace-pre-line bg-muted/30 p-2 rounded">
            {o.descricao_longa_notificacao}
          </p>
        </div>
      )}

      {/* Field: Descrição Longa da Ordem */}
      {o.descricao_longa_ordem && (
        <div
          onClick={() => onHighlightField('descricao_longa_ordem')}
          className="border rounded-lg p-3 bg-card hover:border-primary cursor-pointer transition-colors space-y-1.5 group"
        >
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <FileText className="size-3.5 text-primary" /> Descrição Longa da Ordem
            </span>
            <span className="text-[10px] opacity-0 group-hover:opacity-100 text-primary flex items-center gap-1">
              <Eye className="size-3" /> Ver no PDF
            </span>
          </div>
          <p className="text-foreground leading-relaxed whitespace-pre-line bg-muted/30 p-2 rounded">
            {o.descricao_longa_ordem}
          </p>
        </div>
      )}

      {/* Field: Operações */}
      {o.operacoes && o.operacoes.length > 0 && (
        <div
          onClick={() => onHighlightField('operacoes')}
          className="border rounded-lg p-3 bg-card hover:border-primary cursor-pointer transition-colors space-y-1.5 group"
        >
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <ListOrdered className="size-3.5 text-primary" /> Operações de Manutenção ({o.operacoes.length})
            </span>
            <span className="text-[10px] opacity-0 group-hover:opacity-100 text-primary flex items-center gap-1">
              <Eye className="size-3" /> Ver no PDF
            </span>
          </div>
          <div className="space-y-1">
            {o.operacoes.map((op, i) => (
              <div key={i} className="flex gap-2 text-[11px] py-0.5 border-b border-border/40 last:border-0">
                <span className="font-mono font-bold text-primary shrink-0">{op.numero}</span>
                <span className="text-foreground">{op.descricao}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Field: Confirmações e HH */}
      {o.confirmations && o.confirmations.length > 0 && (
        <div
          onClick={() => onHighlightField('confirmacoes')}
          className="border rounded-lg p-3 bg-card hover:border-primary cursor-pointer transition-colors space-y-1.5 group"
        >
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <Users className="size-3.5 text-primary" /> Executantes e Apontamentos ({o.hh_total_minutos} min)
            </span>
            <span className="text-[10px] opacity-0 group-hover:opacity-100 text-primary flex items-center gap-1">
              <Eye className="size-3" /> Ver no PDF
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="py-1">Nome</th>
                  <th className="py-1">Centro</th>
                  <th className="py-1">Matrícula</th>
                  <th className="py-1 text-right">Duração</th>
                </tr>
              </thead>
              <tbody>
                {o.confirmations.map((c, i) => (
                  <tr key={i} className="border-b border-border/30 last:border-0">
                    <td className="py-1 font-medium text-foreground">{c.nome_executante || '-'}</td>
                    <td className="py-1 text-muted-foreground">{c.centro_trabalho || '-'}</td>
                    <td className="py-1 font-mono text-muted-foreground">{c.matricula || '-'}</td>
                    <td className="py-1 text-right font-bold text-foreground">{c.duracao_min} min</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {o.texto_confirmacao && (
            <p className="text-[11px] text-muted-foreground italic bg-muted/20 p-1.5 rounded mt-1">
              {o.texto_confirmacao}
            </p>
          )}
        </div>
      )}

      {/* ATC Comments & Engineering Notes */}
      <div className="border rounded-lg p-3 bg-card space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-foreground flex items-center gap-1.5">
            <MessageSquare className="size-3.5 text-primary" /> Parecer Técnico & Ações do ATC ({o.comments.length})
          </span>
        </div>

        {/* Add comment form */}
        <form onSubmit={handleAddComment} className="space-y-2">
          <Textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Adicione um parecer técnico, causa provável ou ação preventiva para este ativo..."
            className="text-xs"
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={isActionItem}
                onChange={(e) => setIsActionItem(e.target.checked)}
                className="size-3.5"
              />
              Marcar como Item de Ação
            </label>
            <Button size="xs" type="submit" disabled={submittingComment || !commentText.trim()}>
              <Send className="size-3 mr-1" /> Registrar
            </Button>
          </div>
        </form>

        {/* Comments List */}
        <div className="space-y-2 pt-2 border-t">
          {o.comments.map((c) => (
            <div key={c.id} className="p-2 rounded bg-muted/30 border border-border/40 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-foreground">{c.author_name}</span>
                  {c.is_action_item && <Badge variant="destructive">Item de Ação</Badge>}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(c.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                  <button
                    onClick={() => handleDeleteComment(c.id)}
                    className="text-muted-foreground hover:text-red-500 p-0.5 ml-1"
                    title="Excluir comentário"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              </div>
              <p className="text-foreground leading-relaxed whitespace-pre-line">{c.comment_text}</p>
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
