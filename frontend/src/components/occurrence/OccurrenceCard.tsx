import React, { useState } from 'react'
import type { OccurrenceSummary, StatusATC } from '@/api/types'
import { Badge } from '@/components/ui/badge'
import {
  AlertTriangle,
  Clock,
  Copy,
  Check,
  Cpu,
  Flame,
  MessageSquare,
  OctagonAlert,
  Search,
  Sparkles,
  Star,
  Tag,
  Wrench,
  Zap,
} from 'lucide-react'
import { cn, copyToClipboard } from '@/lib/utils'
import { fmtDayLabel, parseNaive } from '@/lib/datetime'
import { toast } from 'sonner'
import { occurrencesApi } from '@/api'

interface OccurrenceCardProps {
  occurrence: OccurrenceSummary
  isSelected?: boolean
  onClick?: () => void
  onOccurrenceUpdated?: (updated: OccurrenceSummary) => void
  compact?: boolean
}

export function OccurrenceCard({
  occurrence,
  isSelected = false,
  onClick,
  onOccurrenceUpdated,
  compact = false,
}: OccurrenceCardProps) {
  const [o, setO] = useState<OccurrenceSummary>(occurrence)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [isPatching, setIsPatching] = useState(false)

  // Keep internal state updated if prop changes
  React.useEffect(() => {
    setO(occurrence)
  }, [occurrence])

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
      if (onOccurrenceUpdated) onOccurrenceUpdated(updatedSummary)
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
      if (onOccurrenceUpdated) onOccurrenceUpdated(updatedSummary)
      toast.success(nextVal ? 'Marcada como Ocorrência Relevante' : 'Desmarcada de Relevante')
    } catch {
      toast.error('Erro ao atualizar status de relevância')
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
        'group relative p-3 rounded-xl border text-xs cursor-pointer transition-all duration-200 select-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        isSelected
          ? 'border-primary/80 bg-primary/10 ring-1 ring-primary/40 shadow-sm dark:bg-primary/15'
          : 'bg-card hover:border-primary/40 hover:bg-muted/30 hover:shadow-xs border-border/70'
      )}
    >
      {/* Selection Left Accent Bar */}
      {isSelected && (
        <span className="absolute left-0 top-2 bottom-2 w-1 bg-primary rounded-r" aria-hidden="true" />
      )}

      {/* Row 1: Primary Tags & Critical Operational Flags */}
      <div className="flex items-center justify-between gap-1.5 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Functional Location Tag */}
          {o.posicao_funcional ? (
            <button
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

        {/* Right Info: Discipline & Shift & Date */}
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
          {o.data_abertura && (
            <span className="font-mono text-muted-foreground font-medium">
              {formatDate(o.data_abertura)}
            </span>
          )}
        </div>
      </div>

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
        <div className="flex items-center gap-2 truncate max-w-[65%] sm:max-w-[70%]">
          {o.numero_ordem && (
            <button
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

        {/* Action Buttons: Analisar, Relevante, Status ATC */}
        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          {/* Quick 1-Tap Toggle Relevante */}
          <button
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

function formatDate(val: string): string {
  if (!val) return ''
  try {
    const p = parseNaive(val)
    if (p) {
      return fmtDayLabel(val)
    }
    const clean = val.split('T')[0]
    const parts = clean.split('-')
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}`
    }
    return val
  } catch {
    return val
  }
}
