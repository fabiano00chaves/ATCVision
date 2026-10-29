import React, { useEffect, useState } from 'react'
import type { OccurrenceFilters, Preset } from '@/api/types'
import { presetsApi } from '@/api'
import {
  applyPresetToFilters,
  clearPresetFromFilters,
  countActiveFilters,
  PREFERRED_PRESET_KEY,
} from '@/lib/presets'
import { useWorkspaceLayout } from '@/context/WorkspaceLayoutContext'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  Filter,
  Flame,
  Layers,
  Maximize2,
  Minimize2,
  OctagonAlert,
  PanelLeft,
  Pin,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Wrench,
  X,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface QuickbarPresetsProps {
  filters: OccurrenceFilters
  onChange: (f: OccurrenceFilters) => void
  /** Total matching occurrences in current window/filter to show in collapsed strip. */
  totalCount?: number
  /** Additional items to render on the right (e.g. Layout switcher or PDF page selector). */
  rightExtra?: React.ReactNode
  className?: string
}

export function QuickbarPresets({
  filters,
  onChange,
  totalCount,
  rightExtra,
  className,
}: QuickbarPresetsProps) {
  const [presets, setPresets] = useState<Preset[]>([])
  const [loading, setLoading] = useState(false)

  const {
    filterPanelMode,
    toggleFilterPanel,
    headerCollapsed,
    toggleHeader,
    focusMode,
    toggleFocusMode,
  } = useWorkspaceLayout()

  const activeFiltersCount = countActiveFilters(filters)

  const getPresetIcon = (iconName?: string) => {
    switch (iconName) {
      case 'Zap':
        return <Zap className="size-3" />
      case 'Flame':
        return <Flame className="size-3" />
      case 'AlertTriangle':
        return <AlertTriangle className="size-3" />
      case 'OctagonAlert':
        return <OctagonAlert className="size-3" />
      case 'Search':
        return <Search className="size-3" />
      case 'Star':
        return <Star className="size-3" />
      case 'Layers':
        return <Layers className="size-3" />
      case 'Compass':
        return <Compass className="size-3" />
      case 'Clock':
        return <Clock className="size-3" />
      default:
        return <Filter className="size-3" />
    }
  }

  const loadPresets = async () => {
    try {
      setLoading(true)
      const list = await presetsApi.list()
      const quick = list.filter((p) => p.show_in_quickbar)
      setPresets(quick)

      // Auto-apply saved preferred preset on initial mount if no filter active
      const savedId = localStorage.getItem(PREFERRED_PRESET_KEY)
      if (savedId && !filters.preset_id && activeFiltersCount === 0) {
        const found = quick.find((p) => p.id === savedId)
        if (found) {
          onChange(applyPresetToFilters(filters, found))
        }
      }
    } catch {
      // Ignored
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPresets()

    const onPresetsChanged = () => loadPresets()
    window.addEventListener('atc:presets-changed', onPresetsChanged)
    return () => window.removeEventListener('atc:presets-changed', onPresetsChanged)
  }, [])

  const handlePresetToggle = (preset: Preset) => {
    const isCurrentlyActive = filters.preset_id === preset.id
    if (isCurrentlyActive) {
      try {
        localStorage.removeItem(PREFERRED_PRESET_KEY)
      } catch {}
      onChange(clearPresetFromFilters(filters))
      toast.info('Foco rápido desativado')
    } else {
      try {
        localStorage.setItem(PREFERRED_PRESET_KEY, preset.id)
      } catch {}
      onChange(applyPresetToFilters(filters, preset))
      toast.success(`Foco rápido: ${preset.name}`, {
        description: 'Filtro preferencial fixado e aplicado.',
      })
    }
  }

  const handleClearActivePreset = () => {
    try {
      localStorage.removeItem(PREFERRED_PRESET_KEY)
    } catch {}
    onChange(clearPresetFromFilters(filters))
    toast.info('Foco rápido desativado')
  }

  const activePreset = presets.find((p) => p.id === filters.preset_id)

  return (
    <div
      className={cn(
        'bg-card border-b border-border/50 px-2 sm:px-3 flex flex-col justify-center transition-all duration-150 shrink-0 select-none',
        headerCollapsed ? 'h-8 py-0' : 'min-h-9 py-1',
        className
      )}
    >
      {/* ---------------- COLLAPSED MINIMAL STRIP (32px) ---------------- */}
      {headerCollapsed ? (
        <div className="flex items-center justify-between gap-2 text-xs">
          {/* Left: Filter panel trigger & active filter badges */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
            <Button
              variant="outline"
              size="xs"
              onClick={toggleFilterPanel}
              className={cn(
                'h-6 px-2 text-[11px] font-semibold gap-1 shrink-0',
                filterPanelMode === 'pinned' && 'bg-primary/10 border-primary/40 text-primary'
              )}
            >
              <SlidersHorizontal className="size-3 text-primary" />
              <span>Filtros</span>
              {activeFiltersCount > 0 && (
                <span className="size-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                  {activeFiltersCount}
                </span>
              )}
            </Button>

            {/* Active preset pill */}
            {activePreset && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary text-primary-foreground text-[11px] font-bold shrink-0 shadow-2xs">
                {getPresetIcon(activePreset.icon)}
                <span>{activePreset.name}</span>
                <button
                  type="button"
                  onClick={handleClearActivePreset}
                  className="hover:bg-primary-foreground/20 rounded p-0.5"
                  title="Desativar foco"
                >
                  <X className="size-2.5" />
                </button>
              </span>
            )}

            {/* Active PFs pills */}
            {filters.fl_prefixes?.map((pf) => (
              <span
                key={pf}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono text-foreground shrink-0 border"
              >
                <span>{pf}</span>
              </span>
            ))}

            {/* Total count badge */}
            {totalCount !== undefined && (
              <span className="text-[11px] text-muted-foreground font-medium shrink-0 ml-1">
                <b className="text-foreground font-mono">{totalCount}</b> ocorrência(s)
              </span>
            )}
          </div>

          {/* Right: Expand top bar & Focus mode toggles */}
          <div className="flex items-center gap-1 shrink-0">
            {rightExtra}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={toggleFocusMode}
                  className={cn(
                    'h-6 text-[10px] gap-1 px-2',
                    focusMode ? 'text-primary font-bold bg-primary/10' : 'text-muted-foreground'
                  )}
                >
                  {focusMode ? <Minimize2 className="size-3" /> : <Maximize2 className="size-3" />}
                  <span className="hidden lg:inline">{focusMode ? 'Sair do Foco' : 'Modo Foco'}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {focusMode ? 'Restaurar menus normais (Esc ou Ctrl+.)' : 'Ocultar tudo para leitura máxima (Ctrl+.)'}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={toggleHeader}
                  className="h-6 text-[10px] gap-1 px-2 text-primary font-bold hover:bg-muted"
                >
                  <ChevronDown className="size-3.5" />
                  <span className="hidden sm:inline">Expandir Topo</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Expandir barra de ferramentas do topo (Ctrl+Shift+H)
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      ) : (
        /* ---------------- EXPANDED PRESETS STRIP (36px) ---------------- */
        <div className="flex items-center justify-between gap-2 overflow-x-auto scrollbar-none">
          {/* Presets List */}
          <div className="flex items-center gap-1.5 shrink-0 py-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground shrink-0 flex items-center gap-1 pr-1">
              <Sparkles className="size-3 text-primary" /> Foco Rápido:
            </span>

            {presets.map((preset) => {
              const active = filters.preset_id === preset.id
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handlePresetToggle(preset)}
                  title={
                    active
                      ? 'Filtro preferencial fixado (clique para desativar)'
                      : `Ativar foco rápido: ${preset.name}`
                  }
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all shrink-0 border cursor-pointer select-none',
                    active
                      ? 'bg-primary text-primary-foreground border-primary font-bold shadow-xs'
                      : 'bg-background hover:bg-muted text-foreground border-border/70 hover:border-foreground/30'
                  )}
                >
                  {getPresetIcon(preset.icon)}
                  <span>{preset.name}</span>
                  {active && <Star className="size-2.5 fill-amber-300 text-amber-300 shrink-0" />}
                </button>
              )
            })}

            {activePreset && (
              <Button
                size="xs"
                variant="ghost"
                onClick={handleClearActivePreset}
                className="text-xs text-muted-foreground hover:text-red-500 h-6 px-1.5 shrink-0"
                title="Desativar foco rápido atual"
              >
                <X className="size-3 mr-0.5" /> Limpar Foco
              </Button>
            )}

            <Button
              size="xs"
              variant="ghost"
              onClick={() => (window.location.href = '/config')}
              className="text-xs text-primary shrink-0 h-6 px-2 font-medium"
              title="Gerenciar e cadastrar novos focos rápidos"
            >
              <Plus className="size-3 mr-0.5" /> Focos
            </Button>
          </div>

          {/* Right Action buttons: Collapse Top Bar, Toggle Filter Sidebar, Focus mode */}
          <div className="flex items-center gap-1 shrink-0 ml-auto">
            {rightExtra}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={toggleFocusMode}
                  className={cn(
                    'h-6 text-[10px] gap-1 px-2',
                    focusMode ? 'text-primary font-bold bg-primary/10' : 'text-muted-foreground'
                  )}
                >
                  {focusMode ? <Minimize2 className="size-3" /> : <Maximize2 className="size-3" />}
                  <span className="hidden lg:inline">{focusMode ? 'Sair do Foco' : 'Modo Foco'}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {focusMode ? 'Restaurar menus normais (Esc ou Ctrl+.)' : 'Ocultar tudo para leitura máxima (Ctrl+.)'}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={toggleHeader}
                  className="h-6 text-[10px] text-muted-foreground hover:text-foreground gap-1 px-1.5"
                  title="Recolher barras do topo para maximizar área de leitura (Ctrl+Shift+H)"
                >
                  <ChevronUp className="size-3.5" />
                  <span className="hidden sm:inline">Recolher Topo</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Recolher barra do topo para ganhar espaço (Ctrl+Shift+H)
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}
    </div>
  )
}
