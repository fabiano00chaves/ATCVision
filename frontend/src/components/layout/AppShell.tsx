import React from 'react'
import { Outlet } from 'react-router'
import { AppHeader } from './AppHeader'
import { AppSidebar, MobileTabBar } from './AppSidebar'

export function AppShell() {
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background text-foreground">
      <AppHeader />
      <div className="flex flex-1 overflow-hidden">
        <AppSidebar />
        <main className="flex-1 flex flex-col overflow-hidden relative">
          <Outlet />
        </main>
      </div>
      <MobileTabBar />
    </div>
  )
}
