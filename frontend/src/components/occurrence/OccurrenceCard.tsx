import React, { useState } from 'react'
import type { OccurrenceSummary, StatusATC } from '@/api/types'
import { Badge } from '@/components/ui/badge'
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  Copy,
  Layers,
  MessageSquare,
  OctagonAlert,
  Presentation,
  Search,
  Star,
  Tag,
  Wrench,
  Zap,
} from 'lucide-react'
import { cn, copyToClipboard } from '@/lib/utils'
import { fmtDayLabel, fmtTime, parseNaive } from '@/lib/datetime'
import { toast } from 'sonner'
import { occurrencesApi } from '@/api'

interface OccurrenceCardProps {
  occurrence: OccurrenceSummary
  isSelected?: boolean
  sameLocationCount?: number
  onClick?: () => void
  onOccurrenceUpdated?: (updated: OccurrenceSummary) => void
  onFilterLocation?: (pf: string) => void
  compact?: boolean
}

export function OccurrenceCard({
  occurrence,
  isSelected = false,
  sameLocationCount,
  onClick,
  onOccurrenceUpdated,
  onFilterLocation,
  compact = false,
}: OccurrenceCardProps) {
  const [o, setO] = useState<OccurrenceSummary>(occurrence)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [isPatching, setIsPatching] = useState(false)

  // Keep internal state updated if prop changes
  React.useEffect(() => {
    setO(occurrence)
  }, [occurrence])

  const locCount = Math.max(o.same_location_count ?? 1, sameLocationCount ?? 1)
  const isMeetingHighlight = Boolean(o.flag_destaque_reuniao)

  const handleCopy = async (text: string, label: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const success = await copyToClipboard(text)
    if (success) {
      setCopiedField(label)
      toast.success(`${label} copiado: ${text}`)
      setTimeout(() => setCopiedField(null), 1600)
    }
  }

  const handleToggleAnalisar = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isPatching) return
    setIsPatching(true)
    const nextVal = !o.flag_analisar
    try {
      const updated = await occurrencesApi.patch(o.id, { flag_analisar: nextVal })
      const updatedSummary: OccurrenceSummary = {
        ...o,
        flag_analisar: updated.flag_analisar,
      }
      setO(updatedSummary)
      onOccurrenceUpdated?.(updatedSummary)
      toast.success(nextVal ? 'Marcado para Analisar' : 'Desmarcado de Analisar')
    } catch {
      toast.error('Erro ao atualizar status de triagem')
    } finally {
      setIsPatching(false)
    }
  }

  const handleToggleRelevante = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isPatching) return
    setIsPatching(true)
    const nextVal = !o.flag_relevante
    try {
      const updated = await occurrencesApi.patch(o.id, { flag_relevante: nextVal })
      const updatedSummary: OccurrenceSummary = {
        ...o,
        flag_relevante: updated.flag_relevante,
      }
      setO(updatedSummary)
      onOccurrenceUpdated?.(updatedSummary)
      toast.success(nextVal ? 'Marcada como Ocorrência Relevante' : 'Desmarcada de Relevante')
    } catch {
      toast.error('Erro ao atualizar status de relevância')
    } finally {
      setIsPatching(false)
    }
  }

  const handleToggleReuniao = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isPatching) return
    setIsPatching(true)
    const nextVal = !isMeetingHighlight
    try {
      const updated = await occurrencesApi.patch(o.id, { flag_destaque_reuniao: nextVal })
      const updatedSummary: OccurrenceSummary = {
        ...o,
        flag_destaque_reuniao: updated.flag_destaque_reuniao,
      }
      setO(updatedSummary)
      onOccurrenceUpdated?.(updatedSummary)
      toast.success(
        nextVal
          ? 'Destacado para a Pauta da Reunião Diária'
          : 'Removido da Pauta da Reunião Diária'
      )
    } catch {
      toast.error('Erro ao atualizar destaque de reunião')
    } finally {
      setIsPatching(false)
    }
  }

  const getStatusBadge = (status: StatusATC) => {
    switch (status) {
      case 'NOVO':
        return (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/20">
            NOVO
          </span>
        )
      case 'EM_ANALISE':
        return (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/20">
            EM ANÁLISE
          </span>
        )
      case 'AGUARDANDO_PARADA':
        return (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/20">
            AG. PARADA
          </span>
        )
      case 'ENCAMINHADO_INSPECAO':
        return (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/20">
            ENC. INSPEÇÃO
          </span>
        )
      case 'JUMP_ATIVO':
        return (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/20 animate-pulse">
            JUMP ATIVO
          </span>
        )
      case 'CONCLUIDO':
        return (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
            CONCLUÍDO
          </span>
        )
      default:
        return (
          <span className="text-[10px] font-mono uppercase px-1 rounded bg-muted text-muted-foreground">
            {status}
          </span>
        )
    }
  }

  const getTipoBadge = (tipo: string) => {
    switch (tipo) {
      case 'CORRETIVA':
        return (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
            Corretiva
          </span>
        )
      case 'NOTIFICACAO_GERAL':
        return (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
            Notif. Geral
          </span>
        )
      case 'PREVENTIVA_CONDICAO':
        return (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20">
            Prev. Condicional
          </span>
        )
      case 'PREVENTIVA_TEMPO':
        return (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20">
            Prev. Tempo
          </span>
        )
      default:
        return null
    }
  }

  // Opening and confirmation formatted dates
  const aberturaLabel = formatOpeningLabel(o.data_abertura, o.hora_abertura, o.abertura_timestamp)
  const confirmacaoLabel = formatConfirmationLabel(o.ultima_confirmacao_em)
  const openingDay = o.data_abertura?.split('T')[0]
  const confDay = o.ultima_confirmacao_em?.split('T')[0]
  const confOnDifferentDay = Boolean(openingDay && confDay && openingDay !== confDay)

  return (
    <article
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick?.()
        }
      }}
      className={cn(
        'group relative rounded-xl border text-xs cursor-pointer transition-all duration-200 select-none',
        compact ? 'p-2.5' : 'p-3',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        isSelected
          ? 'border-primary/80 bg-primary/10 ring-1 ring-primary/40 shadow-sm dark:bg-primary/15'
          : isMeetingHighlight
            ? 'border-violet-500/60 bg-violet-500/8 hover:border-violet-500/80 shadow-xs'
            : 'bg-card hover:border-primary/40 hover:bg-muted/30 hover:shadow-xs border-border/70'
      )}
    >
      {/* Left Accent Bar (Selected takes primary, Meeting Highlight takes violet) */}
      {(isSelected || isMeetingHighlight) && (
        <span
          className={cn(
            'absolute left-0 top-2 bottom-2 w-1 rounded-r',
            isSelected ? 'bg-primary' : 'bg-violet-500'
          )}
          aria-hidden="true"
        />
      )}

      {/* Row 1: Primary Tags & Critical Operational Flags */}
      <div className="flex items-center justify-between gap-1.5 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Functional Location Tag */}
          {o.posicao_funcional ? (
            <button
              type="button"
              onClick={(e) => handleCopy(o.posicao_funcional!, 'Tag', e)}
              title="Copiar Tag do Ativo"
              className="inline-flex items-center gap-1 font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-primary/15 text-foreground hover:bg-primary/25 border border-primary/30 transition-colors"
            >
              <Tag className="size-2.5 opacity-70" />
              <span>{o.posicao_funcional}</span>
              {copiedField === 'Tag' ? (
                <Check className="size-2.5 text-emerald-500" />
              ) : (
                <Copy className="size-2.5 opacity-50 group-hover:opacity-100" />
              )}
            </button>
          ) : (
            <span className="font-mono text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
              SEM TAG
            </span>
          )}

          {/* Same-Location Multi-Record Visual Signal */}
          {locCount > 1 && o.posicao_funcional && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onFilterLocation?.(o.posicao_funcional!)
              }}
              title={`Existem ${locCount} ocorrências para este mesmo local (${o.posicao_funcional}). Clique para filtrar este local.`}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/40 text-[10px] font-extrabold hover:bg-indigo-500/25 transition-colors cursor-pointer shadow-2xs"
            >
              <Layers className="size-2.5" />
              <span>{locCount}x local</span>
            </button>
          )}

          {/* Daily Meeting Highlight Pill */}
          {isMeetingHighlight && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-700 dark:text-violet-300 border border-violet-500/40 text-[10px] font-extrabold">
              <Presentation className="size-2.5" />
              <span>REUNIÃO</span>
            </span>
          )}

          {getTipoBadge(o.tipo_ocorrencia)}

          {/* Pane Badge */}
          {o.teve_pane && (
            <Badge variant="pane" className="flex items-center gap-1 shadow-2xs animate-pulse">
              <OctagonAlert className="size-3 text-red-600 dark:text-red-400" />
              <span>PANE {Math.round(o.duracao_pane_min)}m</span>
            </Badge>
          )}

          {/* Jump / Force Badge */}
          {o.tem_jump_force && (
            <Badge
              variant="jump"
              className={cn(
                'flex items-center gap-1 shadow-2xs',
                o.jump_status === 'RETIRADO' ? 'opacity-70 line-through' : 'font-extrabold'
              )}
            >
              <AlertTriangle className="size-3 text-amber-600 dark:text-amber-400" />
              <span>JUMP [{o.jump_status || 'ATIVO'}]</span>
            </Badge>
          )}
        </div>

        {/* Right Info: Discipline & Shift */}
        <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] shrink-0">
          {o.especialidade === 'ELETRICA' && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 font-semibold border border-sky-500/20">
              <Zap className="size-2.5" /> Elét
            </span>
          )}
          {o.especialidade === 'MECANICA' && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 font-semibold border border-amber-500/20">
              <Wrench className="size-2.5" /> Mec
            </span>
          )}
          {o.turno && (
            <span className="font-bold font-mono px-1.5 py-0.5 rounded bg-muted/80 text-foreground border border-border/40">
              T-{o.turno}
            </span>
          )}
        </div>
      </div>

      {/* Row 1.5: Chronology Dates Strip (Abertura & Confirmação) */}
      {(aberturaLabel || confirmacaoLabel) && (
        <div className="flex items-center gap-2 flex-wrap mt-1.5 text-[10px] font-mono">
          {aberturaLabel && (
            <span
              className="inline-flex items-center gap-1 text-muted-foreground"
              title="Data e hora de abertura no SAP"
            >
              <CalendarClock className="size-2.5 text-primary/70" />
              <span>Ab:</span>
              <b className="text-foreground/90">{aberturaLabel}</b>
            </span>
          )}
          {confirmacaoLabel && (
            <span
              className={cn(
                'inline-flex items-center gap-1 px-1.5 py-0.2 rounded',
                confOnDifferentDay
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 font-semibold'
                  : 'text-emerald-600 dark:text-emerald-400'
              )}
              title="Última confirmação / execução apontada no relato"
            >
              <CheckCircle2 className="size-2.5" />
              <span>Cf:</span>
              <b>{confirmacaoLabel}</b>
            </span>
          )}
        </div>
      )}

      {/* Row 2: Title and Object Description */}
      <div className="my-1.5">
        <h3 className="font-semibold text-foreground text-xs leading-snug line-clamp-2 group-hover:text-primary transition-colors">
          {o.titulo}
        </h3>
        {o.descricao_posicao_funcional && (
          <p className="text-[11px] text-muted-foreground/85 line-clamp-1 mt-0.5">
            {o.descricao_posicao_funcional}
          </p>
        )}
      </div>

      {/* Row 3: Identifiers, Comments & Quick Triage Actions */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1.5 border-t border-border/50 gap-2 flex-wrap">
        {/* Order / Notification Identifiers */}
        <div className="flex items-center gap-2 truncate max-w-[60%] sm:max-w-[65%]">
          {o.numero_ordem && (
            <button
              type="button"
              onClick={(e) => handleCopy(o.numero_ordem!, 'Ordem', e)}
              title="Copiar Número da Ordem"
              className="inline-flex items-center gap-1 font-mono text-[11px] hover:text-foreground hover:bg-muted/60 px-1 py-0.5 rounded transition-colors"
            >
              <span className="text-muted-foreground font-normal">Ord:</span>
              <span className="font-semibold text-foreground">{o.numero_ordem}</span>
            </button>
          )}
          {o.numero_nota && (
            <button
              type="button"
              onClick={(e) => handleCopy(o.numero_nota!, 'Nota', e)}
              title="Copiar Número da Nota"
              className="inline-flex items-center gap-1 font-mono text-[11px] hover:text-foreground hover:bg-muted/60 px-1 py-0.5 rounded transition-colors"
            >
              <span className="text-muted-foreground font-normal">Not:</span>
              <span className="font-semibold text-foreground">{o.numero_nota}</span>
            </button>
          )}
          {o.comment_count > 0 && (
            <span className="inline-flex items-center gap-0.5 text-primary font-bold text-[10px] px-1 py-0.5 rounded bg-primary/10">
              <MessageSquare className="size-3" />
              {o.comment_count}
            </span>
          )}
        </div>

        {/* Action Buttons: Reunião Diária, Relevante, Analisar, Status ATC */}
        <div className="flex items-center gap-1 shrink-0 ml-auto">
          {/* Quick 1-Tap Toggle Pauta Reunião Diária */}
          <button
            type="button"
            onClick={handleToggleReuniao}
            title={
              isMeetingHighlight
                ? 'Remover da Pauta da Reunião Diária (Atalho: m)'
                : 'Destacar para a Pauta da Reunião Diária (Atalho: m)'
            }
            className={cn(
              'size-7 sm:size-6 rounded-md flex items-center justify-center transition-all cursor-pointer',
              isMeetingHighlight
                ? 'bg-violet-500/20 text-violet-600 dark:text-violet-300 border border-violet-500/50 shadow-2xs'
                : 'text-muted-foreground/60 hover:text-violet-500 hover:bg-violet-500/10 active:scale-90'
            )}
          >
            <Presentation className="size-3.5" />
          </button>

          {/* Quick 1-Tap Toggle Relevante */}
          <button
            type="button"
            onClick={handleToggleRelevante}
            title={o.flag_relevante ? 'Desmarcar Relevante' : 'Marcar como Relevante'}
            className={cn(
              'size-7 sm:size-6 rounded-md flex items-center justify-center transition-all cursor-pointer',
              o.flag_relevante
                ? 'bg-amber-400/20 text-amber-500 border border-amber-400/40 shadow-2xs'
                : 'text-muted-foreground/60 hover:text-amber-500 hover:bg-amber-400/10 active:scale-90'
            )}
          >
            <Star className={cn('size-3.5', o.flag_relevante && 'fill-amber-400 text-amber-400')} />
          </button>

          {/* Quick 1-Tap Toggle Analisar */}
          <button
            type="button"
            onClick={handleToggleAnalisar}
            title={o.flag_analisar ? 'Desmarcar Analisar' : 'Marcar para Analisar'}
            className={cn(
              'size-7 sm:size-6 rounded-md flex items-center justify-center transition-all cursor-pointer',
              o.flag_analisar
                ? 'bg-sky-500/20 text-sky-500 border border-sky-500/40 shadow-2xs'
                : 'text-muted-foreground/60 hover:text-sky-500 hover:bg-sky-500/10 active:scale-90'
            )}
          >
            <Search className="size-3.5" />
          </button>

          {/* Status ATC Pill */}
          {getStatusBadge(o.status_atc)}
        </div>
      </div>
    </article>
  )
}

function formatOpeningLabel(
  dataAbertura: string | null | undefined,
  horaAbertura: string | null | undefined,
  aberturaTs: string | null | undefined
): string | null {
  const source = dataAbertura || aberturaTs
  if (!source) return null
  const day = fmtDayLabel(source)
  if (horaAbertura) {
    return `${day} ${fmtTime(horaAbertura)}`
  }
  const p = parseNaive(aberturaTs)
  if (p && (p.h !== 0 || p.mi !== 0)) {
    return `${day} ${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}`
  }
  return day
}

function formatConfirmationLabel(confIso: string | null | undefined): string | null {
  if (!confIso) return null
  const p = parseNaive(confIso)
  if (!p) return null
  const day = `${String(p.d).padStart(2, '0')}/${String(p.mo).padStart(2, '0')}`
  if (p.h !== 0 || p.mi !== 0) {
    return `${day} ${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}`
  }
  return day
}
