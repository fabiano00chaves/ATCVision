import React, { useState } from 'react'
import type { Especialidade, OccurrenceFilters, StatusATC } from '@/api/types'
import { presetsApi } from '@/api'
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
  BookmarkPlus,
  Calendar,
  Check,
  ChevronDown,
  Filter,
  Flame,
  OctagonAlert,
  RotateCcw,
  Search,
  Star,
  X,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const ARVORES = ['BOF1', 'SLM1', 'CCS1', 'CCS2', 'CCS3', 'PCC1', 'COM0'] as const

interface FilterBarProps {
  filters: OccurrenceFilters
  onChange: (f: OccurrenceFilters) => void
  onSavePresetSuccess?: () => void
  compact?: boolean
}

export function FilterBar({ filters, onChange, onSavePresetSuccess, compact = false }: FilterBarProps) {
  const [saveOpen, setSaveOpen] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [presetColor, setPresetColor] = useState('#3b82f6')
  const [showInQuickbar, setShowInQuickbar] = useState(true)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  // Temporal range helper
  const setTemporalRange = (mode: 'hoje' | 'ontem' | 'semana' | 'mes' | 'ano' | 'clear') => {
    const now = new Date()
    const fmt = (d: Date) => {
      const year = d.getFullYear()
      const mon = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${year}-${mon}-${day}T00:00:00`
    }
    const fmtEnd = (d: Date) => {
      const year = d.getFullYear()
      const mon = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${year}-${mon}-${day}T23:59:59`
    }

    if (mode === 'clear') {
      const next = { ...filters }
      delete next.start
      delete next.end
      onChange(next)
      return
    }

    let s = new Date(now)
    let e = new Date(now)

    if (mode === 'hoje') {
      // today 00:00 to 23:59
    } else if (mode === 'ontem') {
      s.setDate(s.getDate() - 1)
      e.setDate(e.getDate() - 1)
    } else if (mode === 'semana') {
      const day = s.getDay() || 7
      s.setDate(s.getDate() - day + 1) // Monday
    } else if (mode === 'mes') {
      s.setDate(1)
    } else if (mode === 'ano') {
      s = new Date(now.getFullYear(), 0, 1)
    }

    onChange({
      ...filters,
      start: fmt(s),
      end: fmtEnd(e),
    })
  }

  const toggleArvore = (arv: string) => {
    const cur = filters.arvores || []
    const next = cur.includes(arv) ? cur.filter((x) => x !== arv) : [...cur, arv]
    onChange({ ...filters, arvores: next.length ? next : undefined })
  }

  const handleSavePreset = async () => {
    if (!presetName.trim()) return
    try {
      await presetsApi.create({
        name: presetName.trim(),
        icon: 'Filter',
        color: presetColor,
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
      toast.success(`Filtro "${presetName}" salvo com sucesso!`)
      setSaveOpen(false)
      setPresetName('')
      if (onSavePresetSuccess) onSavePresetSuccess()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar filtro')
    }
  }

  const hasActiveFilters = Object.keys(filters).some((k) => {
    const v = (filters as any)[k]
    return v !== undefined && v !== null && v !== false && (Array.isArray(v) ? v.length > 0 : v !== '')
  })

  return (
    <div className="bg-card border-b p-2 space-y-2 text-xs shrink-0">
      <div className="flex flex-wrap items-center gap-1.5 justify-between">
        {/* Keyword Search */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
          <Input
            value={filters.q || ''}
            onChange={(e) => onChange({ ...filters, q: e.target.value || undefined })}
            placeholder="Buscar por tag, nota, ordem, defeito, causa, comentário..."
            className="pl-8 h-7 text-xs bg-background"
          />
          {filters.q && (
            <button
              onClick={() => onChange({ ...filters, q: undefined })}
              className="absolute right-2 top-1.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* Temporal shortcuts */}
        <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-md">
          <Button variant="ghost" size="xs" onClick={() => setTemporalRange('hoje')}>
            Hoje
          </Button>
          <Button variant="ghost" size="xs" onClick={() => setTemporalRange('ontem')}>
            Ontem
          </Button>
          <Button variant="ghost" size="xs" onClick={() => setTemporalRange('semana')}>
            Semana
          </Button>
          <Button variant="ghost" size="xs" onClick={() => setTemporalRange('mes')}>
            Mês
          </Button>
          {(filters.start || filters.end) && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setTemporalRange('clear')}
              className="text-amber-600 dark:text-amber-400 font-bold"
              title="Limpar filtro de data"
            >
              ✕
            </Button>
          )}
        </div>

        {/* Action Toggles */}
        <div className="flex items-center gap-1">
          <Button
            variant={filters.only_pane ? 'pane' : 'outline'}
            size="xs"
            onClick={() => onChange({ ...filters, only_pane: !filters.only_pane || undefined })}
            className="h-6"
          >
            <OctagonAlert className="size-3" />
            Panes
          </Button>

          <Button
            variant={filters.only_jump ? 'jump' : 'outline'}
            size="xs"
            onClick={() => onChange({ ...filters, only_jump: !filters.only_jump || undefined })}
            className="h-6"
          >
            <AlertTriangle className="size-3" />
            Jumps / Forces
          </Button>

          <Button
            variant={filters.only_relevant ? 'default' : 'outline'}
            size="xs"
            onClick={() => onChange({ ...filters, only_relevant: !filters.only_relevant || undefined })}
            className="h-6"
          >
            <Star className="size-3 fill-current" />
            Relevantes
          </Button>

          <Button
            variant={filters.only_analyze ? 'default' : 'outline'}
            size="xs"
            onClick={() => onChange({ ...filters, only_analyze: !filters.only_analyze || undefined })}
            className="h-6"
          >
            <Search className="size-3" />
            Analisar
          </Button>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => onChange({})}
              className="text-muted-foreground hover:text-red-600 h-6"
              title="Limpar todos os filtros"
            >
              <RotateCcw className="size-3" />
            </Button>
          )}

          {/* Advanced Filters Toggle */}
          <Button
            variant={advancedOpen || ((filters.arvores?.length || 0) + (filters.specialties?.length || 0) + (filters.turnos?.length || 0)) > 0 ? 'secondary' : 'outline'}
            size="xs"
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className="h-6 gap-1"
            title="Filtros por Árvores de Ativos, Especialidade e Turno"
          >
            <Filter className="size-3 text-primary" />
            <span>Mais Filtros</span>
            {((filters.arvores?.length || 0) + (filters.specialties?.length || 0) + (filters.turnos?.length || 0)) > 0 && (
              <span className="size-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                {(filters.arvores?.length || 0) + (filters.specialties?.length || 0) + (filters.turnos?.length || 0)}
              </span>
            )}
            <ChevronDown className={cn('size-3 transition-transform', advancedOpen && 'rotate-180')} />
          </Button>

          <Button
            variant="outline"
            size="xs"
            onClick={() => setSaveOpen(true)}
            className="h-6 border-dashed"
            title="Salvar filtros atuais como Preset"
          >
            <BookmarkPlus className="size-3 text-primary" />
            Salvar Preset
          </Button>
        </div>
      </div>

      {/* Collapsible Second row: Árvores + Specialty + Turno */}
      {(advancedOpen || ((filters.arvores?.length || 0) + (filters.specialties?.length || 0) + (filters.turnos?.length || 0)) > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-border/40 text-[11px] animate-in fade-in-50 duration-150">
          <span className="text-muted-foreground font-semibold px-1">Árvores:</span>
          {ARVORES.map((arv) => {
            const active = (filters.arvores || []).includes(arv)
            return (
              <button
                key={arv}
                onClick={() => toggleArvore(arv)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium transition-colors border ${
                  active
                    ? 'bg-primary text-primary-foreground border-primary font-bold shadow-xs'
                  : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted hover:text-foreground'
              }`}
            >
              {arv}
            </button>
          )
        })}

        <div className="ml-auto flex items-center gap-2">
          {/* Especialidade */}
          <div className="flex items-center gap-1 bg-muted/40 px-1.5 py-0.5 rounded border">
            <span className="text-muted-foreground">Espec:</span>
            {(['TODAS', 'ELETRICA', 'MECANICA'] as const).map((esp) => {
              const active =
                esp === 'TODAS'
                  ? !filters.specialties || filters.specialties.length === 0
                  : (filters.specialties || []).includes(esp as Especialidade)
              return (
                <button
                  key={esp}
                  onClick={() => {
                    if (esp === 'TODAS') {
                      onChange({ ...filters, specialties: undefined })
                    } else {
                      onChange({ ...filters, specialties: [esp as Especialidade] })
                    }
                  }}
                  className={`px-1 py-0.2 rounded text-[10px] font-medium ${
                    active ? 'bg-background font-bold text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {esp === 'TODAS' ? 'Todas' : esp === 'ELETRICA' ? 'Elét' : 'Mec'}
                </button>
              )
            })}
          </div>

          {/* Turno */}
          <div className="flex items-center gap-1 bg-muted/40 px-1.5 py-0.5 rounded border">
            <span className="text-muted-foreground">Turno:</span>
            {['A', 'B', 'C', 'D'].map((t) => {
              const active = (filters.turnos || []).includes(`Turno ${t}`)
              return (
                <button
                  key={t}
                  onClick={() => {
                    const cur = filters.turnos || []
                    const target = `Turno ${t}`
                    const next = cur.includes(target) ? cur.filter((x) => x !== target) : [...cur, target]
                    onChange({ ...filters, turnos: next.length ? next : undefined })
                  }}
                  className={`px-1 rounded text-[10px] font-bold ${
                    active ? 'bg-background text-primary' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t}
                </button>
              )
            })}
          </div>
        </div>
      </div>
      )}

      {/* Save Preset Dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Salvar como Filtro Pré-Cadastrado</DialogTitle>
            <DialogDescription className="text-xs">
              Grave esta combinação de filtros para acesso rápido com 1 clique na barra superior.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium">Nome do Filtro</label>
              <Input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Ex: Minha Linha: SLM1 Elétrica"
                className="mt-1"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium">Exibir na Barra Rápida (Quickbar)</label>
              <input
                type="checkbox"
                checked={showInQuickbar}
                onChange={(e) => setShowInQuickbar(e.target.checked)}
                className="size-4"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setSaveOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSavePreset} disabled={!presetName.trim()}>
              Salvar Filtro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
