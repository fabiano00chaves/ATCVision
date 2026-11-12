import React, { useState } from 'react'
import { occurrencesApi } from '@/api'
import type { FieldKey, Mapping, OccurrenceDetail, PrioridadeATC, StatusATC } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Eye,
  FileText,
  Layers,
  ListOrdered,
  MessageSquare,
  OctagonAlert,
  PanelRightClose,
  PanelRightOpen,
  Presentation,
  Search,
  Send,
  Star,
  Trash2,
  Users,
  Wrench,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn, copyToClipboard } from '@/lib/utils'
import { fmtNaiveDate, fmtNaiveDateTime, fmtTime, parseNaive } from '@/lib/datetime'
import {
  useTechnicalSheetConfig,
  type TechnicalSheetSectionKey,
} from '@/hooks/useTechnicalSheetConfig'
import { TechnicalSheetConfigMenu } from '@/components/occurrence/TechnicalSheetConfigMenu'

interface OccurrenceTechnicalSheetProps {
  occurrence: OccurrenceDetail
  activeMapping?: Mapping | null
  onMappingChange?: (m: Mapping) => void
  onHighlightField?: (key: FieldKey) => void
  onOccurrenceUpdated: (updated: OccurrenceDetail) => void
  onFilterLocation?: (pf: string) => void
  sameLocationCount?: number
  onPrevious?: () => void
  onNext?: () => void
  hasPrevious?: boolean
  hasNext?: boolean
  currentIndex?: number
  totalCount?: number
  pdfCollapsed?: boolean
  onTogglePdfCollapse?: () => void
  isMobileModal?: boolean
  onCloseMobile?: () => void
  onViewPdfMobile?: () => void
}

interface SectionCardShellProps {
  sectionKey: TechnicalSheetSectionKey
  title: React.ReactNode
  collapsedSummary?: React.ReactNode
  visibility: 'expanded' | 'collapsed' | 'hidden'
  isFirst: boolean
  isLast: boolean
  onToggle: () => void
  onMove: (dir: 'up' | 'down') => void
  onHighlight?: () => void
  highlightTitle?: string
  children: React.ReactNode
}

function SectionCardShell({
  title,
  collapsedSummary,
  visibility,
  isFirst,
  isLast,
  onToggle,
  onMove,
  onHighlight,
  highlightTitle = 'Clique para localizar no PDF',
  children,
}: SectionCardShellProps) {
  if (visibility === 'hidden') return null

  return (
    <div className="border rounded-xl bg-card shadow-2xs overflow-hidden transition-all hover:border-primary/50 group/card">
      <div className="px-3 py-2.5 sm:px-3.5 flex items-center justify-between text-muted-foreground bg-muted/10 border-b border-border/40 select-none gap-2">
        <div
          onClick={onHighlight}
          className={cn(
            'flex items-center gap-2 truncate flex-1 py-0.5',
            onHighlight ? 'cursor-pointer hover:text-primary transition-colors' : 'cursor-pointer'
          )}
          title={onHighlight ? highlightTitle : undefined}
        >
          <span className="font-semibold text-foreground flex items-center gap-1.5 shrink-0">
            {title}
          </span>
          {visibility === 'collapsed' && collapsedSummary}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Quick Inline Reorder Arrows */}
          <div className="hidden sm:flex items-center opacity-35 group-hover/card:opacity-100 transition-opacity mr-0.5">
            <button
              type="button"
              disabled={isFirst}
              onClick={(e) => {
                e.stopPropagation()
                onMove('up')
              }}
              className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:pointer-events-none cursor-pointer"
              title="Mover este card para cima"
            >
              <ArrowUp className="size-3" />
            </button>
            <button
              type="button"
              disabled={isLast}
              onClick={(e) => {
                e.stopPropagation()
                onMove('down')
              }}
              className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:pointer-events-none cursor-pointer"
              title="Mover este card para baixo"
            >
              <ArrowDown className="size-3" />
            </button>
          </div>

          {onHighlight && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onHighlight()
              }}
              className="text-[11px] text-primary flex items-center gap-1 font-medium hover:underline cursor-pointer mr-1"
              title="Destacar no PDF"
            >
              <Eye className="size-3" />
              <span className="hidden sm:inline">Ver no PDF</span>
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggle()
            }}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
            title={visibility === 'expanded' ? 'Recolher campo' : 'Expandir campo'}
          >
            {visibility === 'expanded' ? (
              <ChevronUp className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
          </button>
        </div>
      </div>

      {visibility === 'expanded' && children}
    </div>
  )
}

export function OccurrenceTechnicalSheet({
  occurrence: o,
  activeMapping,
  onMappingChange,
  onHighlightField,
  onOccurrenceUpdated,
  onFilterLocation,
  sameLocationCount,
  onPrevious,
  onNext,
  hasPrevious = false,
  hasNext = false,
  currentIndex,
  totalCount,
  pdfCollapsed = false,
  onTogglePdfCollapse,
  isMobileModal = false,
}: OccurrenceTechnicalSheetProps) {
  const [commentText, setCommentText] = useState('')
  const [isActionItem, setIsActionItem] = useState(false)
  const [submittingComment, setSubmittingComment] = useState(false)
  const [copiedItem, setCopiedItem] = useState<string | null>(null)

  const {
    config,
    order,
    toggleSection,
    setSectionVisibility,
    setAllSections,
    moveSection,
    reorderSections,
    applyReadingPreset,
    resetToDefault,
  } = useTechnicalSheetConfig()

  const locCount = Math.max(o.same_location_count ?? 1, sameLocationCount ?? 1)
  const isMeetingHighlight = Boolean(o.flag_destaque_reuniao)

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

  const handleToggleReuniao = async () => {
    try {
      const nextVal = !isMeetingHighlight
      const updated = await occurrencesApi.patch(o.id, { flag_destaque_reuniao: nextVal })
      onOccurrenceUpdated(updated)
      toast.success(
        updated.flag_destaque_reuniao
          ? 'Destacado para a Pauta da Reunião Diária'
          : 'Removido da Pauta da Reunião Diária'
      )
    } catch {
      toast.error('Erro ao atualizar destaque de reunião')
    }
  }

  const handleStatusChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value as StatusATC
    try {
      const updated = await occurrencesApi.patch(o.id, { status_atc: val })
      onOccurrenceUpdated(updated)
      toast.success(`Status ATC alterado para: ${val}`)
    } catch {
      toast.error('Erro ao alterar status')
    }
  }

  const handlePriorityChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = (e.target.value || null) as PrioridadeATC | null
    try {
      const updated = await occurrencesApi.patch(o.id, { prioridade_atc: val })
      onOccurrenceUpdated(updated)
      toast.success('Prioridade alterada')
    } catch {
      toast.error('Erro ao alterar prioridade')
    }
  }

  const handleJumpStatusToggle = async () => {
    const nextStatus = o.jump_status === 'RETIRADO' ? 'PENDENTE' : 'RETIRADO'
    try {
      const updated = await occurrencesApi.patch(o.id, {
        jump_status: nextStatus,
      })
      onOccurrenceUpdated(updated)
      toast.success(
        nextStatus === 'RETIRADO'
          ? 'Jump/Bypass marcado como RETIRADO'
          : 'Jump reaberto como PENDENTE'
      )
    } catch {
      toast.error('Erro ao atualizar status do Jump')
    }
  }

  const handleAddComment = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!commentText.trim()) return

    try {
      setSubmittingComment(true)
      await occurrencesApi.addComment(o.id, commentText.trim(), isActionItem)
      setCommentText('')
      setIsActionItem(false)
      const fresh = await occurrencesApi.get(o.id)
      onOccurrenceUpdated(fresh)
      toast.success('Parecer técnico registrado com sucesso')
    } catch {
      toast.error('Erro ao registrar parecer')
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

  // Format Opening & Confirmation display strings concisely without UTC timezone shifts
  const aberturaFormatted = formatFullOpeningDate(
    o.data_abertura,
    o.hora_abertura,
    o.abertura_timestamp
  )
  const confirmacaoFormatted = formatFullConfirmationDate(o.ultima_confirmacao_em)
  const openingDay = o.data_abertura?.split('T')[0]
  const confDay = o.ultima_confirmacao_em?.split('T')[0]
  const confOnDifferentDay = Boolean(openingDay && confDay && openingDay !== confDay)

  // Filter visible & applicable sections so Up/Down arrow disabled states align with visible cards
  const renderSection = (key: TechnicalSheetSectionKey, idx: number, totalKeys: number) => {
    const isFirst = idx === 0
    const isLast = idx === totalKeys - 1

    switch (key) {
      case 'posicao_funcional':
        return (
          <SectionCardShell
            key={key}
            sectionKey={key}
            visibility={config.posicao_funcional}
            isFirst={isFirst}
            isLast={isLast}
            onToggle={() => toggleSection(key)}
            onMove={(dir) => moveSection(key, dir)}
            onHighlight={() => onHighlightField?.('posicao_funcional')}
            highlightTitle="Clique para localizar a Posição Funcional no PDF"
            title={
              <>
                <Wrench className="size-3.5 text-primary" /> Posição Funcional &amp; Ativo
                {locCount > 1 && (
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border-indigo-500/30">
                    {locCount}x local
                  </Badge>
                )}
              </>
            }
            collapsedSummary={
              <span className="font-mono text-xs font-bold text-primary truncate max-w-[200px] sm:max-w-xs ml-1">
                {o.posicao_funcional || '(Não informada)'}
              </span>
            }
          >
            <div
              onClick={() => onHighlightField?.('posicao_funcional')}
              className="p-3 pt-3 sm:p-4 sm:pt-3 space-y-2 cursor-pointer hover:bg-muted/15 transition-colors group/body"
              title="Clique no texto para destacar no PDF"
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm sm:text-base font-bold text-primary">
                    {o.posicao_funcional || '(Não informada)'}
                  </span>
                  {o.posicao_funcional && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleCopy(o.posicao_funcional!, 'Tag')
                      }}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                      title="Copiar Tag"
                    >
                      {copiedItem === 'Tag' ? (
                        <Check className="size-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                    </button>
                  )}
                  {locCount > 1 && o.posicao_funcional && onFilterLocation && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onFilterLocation(o.posicao_funcional!)
                      }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 text-[11px] font-bold cursor-pointer transition-colors"
                      title="Filtrar ocorrências neste mesmo local"
                    >
                      <Layers className="size-3" />
                      <span>Ver {locCount} registros deste local</span>
                    </button>
                  )}
                </div>
                {onHighlightField && (
                  <span className="text-[11px] text-primary opacity-0 group-hover/body:opacity-100 transition-opacity flex items-center gap-1 shrink-0 font-medium">
                    <Eye className="size-3" /> Destacar no PDF
                  </span>
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
          </SectionCardShell>
        )

      case 'dados_operacionais':
        return (
          <SectionCardShell
            key={key}
            sectionKey={key}
            visibility={config.dados_operacionais}
            isFirst={isFirst}
            isLast={isLast}
            onToggle={() => toggleSection(key)}
            onMove={(dir) => moveSection(key, dir)}
            onHighlight={() => onHighlightField?.('pane')}
            highlightTitle="Clique para localizar no PDF"
            title={
              <>
                <OctagonAlert
                  className={cn('size-3.5', o.teve_pane ? 'text-red-500' : 'text-muted-foreground')}
                />
                Dados Operacionais &amp; Pane
              </>
            }
            collapsedSummary={
              <span className="text-[11px] text-muted-foreground truncate hidden sm:inline ml-1">
                • Pane: <b className={o.teve_pane ? 'text-red-500' : ''}>{o.teve_pane ? 'SIM' : 'NÃO'}</b>
                {o.turno && ` • Turno ${o.turno}`}
                {o.especialidade && ` • ${o.especialidade}`}
              </span>
            }
          >
            <div
              onClick={() => onHighlightField?.('pane')}
              className="p-3 sm:p-4 cursor-pointer hover:bg-muted/15 transition-colors group/body"
              title="Clique para destacar no PDF"
            >
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <div
                  onClick={(e) => {
                    e.stopPropagation()
                    onHighlightField?.('pane')
                  }}
                  className="p-2 rounded-lg bg-muted/30 hover:border-primary/60 border border-transparent transition-colors cursor-pointer"
                  title="Clique para destacar Pane no PDF"
                >
                  <span className="text-[11px] text-muted-foreground block">Houve Pane:</span>
                  <p className={cn('font-bold mt-0.5', o.teve_pane ? 'text-red-600 dark:text-red-400' : 'text-foreground')}>
                    {o.teve_pane ? `SIM (${Math.round(o.duracao_pane_min)} min)` : 'NÃO'}
                  </p>
                </div>
                <div
                  onClick={(e) => {
                    e.stopPropagation()
                    onHighlightField?.('avaria')
                  }}
                  className="p-2 rounded-lg bg-muted/30 hover:border-primary/60 border border-transparent transition-colors cursor-pointer"
                  title="Clique para destacar Avaria no PDF"
                >
                  <span className="text-[11px] text-muted-foreground block">Duração Avaria:</span>
                  <p className="font-bold text-foreground mt-0.5">
                    {o.duracao_avaria_min ? `${Math.round(o.duracao_avaria_min)} min` : '-'}
                  </p>
                </div>
                <div
                  onClick={(e) => {
                    e.stopPropagation()
                    onHighlightField?.('turno')
                  }}
                  className="p-2 rounded-lg bg-muted/30 hover:border-primary/60 border border-transparent transition-colors cursor-pointer"
                  title="Clique para destacar Turno no PDF"
                >
                  <span className="text-[11px] text-muted-foreground block">Turno:</span>
                  <p className="font-bold text-foreground mt-0.5">
                    {o.turno ? `Turno ${o.turno}` : '-'}
                  </p>
                </div>
                <div
                  onClick={(e) => {
                    e.stopPropagation()
                    onHighlightField?.('record')
                  }}
                  className="p-2 rounded-lg bg-muted/30 hover:border-primary/60 border border-transparent transition-colors cursor-pointer"
                  title="Clique para destacar Registro no PDF"
                >
                  <span className="text-[11px] text-muted-foreground block">Especialidade:</span>
                  <p className="font-bold text-foreground mt-0.5">{o.especialidade}</p>
                </div>
              </div>
            </div>
          </SectionCardShell>
        )

      case 'modo_falha':
        if (!o.defeito && !o.causa) return null
        return (
          <SectionCardShell
            key={key}
            sectionKey={key}
            visibility={config.modo_falha}
            isFirst={isFirst}
            isLast={isLast}
            onToggle={() => toggleSection(key)}
            onMove={(dir) => moveSection(key, dir)}
            onHighlight={() => onHighlightField?.('defeito')}
            highlightTitle="Clique para localizar o Modo de Falha no PDF"
            title={
              <>
                <Zap className="size-3.5 text-amber-500" /> Modo de Falha SAP
              </>
            }
            collapsedSummary={
              <span className="text-[11px] text-muted-foreground truncate hidden sm:inline ml-1">
                • {o.defeito || o.causa}
              </span>
            }
          >
            <div
              onClick={() => onHighlightField?.('defeito')}
              className="p-3 sm:p-4 cursor-pointer hover:bg-muted/15 transition-colors group/body"
              title="Clique para destacar no PDF"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div
                  onClick={(e) => {
                    e.stopPropagation()
                    onHighlightField?.('defeito')
                  }}
                  className="p-2.5 rounded-lg bg-muted/20 border border-border/40 hover:border-primary/60 transition-colors cursor-pointer"
                  title="Clique para destacar Defeito no PDF"
                >
                  <span className="text-[11px] text-muted-foreground font-semibold block">Defeito:</span>
                  <p className="font-medium text-foreground mt-0.5">{o.defeito || '-'}</p>
                </div>
                <div
                  onClick={(e) => {
                    e.stopPropagation()
                    onHighlightField?.('causa')
                  }}
                  className="p-2.5 rounded-lg bg-muted/20 border border-border/40 hover:border-primary/60 transition-colors cursor-pointer"
                  title="Clique para destacar Causa no PDF"
                >
                  <span className="text-[11px] text-muted-foreground font-semibold block">Causa Raiz:</span>
                  <p className="font-medium text-foreground mt-0.5">{o.causa || '-'}</p>
                </div>
              </div>
            </div>
          </SectionCardShell>
        )

      case 'descricao_notificacao':
        if (!o.descricao_longa_notificacao) return null
        return (
          <SectionCardShell
            key={key}
            sectionKey={key}
            visibility={config.descricao_notificacao}
            isFirst={isFirst}
            isLast={isLast}
            onToggle={() => toggleSection(key)}
            onMove={(dir) => moveSection(key, dir)}
            onHighlight={() => onHighlightField?.('descricao_longa_notificacao')}
            highlightTitle="Clique para localizar a Descrição da Notificação no PDF"
            title={
              <>
                <FileText className="size-3.5 text-primary" /> Descrição da Notificação
              </>
            }
            collapsedSummary={
              <span className="text-[11px] text-muted-foreground truncate font-mono max-w-[260px] hidden sm:inline ml-1">
                — {o.descricao_longa_notificacao.slice(0, 70)}...
              </span>
            }
          >
            <div
              onClick={() => onHighlightField?.('descricao_longa_notificacao')}
              className="p-3 sm:p-4 cursor-pointer hover:bg-muted/15 transition-colors group/desc"
              title="Clique no texto para destacar no PDF"
            >
              <div className="flex items-center justify-between text-[11px] text-muted-foreground pb-1">
                <span className="font-medium text-foreground">Texto extraído do documento:</span>
                {onHighlightField && (
                  <span className="text-primary text-[11px] font-semibold flex items-center gap-1 opacity-70 group-hover/desc:opacity-100 transition-opacity">
                    <Eye className="size-3" /> Destacar no PDF
                  </span>
                )}
              </div>
              <p className="text-foreground leading-relaxed whitespace-pre-line bg-muted/30 group-hover/desc:bg-muted/50 p-3 rounded-lg border border-border/40 group-hover/desc:border-primary/50 font-mono text-[11px] mt-1 transition-colors">
                {o.descricao_longa_notificacao}
              </p>
            </div>
          </SectionCardShell>
        )

      case 'descricao_ordem':
        if (!o.descricao_longa_ordem) return null
        return (
          <SectionCardShell
            key={key}
            sectionKey={key}
            visibility={config.descricao_ordem}
            isFirst={isFirst}
            isLast={isLast}
            onToggle={() => toggleSection(key)}
            onMove={(dir) => moveSection(key, dir)}
            onHighlight={() => onHighlightField?.('descricao_longa_ordem')}
            highlightTitle="Clique para localizar a Descrição da Ordem no PDF"
            title={
              <>
                <FileText className="size-3.5 text-muted-foreground" /> Descrição da Ordem
              </>
            }
            collapsedSummary={
              <span className="text-[11px] text-muted-foreground truncate font-mono max-w-[260px] hidden sm:inline ml-1">
                — {o.descricao_longa_ordem.slice(0, 70)}...
              </span>
            }
          >
            <div
              onClick={() => onHighlightField?.('descricao_longa_ordem')}
              className="p-3 sm:p-4 cursor-pointer hover:bg-muted/15 transition-colors group/desc"
              title="Clique no texto para destacar no PDF"
            >
              <div className="flex items-center justify-between text-[11px] text-muted-foreground pb-1">
                <span className="font-medium text-foreground">Texto extraído da ordem:</span>
                {onHighlightField && (
                  <span className="text-primary text-[11px] font-semibold flex items-center gap-1 opacity-70 group-hover/desc:opacity-100 transition-opacity">
                    <Eye className="size-3" /> Destacar no PDF
                  </span>
                )}
              </div>
              <p className="text-foreground leading-relaxed whitespace-pre-line bg-muted/30 group-hover/desc:bg-muted/50 p-3 rounded-lg border border-border/40 group-hover/desc:border-primary/50 font-mono text-[11px] mt-1 transition-colors">
                {o.descricao_longa_ordem}
              </p>
            </div>
          </SectionCardShell>
        )

      case 'operacoes':
        if (!o.operacoes || o.operacoes.length === 0) return null
        return (
          <SectionCardShell
            key={key}
            sectionKey={key}
            visibility={config.operacoes}
            isFirst={isFirst}
            isLast={isLast}
            onToggle={() => toggleSection(key)}
            onMove={(dir) => moveSection(key, dir)}
            onHighlight={() => onHighlightField?.('operacoes')}
            highlightTitle="Clique para localizar as Operações no PDF"
            title={
              <>
                <ListOrdered className="size-3.5 text-primary" /> Operações Registradas ({o.operacoes.length})
              </>
            }
            collapsedSummary={
              <span className="text-[11px] text-muted-foreground truncate hidden sm:inline ml-1">
                — {o.operacoes.map((op) => `${op.numero} ${op.descricao}`).join(' • ').slice(0, 60)}...
              </span>
            }
          >
            <div
              onClick={() => onHighlightField?.('operacoes')}
              className="p-3 sm:p-4 cursor-pointer hover:bg-muted/15 transition-colors group/body"
              title="Clique nas operações para destacar no PDF"
            >
              <div className="space-y-1.5">
                {o.operacoes.map((op, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 text-xs p-2 rounded-lg bg-muted/20 border border-border/30 hover:border-primary/50 transition-colors"
                  >
                    <span className="font-mono font-bold text-primary px-1.5 py-0.5 rounded bg-primary/10 shrink-0">
                      {op.numero}
                    </span>
                    <span className="text-foreground mt-0.5">{op.descricao}</span>
                  </div>
                ))}
              </div>
            </div>
          </SectionCardShell>
        )

      case 'executantes_hh':
        if ((!o.confirmations || o.confirmations.length === 0) && !o.texto_confirmacao) return null
        return (
          <SectionCardShell
            key={key}
            sectionKey={key}
            visibility={config.executantes_hh}
            isFirst={isFirst}
            isLast={isLast}
            onToggle={() => toggleSection(key)}
            onMove={(dir) => moveSection(key, dir)}
            onHighlight={() => onHighlightField?.('confirmacoes')}
            highlightTitle="Clique para localizar Confirmações e Executantes no PDF"
            title={
              <>
                <Users className="size-3.5 text-primary" /> Executantes, Confirmação &amp; HH ({o.hh_total_minutos} min)
              </>
            }
            collapsedSummary={
              <span className="text-[11px] text-muted-foreground truncate hidden sm:inline ml-1">
                — {o.confirmations.length} técnico(s)
                {confirmacaoFormatted ? ` • Últ. conf: ${confirmacaoFormatted}` : ''}
                {` (${o.hh_total_minutos} min)`}
              </span>
            }
          >
            <div
              onClick={() => onHighlightField?.('confirmacoes')}
              className="p-3 sm:p-4 space-y-2 cursor-pointer hover:bg-muted/15 transition-colors group/body"
              title="Clique para destacar no PDF"
            >
              {o.confirmations && o.confirmations.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-border/50">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/50 border-b border-border/50 text-muted-foreground">
                      <tr>
                        <th className="py-1.5 px-2 font-semibold">Data / Hora</th>
                        <th className="py-1.5 px-2 font-semibold">Nome</th>
                        <th className="py-1.5 px-2 font-semibold">Centro</th>
                        <th className="py-1.5 px-2 font-semibold">Matrícula</th>
                        <th className="py-1.5 px-2 text-right font-semibold">Duração</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {o.confirmations.map((c, i) => (
                        <tr key={i} className="hover:bg-muted/20">
                          <td className="py-1.5 px-2 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                            {c.data_execucao ? fmtNaiveDate(c.data_execucao) : '-'}
                            {c.hora_execucao && c.hora_execucao !== '00:00:00'
                              ? ` ${fmtTime(c.hora_execucao)}`
                              : ''}
                          </td>
                          <td className="py-1.5 px-2 font-medium text-foreground">{c.nome_executante || '-'}</td>
                          <td className="py-1.5 px-2 text-muted-foreground">{c.centro_trabalho || '-'}</td>
                          <td className="py-1.5 px-2 font-mono text-muted-foreground">{c.matricula || '-'}</td>
                          <td className="py-1.5 px-2 text-right font-bold text-foreground">{c.duracao_min} min</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {o.texto_confirmacao && (
                <div
                  onClick={(e) => {
                    e.stopPropagation()
                    onHighlightField?.('texto_confirmacao')
                  }}
                  className="text-[11px] text-foreground/90 whitespace-pre-line font-mono bg-muted/25 hover:bg-muted/40 hover:border-primary/50 p-2.5 rounded-lg border border-border/40 transition-colors cursor-pointer"
                  title="Clique no relato de confirmação para destacar no PDF"
                >
                  {o.texto_confirmacao}
                </div>
              )}
            </div>
          </SectionCardShell>
        )

      case 'pareceres_atc':
        return (
          <SectionCardShell
            key={key}
            sectionKey={key}
            visibility={config.pareceres_atc}
            isFirst={isFirst}
            isLast={isLast}
            onToggle={() => toggleSection(key)}
            onMove={(dir) => moveSection(key, dir)}
            title={
              <>
                <MessageSquare className="size-3.5 text-primary" /> Parecer Técnico &amp; Ações ATC ({o.comments.length})
              </>
            }
            collapsedSummary={
              <span className="text-[11px] text-muted-foreground truncate hidden sm:inline">
                — {o.comments.length} anotação(ões) da engenharia
              </span>
            }
          >
            <div className="p-3 pt-2 sm:p-4 sm:pt-2 space-y-3">
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
                          type="button"
                          onClick={() => handleDeleteComment(c.id)}
                          className="text-muted-foreground hover:text-red-500 p-0.5 rounded transition-colors cursor-pointer"
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
          </SectionCardShell>
        )
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden text-xs bg-background">
      {/* ========== FIXED NON-SCROLLING TOP NAVIGATION & CONTROLS BAR ========== */}
      <div className="shrink-0 bg-card/95 backdrop-blur-sm border-b border-border/70 px-2.5 sm:px-4 py-2 flex items-center justify-between gap-2 z-20 shadow-2xs">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-muted-foreground truncate font-mono text-[11px]">
            {currentIndex !== undefined && totalCount !== undefined
              ? `Ocorrência ${currentIndex + 1} de ${totalCount}`
              : 'Ficha Técnica'}
          </span>

          {locCount > 1 && o.posicao_funcional && (
            <button
              type="button"
              onClick={() => onFilterLocation?.(o.posicao_funcional!)}
              title={`Existem ${locCount} ocorrências no mesmo local (${o.posicao_funcional}). Clique para filtrar.`}
              className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30 text-[10px] font-bold cursor-pointer hover:bg-indigo-500/25 shrink-0"
            >
              <Layers className="size-2.5" />
              <span>{locCount}x local</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Quick Pauta Reunião Toggle right in sticky bar so user can toggle even when scrolled */}
          <Button
            variant={isMeetingHighlight ? 'default' : 'outline'}
            size="xs"
            onClick={handleToggleReuniao}
            className={cn(
              'h-6 px-2 text-[11px] font-semibold gap-1',
              isMeetingHighlight && 'bg-violet-600 hover:bg-violet-700 text-white border-violet-600'
            )}
            title="Destacar ou remover esta ocorrência da Pauta da Reunião Diária (Atalho: m)"
          >
            <Presentation className="size-3" />
            <span className="hidden xl:inline">{isMeetingHighlight ? 'Na Pauta' : 'Reunião'}</span>
          </Button>

          {/* Customization Menu for Order & Visibility of Occurrence Cards */}
          <TechnicalSheetConfigMenu
            config={config}
            order={order}
            onSetVisibility={setSectionVisibility}
            onSetAll={setAllSections}
            onMoveSection={moveSection}
            onReorderSections={reorderSections}
            onApplyReadingPreset={applyReadingPreset}
            onReset={resetToDefault}
          />

          {/* Collapse / Expand PDF Split Pane Toggle */}
          {onTogglePdfCollapse && !isMobileModal && (
            <Button
              variant={pdfCollapsed ? 'default' : 'outline'}
              size="xs"
              onClick={onTogglePdfCollapse}
              className="h-6 px-2 text-[11px] font-semibold gap-1"
              title={pdfCollapsed ? 'Exibir painel lateral do PDF' : 'Recolher painel do PDF para ampliar leitura'}
            >
              {pdfCollapsed ? (
                <>
                  <PanelRightOpen className="size-3" />
                  <span className="hidden md:inline">Exibir PDF</span>
                </>
              ) : (
                <>
                  <PanelRightClose className="size-3 text-muted-foreground" />
                  <span className="hidden md:inline">Recolher PDF</span>
                </>
              )}
            </Button>
          )}

          {/* Quick Prev / Next Navigation Buttons (Always Accessible Without Scrolling Back Up!) */}
          {!isMobileModal && (
            <div className="flex items-center gap-1 pl-1 border-l border-border/60">
              {onPrevious && (
                <Button
                  variant="outline"
                  size="icon"
                  disabled={!hasPrevious}
                  onClick={onPrevious}
                  className="size-6 sm:size-7"
                  title="Ocorrência anterior (Atalho: k)"
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
              )}
              {onNext && (
                <Button
                  variant="outline"
                  size="icon"
                  disabled={!hasNext}
                  onClick={onNext}
                  className="size-6 sm:size-7"
                  title="Próxima ocorrência (Atalho: j)"
                >
                  <ChevronRight className="size-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ========== SCROLLABLE SHEET BODY ========== */}
      <div className="flex-1 overflow-y-auto p-2.5 sm:p-4 space-y-3 sm:space-y-4">
        {/* ---------------- 1. IDENTIFIERS, DATES & TRIAGE CARD ---------------- */}
        <div
          className={cn(
            'border rounded-xl p-3 sm:p-4 bg-card shadow-2xs space-y-3 transition-colors',
            isMeetingHighlight && 'border-violet-500/50 ring-1 ring-violet-500/20'
          )}
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            {/* Order / Notification Chips */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {o.numero_ordem && (
                <div
                  onClick={() => onHighlightField?.('numero_ordem')}
                  title="Clique para localizar a Ordem no PDF"
                  className="inline-flex items-center gap-1 font-mono text-xs font-bold px-2 py-0.5 rounded bg-muted hover:bg-muted/80 hover:border-primary/60 text-foreground border border-border transition-colors cursor-pointer group"
                >
                  <span>Ordem {o.numero_ordem}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleCopy(o.numero_ordem!, 'Ordem')
                    }}
                    title="Copiar Ordem"
                    className="p-0.5 hover:text-foreground text-muted-foreground transition-colors cursor-pointer"
                  >
                    {copiedItem === 'Ordem' ? (
                      <Check className="size-3 text-emerald-500" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                  </button>
                </div>
              )}

              {o.numero_nota && (
                <div
                  onClick={() => onHighlightField?.('numero_nota')}
                  title="Clique para localizar a Nota no PDF"
                  className="inline-flex items-center gap-1 font-mono text-xs font-bold px-2 py-0.5 rounded bg-muted hover:bg-muted/80 hover:border-primary/60 text-foreground border border-border transition-colors cursor-pointer group"
                >
                  <span>Nota {o.numero_nota}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleCopy(o.numero_nota!, 'Nota')
                    }}
                    title="Copiar Nota"
                    className="p-0.5 hover:text-foreground text-muted-foreground transition-colors cursor-pointer"
                  >
                    {copiedItem === 'Nota' ? (
                      <Check className="size-3 text-emerald-500" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                  </button>
                </div>
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
          <h2
            onClick={() => onHighlightField?.('titulo')}
            title="Clique para localizar o título no PDF"
            className="text-sm sm:text-base font-bold text-foreground leading-snug cursor-pointer hover:text-primary transition-colors flex items-center justify-between group"
          >
            <span>{o.titulo}</span>
            {onHighlightField && (
              <span className="text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity font-normal flex items-center gap-1 shrink-0 ml-2">
                <Eye className="size-3" /> Ver no PDF
              </span>
            )}
          </h2>

          {/* Chronology Dates Strip: Abertura & Confirmação Side by Side */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => onHighlightField?.('data_abertura')}
              title="Clique para localizar Data/Hora de Abertura no PDF"
              className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-muted/35 hover:bg-muted/60 border border-border/50 hover:border-primary/50 transition-colors cursor-pointer text-left"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <CalendarClock className="size-3.5 text-primary shrink-0" />
                <div className="min-w-0">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">
                    Data de Abertura SAP
                  </span>
                  <span className="font-mono text-xs font-bold text-foreground truncate block">
                    {aberturaFormatted || 'Não informada'}
                  </span>
                </div>
              </div>
              {o.turno && (
                <Badge variant="outline" className="text-[10px] font-mono shrink-0">
                  {o.turno}
                </Badge>
              )}
            </button>

            <button
              type="button"
              onClick={() => onHighlightField?.('confirmacoes')}
              title="Clique para localizar Confirmações / Relatos no PDF"
              className={cn(
                'flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border transition-colors cursor-pointer text-left',
                confOnDifferentDay
                  ? 'bg-emerald-500/10 hover:bg-emerald-500/15 border-emerald-500/40'
                  : 'bg-muted/35 hover:bg-muted/60 border-border/50 hover:border-primary/50'
              )}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <CheckCircle2
                  className={cn(
                    'size-3.5 shrink-0',
                    confirmacaoFormatted ? 'text-emerald-500' : 'text-muted-foreground/50'
                  )}
                />
                <div className="min-w-0">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">
                    Última Confirmação / Relato
                  </span>
                  <span
                    className={cn(
                      'font-mono text-xs font-bold truncate block',
                      confirmacaoFormatted ? 'text-foreground' : 'text-muted-foreground font-normal'
                    )}
                  >
                    {confirmacaoFormatted || 'Sem confirmação apontada'}
                  </span>
                </div>
              </div>
              {confOnDifferentDay && (
                <Badge variant="success" className="text-[9px] shrink-0">
                  Data distinta
                </Badge>
              )}
            </button>
          </div>

          {/* Triage & Operational Action Controls */}
          <div className="pt-2.5 border-t border-border/60 grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-2">
            <Button
              size="sm"
              variant={isMeetingHighlight ? 'default' : 'outline'}
              onClick={handleToggleReuniao}
              className={cn(
                'h-8 sm:h-7 text-xs font-semibold gap-1.5 justify-center w-full sm:w-auto',
                isMeetingHighlight && 'bg-violet-600 hover:bg-violet-700 text-white'
              )}
              title="Selecionar para discussão na Reunião Diária (Atalho: m)"
            >
              <Presentation className="size-3.5 sm:size-3" />
              <span>{isMeetingHighlight ? 'Na Pauta Reunião' : 'Destacar Reunião'}</span>
            </Button>

            <Button
              size="sm"
              variant={o.flag_analisar ? 'default' : 'outline'}
              onClick={handleToggleAnalisar}
              className={cn(
                'h-8 sm:h-7 text-xs font-semibold gap-1.5 justify-center w-full sm:w-auto',
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
                'h-8 sm:h-7 text-xs font-semibold gap-1.5 justify-center w-full sm:w-auto',
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
                className="h-8 sm:h-7 rounded-md border bg-background px-2 text-xs font-bold text-foreground focus:ring-1 focus:ring-primary w-full sm:w-auto"
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
                className="h-8 sm:h-7 rounded-md border bg-background px-2 text-xs text-foreground focus:ring-1 focus:ring-primary w-full sm:w-auto"
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

        {/* ---------------- DYNAMICALLY ORDERED FIELD CARDS ---------------- */}
        {order.map((secKey, idx) => renderSection(secKey, idx, order.length))}
      </div>
    </div>
  )
}

function formatFullOpeningDate(
  dataAbertura: string | null | undefined,
  horaAbertura: string | null | undefined,
  aberturaTs: string | null | undefined
): string | null {
  if (aberturaTs) {
    const p = parseNaive(aberturaTs)
    if (p && (p.h !== 0 || p.mi !== 0)) {
      return fmtNaiveDateTime(aberturaTs)
    }
    if (p) {
      return fmtNaiveDate(aberturaTs)
    }
  }
  if (dataAbertura) {
    const dStr = fmtNaiveDate(dataAbertura)
    if (horaAbertura && horaAbertura !== '00:00:00') {
      return `${dStr} ${fmtTime(horaAbertura)}`
    }
    return dStr
  }
  return null
}

function formatFullConfirmationDate(confIso: string | null | undefined): string | null {
  if (!confIso) return null
  const p = parseNaive(confIso)
  if (!p) return null
  if (p.h !== 0 || p.mi !== 0 || p.s !== 0) {
    return fmtNaiveDateTime(confIso)
  }
  return fmtNaiveDate(confIso)
}
