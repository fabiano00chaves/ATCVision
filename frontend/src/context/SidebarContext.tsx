import React, { createContext, useContext, useEffect, useState } from 'react'

interface SidebarContextType {
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
  toggleCollapsed: () => void
  isHovered: boolean
  setIsHovered: (hovered: boolean) => void
  isExpanded: boolean // true if pinned-expanded or temporarily hovered
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined)

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsedState] = useState<boolean>(() => {
    try {
      return localStorage.getItem('atc_sidebar_collapsed') === 'true'
    } catch {
      return false
    }
  })
  const [isHovered, setIsHovered] = useState<boolean>(false)

  const setCollapsed = (val: boolean) => {
    setCollapsedState(val)
    try {
      localStorage.setItem('atc_sidebar_collapsed', String(val))
    } catch {
      // Ignored
    }
  }

  const toggleCollapsed = () => {
    setCollapsed(!collapsed)
  }

  // Global keyboard shortcut: Ctrl+B or Cmd+B to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
        if (['input', 'textarea', 'select'].includes(tag)) return
        e.preventDefault()
        toggleCollapsed()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [collapsed])

  // Active expanded view if not collapsed, or if collapsed but currently hovered
  const isExpanded = !collapsed || isHovered

  return (
    <SidebarContext.Provider
      value={{
        collapsed,
        setCollapsed,
        toggleCollapsed,
        isHovered,
        setIsHovered,
        isExpanded,
      }}
    >
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  const ctx = useContext(SidebarContext)
  if (!ctx) {
    throw new Error('useSidebar must be used within a SidebarProvider')
  }
  return ctx
}
