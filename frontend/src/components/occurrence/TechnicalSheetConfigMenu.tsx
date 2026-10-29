import React from 'react'
import type {
  TechnicalSheetConfig,
  TechnicalSheetSectionKey,
  SectionVisibility,
} from '@/hooks/useTechnicalSheetConfig'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  BookOpen,
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  Eye,
  EyeOff,
  FileText,
  ListOrdered,
  Maximize2,
  MessageSquare,
  Minimize2,
  OctagonAlert,
  RotateCcw,
  Sliders,
  Users,
  Wrench,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface TechnicalSheetConfigMenuProps {
  config: TechnicalSheetConfig
  onSetVisibility: (key: TechnicalSheetSectionKey, vis: SectionVisibility) => void
  onSetAll: (vis: 'expanded' | 'collapsed') => void
  onApplyReadingPreset: () => void
  onReset: () => void
  className?: string
}

interface SectionMeta {
  key: TechnicalSheetSectionKey
  label: string
  icon: React.ReactNode
  description: string
}

const SECTIONS_META: SectionMeta[] = [
  {
    key: 'posicao_funcional',
    label: 'Posição Funcional & Ativo',
    icon: <Wrench className="size-3.5 text-primary" />,
    description: 'Tag SAP, árvore de ativos e descrição técnica',
  },
  {
    key: 'dados_operacionais',
    label: 'Dados Operacionais & Pane',
    icon: <OctagonAlert className="size-3.5 text-red-500" />,
    description: 'Houve pane, duração, turno e especialidade',
  },
  {
    key: 'modo_falha',
    label: 'Modo de Falha SAP',
    icon: <Zap className="size-3.5 text-amber-500" />,
    description: 'Defeito e causa raiz identificados',
  },
  {
    key: 'descricao_notificacao',
    label: 'Descrição da Notificação',
    icon: <FileText className="size-3.5 text-primary" />,
    description: 'Texto detalhado da notificação operacional',
  },
  {
    key: 'descricao_ordem',
    label: 'Descrição da Ordem',
    icon: <FileText className="size-3.5 text-muted-foreground" />,
    description: 'Texto longo complementar da ordem SAP',
  },
  {
    key: 'operacoes',
    label: 'Operações Registradas',
    icon: <ListOrdered className="size-3.5 text-primary" />,
    description: 'Lista de operações de manutenção realizadas',
  },
  {
    key: 'executantes_hh',
    label: 'Executantes e HH',
    icon: <Users className="size-3.5 text-primary" />,
    description: 'Tabela de técnicos, matrículas e horas apontadas',
  },
  {
    key: 'pareceres_atc',
    label: 'Parecer Técnico & Ações ATC',
    icon: <MessageSquare className="size-3.5 text-primary" />,
    description: 'Anotações da engenharia, pareceres e itens de ação',
  },
]

export function TechnicalSheetConfigMenu({
  config,
  onSetVisibility,
  onSetAll,
  onApplyReadingPreset,
  onReset,
  className,
}: TechnicalSheetConfigMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="xs"
          className={cn(
            'h-6 px-2 text-[11px] font-semibold gap-1.5 text-foreground hover:bg-muted border-border/80 cursor-pointer',
            className
          )}
          title="Configurar quais campos e cards são exibidos ou minimizados"
        >
          <Sliders className="size-3 text-primary" />
          <span className="hidden sm:inline">Exibição de Campos</span>
          <span className="sm:hidden">Campos</span>
          <ChevronDown className="size-3 opacity-60 ml-0.5" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-2 z-50 text-xs">
        {/* Header */}
        <div className="flex items-center justify-between pb-1.5 border-b border-border/50">
          <span className="font-bold text-foreground text-xs flex items-center gap-1.5">
            <Sliders className="size-3.5 text-primary" /> Exibição dos Cards da Ficha
          </span>
          <span className="text-[10px] text-muted-foreground font-mono">Brevidade de Leitura</span>
        </div>

        {/* Quick Action Presets */}
        <div className="grid grid-cols-3 gap-1 py-2 border-b border-border/40">
          <Button
            variant="outline"
            size="xs"
            onClick={onApplyReadingPreset}
            className="h-6 text-[10px] px-1 font-semibold gap-1 bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
            title="Mantém Posição Funcional, Falha e Notificação expandidos; minimiza HH e Operações"
          >
            <BookOpen className="size-2.5 shrink-0" />
            <span>Leitura Rápida</span>
          </Button>

          <Button
            variant="outline"
            size="xs"
            onClick={() => onSetAll('expanded')}
            className="h-6 text-[10px] px-1 font-medium gap-1 text-muted-foreground hover:text-foreground"
            title="Expandir todos os cards visíveis"
          >
            <ChevronsDown className="size-2.5 shrink-0" />
            <span>Expandir Todos</span>
          </Button>

          <Button
            variant="outline"
            size="xs"
            onClick={() => onSetAll('collapsed')}
            className="h-6 text-[10px] px-1 font-medium gap-1 text-muted-foreground hover:text-foreground"
            title="Minimizar todos os cards para 1 linha"
          >
            <ChevronsUp className="size-2.5 shrink-0" />
            <span>Recolher Todos</span>
          </Button>
        </div>

        {/* Section List with Status Selector */}
        <div className="space-y-1.5 py-2 max-h-72 overflow-y-auto">
          {SECTIONS_META.map((sec) => {
            const currentVis = config[sec.key] || 'expanded'

            return (
              <div
                key={sec.key}
                className="flex items-center justify-between gap-2 p-1.5 rounded-md hover:bg-muted/40 text-xs transition-colors"
              >
                <div className="flex items-center gap-2 truncate">
                  {sec.icon}
                  <span className="truncate font-medium text-foreground">{sec.label}</span>
                </div>

                {/* 3-State Toggle Segment */}
                <div className="flex items-center gap-0.5 bg-muted/60 p-0.5 rounded border border-border/40 shrink-0">
                  <button
                    type="button"
                    onClick={() => onSetVisibility(sec.key, 'expanded')}
                    className={cn(
                      'px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer',
                      currentVis === 'expanded'
                        ? 'bg-background text-foreground font-bold shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                    title="Aberto e visível por padrão"
                  >
                    Aberto
                  </button>

                  <button
                    type="button"
                    onClick={() => onSetVisibility(sec.key, 'collapsed')}
                    className={cn(
                      'px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer',
                      currentVis === 'collapsed'
                        ? 'bg-primary text-primary-foreground font-bold shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                    title="Minimizado / Recolhido em 1 linha"
                  >
                    Mini
                  </button>

                  <button
                    type="button"
                    onClick={() => onSetVisibility(sec.key, 'hidden')}
                    className={cn(
                      'px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer',
                      currentVis === 'hidden'
                        ? 'bg-red-500/20 text-red-500 font-bold shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                    title="Ocultar completamente da ficha"
                  >
                    Ocultar
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <DropdownMenuSeparator className="my-1" />

        {/* Footer Reset */}
        <div className="pt-1 flex items-center justify-between text-[11px]">
          <span className="text-[10px] text-muted-foreground">Salvo no navegador</span>
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-1 text-primary hover:underline font-semibold cursor-pointer"
          >
            <RotateCcw className="size-3" />
            <span>Restaurar Padrão</span>
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
