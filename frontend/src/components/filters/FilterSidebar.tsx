import React, { useState } from 'react'
import type { OccurrenceFilters } from '@/api/types'
import { useWorkspaceLayout, type FilterPanelMode } from '@/context/WorkspaceLayoutContext'
import { FilterPanel, FILTER_SECTIONS, sectionActiveCount, type FilterSectionId } from './FilterPanel'
import { countActiveFilters } from '@/lib/presets'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  Pin,
  PinOff,
  RotateCcw,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface FilterSidebarProps {
  filters: OccurrenceFilters
  onChange: (f: OccurrenceFilters) => void
  showPeriod?: boolean
  onPresetSaved?: () => void
  className?: string
}

export function FilterSidebar({
  filters,
  onChange,
  showPeriod = true,
  onPresetSaved,
  className,
}: FilterSidebarProps) {
  const {
    filterPanelMode,
    setFilterPanelMode,
    mobileFilterOpen,
    setMobileFilterOpen,
  } = useWorkspaceLayout()

  const [railHovered, setRailHovered] = useState(false)
  const [activeSectionHover, setActiveSectionHover] = useState<FilterSectionId | null>(null)

  const activeCount = countActiveFilters(filters)
  const isPinned = filterPanelMode === 'pinned'
  const isRail = filterPanelMode === 'rail'
  const isHidden = filterPanelMode === 'hidden'

  const sections = FILTER_SECTIONS.filter((s) => showPeriod || s.id !== 'period')

  // When in rail mode and hovered, show floating panel
  const showFloatingPanel = isRail && railHovered

  const handleClearAll = () => {
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
    ] as const) {
      delete next[k]
    }
    if (showPeriod) {
      delete next.start
      delete next.end
    }
    onChange(next)
  }

  return (
    <>
      {/* ----------------- DESKTOP SIDEBAR ----------------- */}
      {!isHidden && (
        <aside
          onMouseEnter={() => isRail && setRailHovered(true)}
          onMouseLeave={() => {
            if (isRail) {
              setRailHovered(false)
              setActiveSectionHover(null)
            }
          }}
          className={cn(
            'relative shrink-0 hidden md:flex transition-all duration-200 ease-in-out border-r border-border/60 bg-card select-none z-20',
            isPinned ? 'w-72 shadow-xs' : 'w-11 items-center',
            className
          )}
        >
          {/* PINNED MODE: Full panel fixed in layout */}
          {isPinned && (
            <div className="flex flex-col h-full w-72 overflow-hidden bg-card">
              {/* Header */}
              <div className="h-10 px-3 border-b border-border/50 flex items-center justify-between shrink-0 bg-muted/20">
                <div className="flex items-center gap-1.5 min-w-0">
                  <SlidersHorizontal className="size-3.5 text-primary shrink-0" />
                  <span className="text-xs font-bold text-foreground truncate">Filtros da Área</span>
                  {activeCount > 0 && (
                    <span className="size-4.5 min-w-4.5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                      {activeCount}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-0.5">
                  {activeCount > 0 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={handleClearAll}
                          className="size-6 text-muted-foreground hover:text-red-500"
                        >
                          <RotateCcw className="size-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        Limpar todos os filtros da área
                      </TooltipContent>
                    </Tooltip>
                  )}

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setFilterPanelMode('rail')}
                        className="size-6 text-muted-foreground hover:text-foreground"
                      >
                        <PanelLeftClose className="size-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      Recolher para barra fina (Hover rápido)
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>

              {/* Panel Body */}
              <div className="flex-1 overflow-hidden min-h-0">
                <FilterPanel
                  filters={filters}
                  onChange={onChange}
                  showPeriod={showPeriod}
                  onPresetSaved={onPresetSaved}
                />
              </div>
            </div>
          )}

          {/* RAIL MODE: Slim icon strip with instant hover/click flyout */}
          {isRail && (
            <div className="flex flex-col h-full w-11 items-center justify-between py-2 overflow-hidden bg-card/60">
              {/* Top: Header / Expand Button */}
              <div className="flex flex-col items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setFilterPanelMode('pinned')}
                      className="size-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted relative cursor-pointer"
                    >
                      <Filter className="size-3.5 text-primary" />
                      {activeCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 size-3.5 rounded-full bg-primary text-primary-foreground text-[8px] font-bold flex items-center justify-center">
                          {activeCount}
                        </span>
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">
                    <b>Filtros da Área ({activeCount})</b>
                    <p className="text-[10px] text-muted-foreground">Clique para fixar aberto</p>
                  </TooltipContent>
                </Tooltip>
              </div>

              {/* Middle: Section Icons */}
              <div className="flex flex-col items-center gap-2 my-auto">
                {sections.map((s) => {
                  const Icon = s.icon
                  const count = sectionActiveCount(s.id, filters)
                  return (
                    <Tooltip key={s.id}>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => {
                            setActiveSectionHover(s.id)
                            setRailHovered(true)
                          }}
                          className={cn(
                            'size-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted relative transition-colors cursor-pointer',
                            count > 0 && 'text-primary bg-primary/10 font-bold'
                          )}
                        >
                          <Icon className="size-3.5" />
                          {count > 0 && (
                            <span className="absolute -top-1 -right-1 min-w-3.5 h-3.5 px-0.5 rounded-full bg-primary text-primary-foreground text-[8px] font-bold flex items-center justify-center">
                              {count}
                            </span>
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="text-xs">
                        <span className="font-semibold">{s.label}</span>
                        {count > 0 && <span className="text-primary font-bold ml-1">({count})</span>}
                      </TooltipContent>
                    </Tooltip>
                  )
                })}
              </div>

              {/* Bottom: Pin toggle */}
              <div className="flex flex-col items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setFilterPanelMode('pinned')}
                      className="size-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
                    >
                      <Pin className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">
                    Fixar painel aberto (Ctrl+Shift+F)
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          )}

          {/* FLYOUT DRAWER IN RAIL MODE (Opens on hover over rail) */}
          {showFloatingPanel && (
            <div className="absolute left-11 top-0 bottom-0 w-72 shadow-2xl z-40 bg-card/95 backdrop-blur-md border-r border-border animate-in slide-in-from-left-2 duration-150 flex flex-col">
              <div className="h-10 px-3 border-b border-border/50 flex items-center justify-between shrink-0 bg-muted/40">
                <div className="flex items-center gap-1.5 min-w-0">
                  <SlidersHorizontal className="size-3.5 text-primary shrink-0" />
                  <span className="text-xs font-bold text-foreground truncate">Filtros da Área</span>
                  {activeCount > 0 && (
                    <span className="size-4.5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                      {activeCount}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      setFilterPanelMode('pinned')
                      setRailHovered(false)
                    }}
                    className="h-6 gap-1 text-[10px] text-primary"
                    title="Fixar aberto"
                  >
                    <Pin className="size-3" />
                    <span>Fixar</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setRailHovered(false)}
                    className="size-6 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-hidden min-h-0">
                <FilterPanel
                  filters={filters}
                  onChange={onChange}
                  showPeriod={showPeriod}
                  onPresetSaved={onPresetSaved}
                />
              </div>
            </div>
          )}
        </aside>
      )}

      {/* ----------------- MOBILE SLIDE-OVER DRAWER ----------------- */}
      {mobileFilterOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop */}
          <div
            onClick={() => setMobileFilterOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
          />

          {/* Slide-over panel */}
          <div className="relative w-80 max-w-[85vw] h-full bg-card border-r shadow-2xl flex flex-col z-50 animate-in slide-in-from-left duration-200">
            <div className="h-12 px-3 border-b flex items-center justify-between shrink-0 bg-muted/30">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="size-4 text-primary" />
                <span className="text-sm font-bold text-foreground">Filtros da Área</span>
                {activeCount > 0 && (
                  <span className="size-5 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                    {activeCount}
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileFilterOpen(false)}
                className="size-8"
              >
                <X className="size-4" />
              </Button>
            </div>

            <div className="flex-1 overflow-hidden min-h-0">
              <FilterPanel
                filters={filters}
                onChange={onChange}
                showPeriod={showPeriod}
                onPresetSaved={onPresetSaved}
              />
            </div>

            <div className="p-3 border-t bg-muted/20 shrink-0">
              <Button
                className="w-full font-bold"
                size="sm"
                onClick={() => setMobileFilterOpen(false)}
              >
                Ver Ocorrências Filtradas
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
