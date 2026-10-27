import React from 'react'
import type { OccurrenceSummary } from '@/api/types'
import { Badge } from '@/components/ui/badge'
import {
  AlertTriangle,
  Clock,
  MessageSquare,
  OctagonAlert,
  Search,
  Star,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface OccurrenceCardProps {
  occurrence: OccurrenceSummary
  isSelected?: boolean
  onClick?: () => void
}

export function OccurrenceCard({ occurrence, isSelected = false, onClick }: OccurrenceCardProps) {
  const o = occurrence

  return (
    <div
      onClick={onClick}
      className={cn(
        'p-3 rounded-lg border text-xs cursor-pointer transition-all space-y-1.5',
        isSelected
          ? 'border-primary bg-primary/5 ring-1 ring-primary shadow-xs'
          : 'bg-card hover:border-primary/50 hover:bg-muted/30'
      )}
    >
      <div className="flex items-center justify-between gap-1.5 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {o.tipo_ocorrencia === 'CORRETIVA' && <Badge variant="destructive">Corretiva</Badge>}
          {o.tipo_ocorrencia === 'NOTIFICACAO_GERAL' && <Badge variant="secondary">Notif. Geral</Badge>}
          {o.tipo_ocorrencia === 'PREVENTIVA_CONDICAO' && <Badge variant="info">Prev. Condicional</Badge>}
          {o.tipo_ocorrencia === 'PREVENTIVA_TEMPO' && <Badge variant="purple">Prev. Tempo</Badge>}

          {o.teve_pane && (
            <Badge variant="pane" className="flex items-center gap-1">
              <OctagonAlert className="size-3" />
              PANE: {intRound(o.duracao_pane_min)}m
            </Badge>
          )}

          {o.tem_jump_force && (
            <Badge variant="jump" className="flex items-center gap-1">
              <AlertTriangle className="size-3" />
              JUMP [{o.jump_status || 'ATIVO'}]
            </Badge>
          )}

          {o.flag_relevante && (
            <Badge variant="default" className="flex items-center gap-0.5">
              <Star className="size-2.5 fill-current" />
              Relevante
            </Badge>
          )}

          {o.flag_analisar && (
            <Badge variant="outline" className="text-amber-500 border-amber-500 font-bold">
              Analisar
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 text-muted-foreground text-[10px]">
          {o.especialidade === 'ELETRICA' && (
            <span className="flex items-center gap-0.5 text-sky-500 font-medium">
              <Zap className="size-2.5" /> Elét
            </span>
          )}
          {o.especialidade === 'MECANICA' && <span className="text-amber-500 font-medium">Mec</span>}
          {o.turno && <span className="font-semibold">{o.turno}</span>}
          {o.data_abertura && <span>{formatDate(o.data_abertura)}</span>}
        </div>
      </div>

      <div>
        <p className="font-semibold text-foreground text-xs leading-snug line-clamp-2">
          {o.titulo}
        </p>
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
        <div className="flex items-center gap-2 truncate max-w-[80%]">
          {o.posicao_funcional && (
            <span className="font-mono text-foreground font-semibold truncate">
              {o.posicao_funcional}
            </span>
          )}
          {o.numero_ordem && (
            <span className="text-muted-foreground">Ord: {o.numero_ordem}</span>
          )}
          {o.numero_nota && (
            <span className="text-muted-foreground">Not: {o.numero_nota}</span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {o.comment_count > 0 && (
            <span className="flex items-center gap-0.5 text-primary font-semibold text-[10px]">
              <MessageSquare className="size-3" />
              {o.comment_count}
            </span>
          )}
          <span className="text-[10px] uppercase font-mono px-1 rounded bg-muted">
            {o.status_atc}
          </span>
        </div>
      </div>
    </div>
  )
}

function intRound(val: number): number {
  return Math.round(val || 0)
}

function formatDate(val: string): string {
  try {
    const [y, m, d] = val.split('-')
    return `${d}/${m}`
  } catch {
    return val
  }
}
