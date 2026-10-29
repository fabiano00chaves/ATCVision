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
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { QuickbarPresetSelect } from '@/components/filters/QuickbarPresetSelect'
import { PresetEditorModal } from '@/components/presets/PresetEditorModal'

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
  const [editorOpen, setEditorOpen] = useState(false)

  const {
    filterPanelMode,
    toggleFilterPanel,
    headerCollapsed,
    toggleHeader,
    focusMode,
    toggleFocusMode,
  } = useWorkspaceLayout()

  const activeFiltersCount = countActiveFilters(filters)

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

  const handlePresetSelect = (preset: Preset) => {
    try {
      localStorage.setItem(PREFERRED_PRESET_KEY, preset.id)
    } catch {}
    onChange(applyPresetToFilters(filters, preset))
    toast.success(`Foco rápido: ${preset.name}`, {
      description: 'Filtro preferencial fixado e aplicado.',
    })
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
    <>
      <div
        className={cn(
          'bg-card border-b border-border/50 px-2 sm:px-3 flex flex-col justify-center transition-all duration-150 shrink-0 select-none',
          headerCollapsed ? 'h-8 py-0' : 'h-9 py-0',
          className
        )}
      >
        <div className="flex items-center justify-between gap-2 text-xs">
          {/* Left: Filter sidebar toggle + Compact Presets Listbox + Active PF pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
            {/* Filter Sidebar Toggle Button */}
            <Button
              variant="outline"
              size="xs"
              onClick={toggleFilterPanel}
              className={cn(
                'h-6 px-2 text-[11px] font-semibold gap-1 shrink-0',
                filterPanelMode === 'pinned' && 'bg-primary/10 border-primary/40 text-primary'
              )}
              title="Abrir ou fixar filtros avançados da área (Ctrl+Shift+F)"
            >
              <SlidersHorizontal className="size-3 text-primary" />
              <span>Filtros</span>
              {activeFiltersCount > 0 && (
                <span className="size-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                  {activeFiltersCount}
                </span>
              )}
            </Button>

            {/* Foco Rápido Compact Listbox / Dropdown (Gains an entire line of space!) */}
            {!headerCollapsed ? (
              <QuickbarPresetSelect
                presets={presets}
                activePresetId={filters.preset_id}
                onSelect={handlePresetSelect}
                onClear={handleClearActivePreset}
                onManage={() => setEditorOpen(true)}
              />
            ) : (
              /* In collapsed mode: minimal active preset pill if selected */
              activePreset && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary text-primary-foreground text-[11px] font-bold shrink-0 shadow-2xs">
                  <span>{activePreset.name}</span>
                  <button
                    type="button"
                    onClick={handleClearActivePreset}
                    className="hover:bg-primary-foreground/20 rounded p-0.5 cursor-pointer"
                    title="Desativar foco"
                  >
                    <X className="size-2.5" />
                  </button>
                </span>
              )
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
              <span className="text-[11px] text-muted-foreground font-medium shrink-0 ml-1 hidden sm:inline">
                <b className="text-foreground font-mono">{totalCount}</b> ocorrência(s)
              </span>
            )}
          </div>

          {/* Right: Layout Switcher + Expand/Collapse + Focus mode */}
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
                  className="h-6 text-[10px] gap-1 px-1.5 text-muted-foreground hover:text-foreground"
                >
                  {headerCollapsed ? (
                    <>
                      <ChevronDown className="size-3.5 text-primary" />
                      <span className="hidden sm:inline font-bold text-primary">Expandir Topo</span>
                    </>
                  ) : (
                    <>
                      <ChevronUp className="size-3.5" />
                      <span className="hidden sm:inline">Recolher</span>
                    </>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {headerCollapsed
                  ? 'Expandir barra do topo (Ctrl+Shift+H)'
                  : 'Recolher barra do topo para ganhar espaço (Ctrl+Shift+H)'}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      <PresetEditorModal
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onSuccess={loadPresets}
      />
    </>
  )
}
