import React from 'react'
import { NavLink } from 'react-router'
import {
  BarChart3,
  CalendarCheck,
  FileSpreadsheet,
  FileText,
  ListFilter,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { to: '/', label: 'Relatório Diário', icon: CalendarCheck, end: true },
  { to: '/ocorrencias', label: 'Explorador SAP', icon: ListFilter, end: false },
  { to: '/dashboards', label: 'Confiabilidade', icon: BarChart3, end: false },
  { to: '/relatorios', label: 'Gerador Executivo', icon: FileSpreadsheet, end: false },
  { to: '/documentos', label: 'Documentos PDF', icon: FileText, end: false },
  { to: '/config', label: 'Configurações', icon: Settings, end: false },
]

export function AppSidebar() {
  return (
    <aside className="w-52 border-r bg-sidebar flex-col shrink-0 hidden md:flex">
      <div className="p-3 space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1">
          Navegação
        </p>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors',
                  isActive
                    ? 'bg-primary/15 text-primary font-semibold'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )
              }
            >
              <Icon className="size-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </div>

      <div className="mt-auto p-3 border-t text-[11px] text-muted-foreground space-y-1">
        <p className="font-semibold text-foreground">Aciaria & Refino</p>
        <p className="text-[10px] text-muted-foreground leading-tight">
          ArcelorMittal Tubarão
          <br />
          Host: vision.fk.adm.br
        </p>
      </div>
    </aside>
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
