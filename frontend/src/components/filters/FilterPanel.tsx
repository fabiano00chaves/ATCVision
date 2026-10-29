import React, { useState } from 'react'
import type { Especialidade, OccurrenceFilters } from '@/api/types'
import { presetsApi } from '@/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  BookmarkPlus,
  Calendar,
  ChevronDown,
  Clock,
  Flag,
  Layers,
  MapPin,
  OctagonAlert,
  RotateCcw,
  Search,
  Star,
  Wrench,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { FunctionalLocationInput } from './FunctionalLocationInput'
import { PREFERRED_PRESET_KEY } from '@/lib/presets'

export const ARVORES = ['BOF1', 'SLM1', 'CCS1', 'CCS2', 'CCS3', 'PCC1', 'COM0'] as const
export const TURNOS = ['Turno A', 'Turno B', 'Turno C', 'Turno D'] as const

export type FilterSectionId = 'period' | 'flags' | 'pf' | 'arvores' | 'specialty' | 'turno'

export const FILTER_SECTIONS: { id: FilterSectionId; label: string; icon: React.ElementType }[] = [
  { id: 'period', label: 'Período', icon: Calendar },
  { id: 'flags', label: 'Sinalizadores', icon: Flag },
  { id: 'pf', label: 'Posição Funcional', icon: MapPin },
  { id: 'arvores', label: 'Árvore / Área', icon: Layers },
  { id: 'specialty', label: 'Especialidade', icon: Wrench },
  { id: 'turno', label: 'Turno', icon: Clock },
]

/** Active-count per section (drives badges on the panel and on the collapsed rail). */
export function sectionActiveCount(id: FilterSectionId, f: OccurrenceFilters): number {
  switch (id) {
    case 'period':
      return f.start || f.end ? 1 : 0
    case 'flags':
      return [f.only_pane, f.only_jump, f.only_relevant, f.only_analyze].filter(Boolean).length
    case 'pf':
      return f.fl_prefixes?.length || 0
    case 'arvores':
      return f.arvores?.length || 0
    case 'specialty':
      return f.specialties?.length || 0
    case 'turno':
      return f.turnos?.length || 0
  }
}

const LS_SECTIONS = 'atc_filter_sections_open'

function useSectionState(): [Record<string, boolean>, (id: string) => void] {
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(LS_SECTIONS) || '{}')
    } catch {
      return {}
    }
  })
  const toggle = (id: string) => {
    setOpen((prev) => {
      const next = { ...prev, [id]: !(prev[id] ?? true) }
      try {
        localStorage.setItem(LS_SECTIONS, JSON.stringify(next))
      } catch {
        // Ignored
      }
      return next
    })
  }
  return [open, toggle]
}

function Section({
  id,
  label,
  icon: Icon,
  count,
  open,
  onToggle,
  onClear,
  children,
}: {
  id: string
  label: string
  icon: React.ElementType
  count: number
  open: boolean
  onToggle: () => void
  onClear?: () => void
  children: React.ReactNode
}) {
  return (
    <section className="border-b border-border/50 last:border-b-0" data-section={id}>
      <div className="flex items-center gap-1 px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground cursor-pointer"
          aria-expanded={open}
        >
          <Icon className={cn('size-3.5', count > 0 ? 'text-primary' : '')} />
          <span className={cn(count > 0 && 'text-foreground')}>{label}</span>
          {count > 0 && (
            <span className="ml-1 min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
              {count}
            </span>
          )}
          <ChevronDown className={cn('size-3 ml-auto transition-transform', !open && '-rotate-90')} />
        </button>
        {count > 0 && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="text-[10px] text-muted-foreground hover:text-red-500 px-1 cursor-pointer"
            title={`Limpar ${label}`}
          >
            limpar
          </button>
        )}
      </div>
      {open && <div className="px-3 pb-3 animate-in fade-in-50 duration-150">{children}</div>}
    </section>
  )
}

function Chip({
  active,
  onClick,
  children,
  className,
  title,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  className?: string
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        'px-2 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer',
        active
          ? 'bg-primary text-primary-foreground border-primary font-bold shadow-2xs'
          : 'bg-muted/40 text-muted-foreground border-border/60 hover:bg-muted hover:text-foreground',
        className
      )}
    >
      {children}
    </button>
  )
}

const fmtDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

interface FilterPanelProps {
  filters: OccurrenceFilters
  onChange: (f: OccurrenceFilters) => void
  /** Show the date section (hidden in Daily Routine, where the routine defines the window). */
  showPeriod?: boolean
  /** Optional callback after a preset is saved (e.g. reload Foco Rápido bar). */
  onPresetSaved?: () => void
}

export function FilterPanel({ filters, onChange, showPeriod = true, onPresetSaved }: FilterPanelProps) {
  const [openMap, toggleSection] = useSectionState()
  const isOpen = (id: string) => openMap[id] ?? true
  const [saveOpen, setSaveOpen] = useState(false)

  const set = (patch: Partial<OccurrenceFilters>) => onChange({ ...filters, ...patch })

  const toggleInArray = <T extends string>(key: keyof OccurrenceFilters, value: T) => {
    const cur = ((filters[key] as T[] | undefined) || []) as T[]
    const next = cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value]
    set({ [key]: next.length ? next : undefined } as Partial<OccurrenceFilters>)
  }

  const setPeriod = (mode: 'hoje' | 'ontem' | '7d' | 'mes' | 'ano') => {
    const now = new Date()
    let s = new Date(now)
    let e = new Date(now)
    if (mode === 'ontem') {
      s.setDate(s.getDate() - 1)
      e.setDate(e.getDate() - 1)
    } else if (mode === '7d') {
      s.setDate(s.getDate() - 6)
    } else if (mode === 'mes') {
      s.setDate(1)
    } else if (mode === 'ano') {
      s = new Date(now.getFullYear(), 0, 1)
    }
    set({ start: `${fmtDay(s)}T00:00:00`, end: `${fmtDay(e)}T23:59:59` })
  }

  const startDay = filters.start ? filters.start.slice(0, 10) : ''
  const endDay = filters.end ? filters.end.slice(0, 10) : ''

  const hasAny =
    !!filters.fl_prefixes?.length ||
    !!filters.arvores?.length ||
    !!filters.specialties?.length ||
    !!filters.turnos?.length ||
    !!filters.only_pane ||
    !!filters.only_jump ||
    !!filters.only_relevant ||
    !!filters.only_analyze ||
    (showPeriod && (!!filters.start || !!filters.end))

  const clearAll = () => {
    const next: OccurrenceFilters = { ...filters }
    for (const k of [
      'fl_prefixes',
      'arvores',
      'specialties',
      'turnos',
      'planning_groups',
      'only_pane',
      'only_jump',
      'only_relevant',
      'only_analyze',
      'preset_id',
    ] as const)
      delete next[k]
    if (showPeriod) {
      delete next.start
      delete next.end
    }
    try {
      localStorage.removeItem(PREFERRED_PRESET_KEY)
    } catch {
      // Ignored
    }
    onChange(next)
  }

  const sections = FILTER_SECTIONS.filter((s) => showPeriod || s.id !== 'period')

  const renderSection = (id: FilterSectionId) => {
    const meta = FILTER_SECTIONS.find((s) => s.id === id)!
    const count = sectionActiveCount(id, filters)
    const common = {
      id,
      label: meta.label,
      icon: meta.icon,
      count,
      open: isOpen(id),
      onToggle: () => toggleSection(id),
    }

    switch (id) {
      case 'period':
        return (
          <Section key={id} {...common} onClear={() => set({ start: undefined, end: undefined })}>
            <div className="grid grid-cols-5 gap-1 mb-2">
              {(
                [
                  ['hoje', 'Hoje'],
                  ['ontem', 'Ontem'],
                  ['7d', '7 dias'],
                  ['mes', 'Mês'],
                  ['ano', 'Ano'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setPeriod(k)}
                  className="px-1 py-1 rounded-md text-[10px] font-semibold bg-muted/40 border border-border/60 hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <label className="text-[10px] text-muted-foreground space-y-0.5">
                <span>De</span>
                <Input
                  type="date"
                  value={startDay}
                  onChange={(e) => set({ start: e.target.value ? `${e.target.value}T00:00:00` : undefined })}
                  className="h-7 text-[11px] px-1.5"
                />
              </label>
              <label className="text-[10px] text-muted-foreground space-y-0.5">
                <span>Até</span>
                <Input
                  type="date"
                  value={endDay}
                  onChange={(e) => set({ end: e.target.value ? `${e.target.value}T23:59:59` : undefined })}
                  className="h-7 text-[11px] px-1.5"
                />
              </label>
            </div>
          </Section>
        )
      case 'flags':
        return (
          <Section
            key={id}
            {...common}
            onClear={() =>
              set({ only_pane: undefined, only_jump: undefined, only_relevant: undefined, only_analyze: undefined })
            }
          >
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  ['only_pane', 'Panes', OctagonAlert, 'text-red-500'],
                  ['only_jump', 'Jumps / Forces', AlertTriangle, 'text-amber-500'],
                  ['only_relevant', 'Relevantes', Star, 'text-amber-400'],
                  ['only_analyze', 'P/ Analisar', Search, 'text-sky-500'],
                ] as const
              ).map(([key, label, Icon, color]) => {
                const active = !!filters[key]
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => set({ [key]: active ? undefined : true } as Partial<OccurrenceFilters>)}
                    className={cn(
                      'flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-medium border transition-colors cursor-pointer',
                      active
                        ? 'bg-primary/15 border-primary/50 text-foreground font-bold ring-1 ring-primary/30'
                        : 'bg-muted/30 border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <Icon className={cn('size-3.5 shrink-0', color)} />
                    <span className="truncate">{label}</span>
                  </button>
                )
              })}
            </div>
          </Section>
        )
      case 'pf':
        return (
          <Section key={id} {...common} onClear={() => set({ fl_prefixes: undefined })}>
            <FunctionalLocationInput
              value={filters.fl_prefixes || []}
              onChange={(pfs) => set({ fl_prefixes: pfs.length ? pfs : undefined })}
              placeholder="Ex: BT-ST-SLM1 (Enter ou vírgula)"
              compact
            />
            <p className="text-[10px] text-muted-foreground mt-1.5 leading-snug">
              Prefixo, trecho ou lista colada do Excel. Várias PFs combinam com “OU”.
            </p>
          </Section>
        )
      case 'arvores':
        return (
          <Section key={id} {...common} onClear={() => set({ arvores: undefined })}>
            <div className="grid grid-cols-4 gap-1">
              {ARVORES.map((arv) => (
                <Chip
                  key={arv}
                  active={(filters.arvores || []).includes(arv)}
                  onClick={() => toggleInArray('arvores', arv)}
                  className="font-mono text-center px-1"
                >
                  {arv}
                </Chip>
              ))}
            </div>
          </Section>
        )
      case 'specialty':
        return (
          <Section key={id} {...common} onClear={() => set({ specialties: undefined })}>
            <div className="grid grid-cols-3 gap-1">
              {(
                [
                  ['ELETRICA', 'Elétrica', Zap],
                  ['MECANICA', 'Mecânica', Wrench],
                  ['OUTRA', 'Outra', Layers],
                ] as const
              ).map(([value, label, Icon]) => (
                <Chip
                  key={value}
                  active={(filters.specialties || []).includes(value as Especialidade)}
                  onClick={() => toggleInArray<Especialidade>('specialties', value as Especialidade)}
                  className="flex items-center justify-center gap-1"
                >
                  <Icon className="size-3" />
                  {label}
                </Chip>
              ))}
            </div>
          </Section>
        )
      case 'turno':
        return (
          <Section key={id} {...common} onClear={() => set({ turnos: undefined })}>
            <div className="grid grid-cols-4 gap-1">
              {TURNOS.map((t) => (
                <Chip
                  key={t}
                  active={(filters.turnos || []).includes(t)}
                  onClick={() => toggleInArray('turnos', t)}
                  className="text-center font-bold"
                  title={t}
                >
                  {t.replace('Turno ', '')}
                </Chip>
              ))}
            </div>
          </Section>
        )
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto overscroll-contain">{sections.map((s) => renderSection(s.id))}</div>

      <div className="shrink-0 border-t border-border/60 p-2 flex items-center gap-1.5 bg-card/80">
        <Button
          variant="ghost"
          size="xs"
          onClick={clearAll}
          disabled={!hasAny}
          className="h-7 text-[11px] text-muted-foreground hover:text-red-500"
        >
          <RotateCcw className="size-3 mr-1" /> Limpar tudo
        </Button>
        <Button
          variant="outline"
          size="xs"
          onClick={() => setSaveOpen(true)}
          disabled={!hasAny}
          className="h-7 text-[11px] ml-auto border-dashed"
          title="Salvar a combinação atual como botão de Foco Rápido"
        >
          <BookmarkPlus className="size-3 mr-1 text-primary" /> Salvar Foco
        </Button>
      </div>

      <SavePresetDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        filters={filters}
        onSaved={onPresetSaved}
      />
    </div>
  )
}

export function SavePresetDialog({
  open,
  onOpenChange,
  filters,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  filters: OccurrenceFilters
  onSaved?: () => void
}) {
  const [name, setName] = useState('')
  const [showInQuickbar, setShowInQuickbar] = useState(true)

  const handleSave = async () => {
    if (!name.trim()) return
    try {
      await presetsApi.create({
        name: name.trim(),
        icon: 'Filter',
        color: '#3b82f6',
        is_default: false,
        show_in_quickbar: showInQuickbar,
        sort_order: 10,
        filter_payload: {
          functional_locations_prefixes: filters.fl_prefixes || [],
          arvores: filters.arvores || [],
          specialties: filters.specialties || [],
          planning_groups: filters.planning_groups || [],
          keywords: filters.q ? [filters.q] : [],
          only_pane: !!filters.only_pane,
          only_jump: !!filters.only_jump,
          only_relevant: !!filters.only_relevant,
          only_analyze: !!filters.only_analyze,
          turnos: filters.turnos || [],
        },
      })
      toast.success(`Foco "${name}" salvo com sucesso!`)
      onOpenChange(false)
      setName('')
      onSaved?.()
      window.dispatchEvent(new Event('atc:presets-changed'))
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar filtro')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">Salvar como Foco Rápido</DialogTitle>
          <DialogDescription className="text-xs">
            Grave esta combinação de filtros para acesso com 1 clique na barra de Foco Rápido.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2 text-xs">
          <div>
            <label className="text-xs font-medium">Nome do Filtro</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Minha Linha: SLM1 Elétrica"
              className="mt-1"
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              autoFocus
            />
          </div>
          {!!filters.fl_prefixes?.length && (
            <div className="p-2 bg-muted/30 rounded border text-[11px] font-mono">
              <span className="text-muted-foreground block text-[10px] uppercase font-bold">
                PFs incluídas ({filters.fl_prefixes.length}):
              </span>
              <span className="text-primary font-bold">{filters.fl_prefixes.join(', ')}</span>
            </div>
          )}
          <label className="text-xs font-medium cursor-pointer flex items-center gap-2">
            <input
              type="checkbox"
              checked={showInQuickbar}
              onChange={(e) => setShowInQuickbar(e.target.checked)}
              className="size-4 rounded text-primary focus:ring-primary"
            />
            <span>Exibir na barra de Foco Rápido</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!name.trim()}>
            Salvar Filtro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
