import React from 'react'
import { NavLink } from 'react-router'
import {
  BarChart3,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  ListFilter,
  PanelLeft,
  PanelLeftClose,
  Pin,
  PinOff,
  Settings,
} from 'lucide-react'
import { useSidebar } from '@/context/SidebarContext'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const NAV_ITEMS = [
  { to: '/', label: 'Relatório Diário', icon: CalendarCheck, end: true },
  { to: '/ocorrencias', label: 'Explorador SAP', icon: ListFilter, end: false },
  { to: '/dashboards', label: 'Confiabilidade', icon: BarChart3, end: false },
  { to: '/relatorios', label: 'Gerador Executivo', icon: FileSpreadsheet, end: false },
  { to: '/documentos', label: 'Documentos PDF', icon: FileText, end: false },
  { to: '/config', label: 'Configurações', icon: Settings, end: false },
]

export function AppSidebar() {
  const { collapsed, toggleCollapsed, isHovered, setIsHovered, isExpanded } = useSidebar()

  return (
    <div
      className={cn(
        'relative shrink-0 hidden md:flex transition-all duration-300 ease-in-out',
        collapsed ? 'w-14' : 'w-52'
      )}
    >
      <aside
        onMouseEnter={() => collapsed && setIsHovered(true)}
        onMouseLeave={() => collapsed && setIsHovered(false)}
        className={cn(
          'border-r bg-sidebar flex flex-col h-full transition-all duration-300 ease-in-out select-none',
          collapsed && isHovered
            ? 'absolute left-0 top-0 bottom-0 w-52 shadow-2xl z-40 bg-card/95 backdrop-blur-md'
            : collapsed
            ? 'w-14 items-center'
            : 'w-52'
        )}
      >
        {/* Sidebar Header / Pinned state header */}
        <div
          className={cn(
            'p-3 flex items-center shrink-0 border-b border-border/40',
            isExpanded ? 'justify-between px-3' : 'justify-center p-2'
          )}
        >
          {isExpanded ? (
            <>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">
                Navegação
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleCollapsed}
                    className="size-6 text-muted-foreground hover:text-foreground"
                  >
                    {collapsed ? (
                      <Pin className="size-3.5 text-primary" />
                    ) : (
                      <PanelLeftClose className="size-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {collapsed ? 'Fixar menu aberto' : 'Recolher menu lateral (Ctrl+B)'}
                </TooltipContent>
              </Tooltip>
            </>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleCollapsed}
                  className="size-7 text-muted-foreground hover:text-foreground"
                >
                  <PanelLeft className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Expandir menu (Ctrl+B)</TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Navigation Items List */}
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto overflow-x-hidden">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const linkContent = (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 rounded-md text-xs font-medium transition-colors',
                    isExpanded ? 'px-2.5 py-1.5' : 'size-9 justify-center p-0',
                    isActive
                      ? 'bg-primary/15 text-primary font-semibold ring-1 ring-primary/30 shadow-xs'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )
                }
              >
                <Icon className="size-4 shrink-0" />
                {isExpanded && <span className="truncate">{item.label}</span>}
              </NavLink>
            )

            // When collapsed and not hovered, show tooltip on hover
            if (!isExpanded) {
              return (
                <Tooltip key={item.to}>
                  <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                  <TooltipContent side="right" className="font-semibold text-xs">
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              )
            }

            return linkContent
          })}
        </nav>

        {/* Sidebar Footer */}
        <div
          className={cn(
            'mt-auto border-t border-border/40 shrink-0 text-muted-foreground transition-all duration-200',
            isExpanded ? 'p-3 text-[11px] space-y-1' : 'p-2 flex flex-col items-center justify-center'
          )}
        >
          {isExpanded ? (
            <div className="flex items-center justify-between">
              <div className="truncate">
                <p className="font-semibold text-foreground text-xs leading-none">Aciaria & Refino</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 truncate">ArcelorMittal Tubarão</p>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleCollapsed}
                    className="size-6 text-muted-foreground hover:text-foreground shrink-0 ml-1"
                  >
                    <ChevronLeft className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Recolher (Ctrl+B)</TooltipContent>
              </Tooltip>
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggleCollapsed}
                  className="size-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted text-[10px] font-bold"
                >
                  <ChevronRight className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Expandir menu (Ctrl+B)</TooltipContent>
            </Tooltip>
          )}
        </div>
      </aside>
    </div>
  )
}

export function MobileTabBar() {
  return (
    <nav className="h-12 border-t bg-card flex items-center justify-around md:hidden shrink-0 z-30">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center justify-center py-1 text-[10px] transition-colors',
                isActive ? 'text-primary font-bold' : 'text-muted-foreground'
              )
            }
          >
            <Icon className="size-4" />
            <span className="truncate max-w-[60px] text-[9px]">{item.label.split(' ')[0]}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}
