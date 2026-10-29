import React, { useState } from 'react'
import type { Preset } from '@/api/types'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Clock,
  Compass,
  Filter,
  Flame,
  Layers,
  OctagonAlert,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  X,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface QuickbarPresetSelectProps {
  presets: Preset[]
  activePresetId?: string
  counts?: Record<string, number>
  onSelect: (preset: Preset) => void
  onClear: () => void
  onManage?: () => void
  className?: string
}

export function QuickbarPresetSelect({
  presets,
  activePresetId,
  counts = {},
  onSelect,
  onClear,
  onManage,
  className,
}: QuickbarPresetSelectProps) {
  const [open, setOpen] = useState(false)

  const activePreset = presets.find((p) => p.id === activePresetId)
  const activeCount = activePreset ? (counts[activePreset.id] ?? 0) : 0

  const getPresetIcon = (iconName?: string, className = 'size-3.5') => {
    switch (iconName) {
      case 'Zap':
        return <Zap className={className} />
      case 'Flame':
        return <Flame className={className} />
      case 'AlertTriangle':
        return <AlertTriangle className={className} />
      case 'OctagonAlert':
        return <OctagonAlert className={className} />
      case 'Search':
        return <Search className={className} />
      case 'Star':
        return <Star className={className} />
      case 'Layers':
        return <Layers className={className} />
      case 'Compass':
        return <Compass className={className} />
      case 'Clock':
        return <Clock className={className} />
      default:
        return <Filter className={className} />
    }
  }

  return (
    <div className={cn('inline-flex items-center gap-1 shrink-0', className)}>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="xs"
            variant={activePreset ? 'default' : 'outline'}
            className={cn(
              'h-7 px-2.5 text-xs font-semibold gap-1.5 transition-all cursor-pointer max-w-[240px]',
              activePreset
                ? 'bg-primary text-primary-foreground border-primary font-bold shadow-xs'
                : 'bg-background hover:bg-muted text-foreground border-border/80'
            )}
            title={activePreset ? `Foco ativo: ${activePreset.name}` : 'Selecionar foco rápido'}
          >
            {activePreset ? (
              getPresetIcon(activePreset.icon, 'size-3 text-amber-300 fill-amber-300')
            ) : (
              <Sparkles className="size-3 text-primary shrink-0" />
            )}

            <span className="truncate">
              {activePreset ? activePreset.name : 'Foco Rápido'}
            </span>

            {activePreset && (
              <span className="text-[10px] px-1 py-0.2 rounded-full font-bold font-mono bg-primary-foreground/20 text-primary-foreground shrink-0">
                {activeCount}
              </span>
            )}

            <ChevronDown className="size-3 opacity-60 shrink-0 ml-0.5" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-64 p-1 z-50 text-xs">
          <div className="text-[10px] uppercase font-bold text-muted-foreground px-2 py-1 flex items-center justify-between select-none">
            <span>Foco Rápido (Presets)</span>
            <span className="font-mono text-[9px]">{presets.length} focos</span>
          </div>

          <DropdownMenuItem
            onClick={() => {
              onClear()
              setOpen(false)
            }}
            className={cn(
              'gap-2 px-2 py-1.5 cursor-pointer rounded-sm text-xs',
              !activePreset && 'font-bold bg-muted/60'
            )}
          >
            <Filter className="size-3.5 text-muted-foreground" />
            <span className="flex-1">Todos (Sem Foco Rápido)</span>
            {!activePreset && <Check className="size-3 text-primary shrink-0" />}
          </DropdownMenuItem>

          <DropdownMenuSeparator className="my-1" />

          <DropdownMenuGroup>
            {presets.map((preset) => {
              const count = counts[preset.id] ?? 0
              const isSelected = preset.id === activePresetId

              return (
                <DropdownMenuItem
                  key={preset.id}
                  onClick={() => {
                    onSelect(preset)
                    setOpen(false)
                  }}
                  className={cn(
                    'gap-2 px-2 py-1.5 cursor-pointer rounded-sm text-xs flex items-center justify-between',
                    isSelected && 'bg-primary/10 text-primary font-bold'
                  )}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className={cn(isSelected ? 'text-primary' : 'text-muted-foreground')}>
                      {getPresetIcon(preset.icon, 'size-3.5')}
                    </span>
                    <span className="truncate">{preset.name}</span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <span
                      className={cn(
                        'text-[10px] px-1.5 py-0.2 rounded font-mono font-bold',
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {count}
                    </span>
                    {isSelected && <Check className="size-3 text-primary shrink-0" />}
                  </div>
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuGroup>

          {onManage && (
            <>
              <DropdownMenuSeparator className="my-1" />
              <DropdownMenuItem
                onClick={() => {
                  setOpen(false)
                  onManage()
                }}
                className="gap-2 px-2 py-1.5 cursor-pointer text-muted-foreground hover:text-foreground text-[11px]"
              >
                <SlidersHorizontal className="size-3 text-primary" />
                <span>Gerenciar / Criar Focos...</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Quick Clear [X] Button when preset is active */}
      {activePreset && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClear}
          className="size-7 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 cursor-pointer"
          title="Desativar foco rápido"
        >
          <X className="size-3.5" />
        </Button>
      )}
    </div>
  )
}
