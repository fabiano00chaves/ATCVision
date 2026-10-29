import React from 'react'
import { Outlet } from 'react-router'
import { AppHeader } from './AppHeader'
import { AppSidebar, MobileTabBar } from './AppSidebar'
import { useWorkspaceLayout } from '@/context/WorkspaceLayoutContext'
import { Button } from '@/components/ui/button'
import { Minimize2 } from 'lucide-react'

export function AppShell() {
  const { focusMode, toggleFocusMode } = useWorkspaceLayout()

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background text-foreground relative">
      {/* In focus mode, hide top header for maximum reading area */}
      {!focusMode && <AppHeader />}

      <div className="flex flex-1 overflow-hidden relative">
        {/* In focus mode, hide main navigation sidebar */}
        {!focusMode && <AppSidebar />}

        <main className="flex-1 flex flex-col overflow-hidden relative">
          <Outlet />
        </main>
      </div>

      {/* In focus mode, hide mobile tab bar */}
      {!focusMode && <MobileTabBar />}

      {/* Floating Exit Button for Focus Mode */}
      {focusMode && (
        <div className="fixed top-2 right-3 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          <Button
            size="xs"
            variant="default"
            onClick={toggleFocusMode}
            className="h-7 text-xs font-semibold gap-1.5 shadow-xl bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-3"
            title="Sair do Modo Foco e restaurar navegação (Esc ou Ctrl+.)"
          >
            <Minimize2 className="size-3.5" />
            <span>Sair do Modo Foco (Esc)</span>
          </Button>
        </div>
      )}
    </div>
  )
}
