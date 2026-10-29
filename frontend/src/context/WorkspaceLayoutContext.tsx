import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'

/**
 * Workspace layout preferences shared by every occurrence-centric screen.
 *
 * - filterPanelMode: 'pinned' (fixed open), 'rail' (thin rail, opens on hover/click) or 'hidden'
 * - headerCollapsed: collapses page top bars (routine, KPIs, Foco Rápido) into a one-line summary
 * - focusMode: hides app header, navigation, page top bars and the filter panel (max. reading area)
 *
 * Every preference (except the transient mobile drawer) is persisted in localStorage.
 */
export type FilterPanelMode = 'pinned' | 'rail' | 'hidden'

interface WorkspaceLayoutContextType {
  filterPanelMode: FilterPanelMode
  setFilterPanelMode: (m: FilterPanelMode) => void
  toggleFilterPanel: () => void
  mobileFilterOpen: boolean
  setMobileFilterOpen: (open: boolean) => void
  headerCollapsed: boolean
  setHeaderCollapsed: (v: boolean) => void
  toggleHeader: () => void
  focusMode: boolean
  setFocusMode: (v: boolean) => void
  toggleFocusMode: () => void
}

const WorkspaceLayoutContext = createContext<WorkspaceLayoutContextType | undefined>(undefined)

const LS_PANEL = 'atc_filter_panel_mode'
const LS_HEADER = 'atc_header_collapsed'
const LS_FOCUS = 'atc_focus_mode'

function readLS(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeLS(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Ignored (private mode / quota)
  }
}

const isMobileViewport = () => typeof window !== 'undefined' && window.innerWidth < 768

export function WorkspaceLayoutProvider({ children }: { children: React.ReactNode }) {
  const [filterPanelMode, setModeState] = useState<FilterPanelMode>(() => {
    const saved = readLS(LS_PANEL) as FilterPanelMode | null
    if (saved === 'pinned' || saved === 'rail' || saved === 'hidden') return saved
    // Wide monitors start pinned, notebooks start as a thin rail to preserve area
    return typeof window !== 'undefined' && window.innerWidth >= 1600 ? 'pinned' : 'rail'
  })
  const [headerCollapsed, setHeaderState] = useState<boolean>(() => readLS(LS_HEADER) === 'true')
  const [focusMode, setFocusState] = useState<boolean>(() => readLS(LS_FOCUS) === 'true')
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false)

  const setFilterPanelMode = useCallback((m: FilterPanelMode) => {
    setModeState(m)
    writeLS(LS_PANEL, m)
  }, [])

  const toggleFilterPanel = useCallback(() => {
    if (isMobileViewport()) {
      setMobileFilterOpen((o) => !o)
      return
    }
    setModeState((prev) => {
      const next: FilterPanelMode = prev === 'pinned' ? 'rail' : 'pinned'
      writeLS(LS_PANEL, next)
      return next
    })
  }, [])

  const setHeaderCollapsed = useCallback((v: boolean) => {
    setHeaderState(v)
    writeLS(LS_HEADER, String(v))
  }, [])

  const toggleHeader = useCallback(() => {
    setHeaderState((prev) => {
      writeLS(LS_HEADER, String(!prev))
      return !prev
    })
  }, [])

  const setFocusMode = useCallback((v: boolean) => {
    setFocusState(v)
    writeLS(LS_FOCUS, String(v))
  }, [])

  const toggleFocusMode = useCallback(() => {
    setFocusState((prev) => {
      writeLS(LS_FOCUS, String(!prev))
      return !prev
    })
  }, [])

  // Global keyboard shortcuts
  //   Ctrl+Shift+F → toggle filter panel (pinned ↔ rail / mobile drawer)
  //   Ctrl+Shift+H → collapse / expand page top bars
  //   Ctrl+.       → toggle Focus Mode
  //   Esc          → leave Focus Mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      const inField = ['input', 'textarea', 'select'].includes(tag)
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()

      if (mod && e.shiftKey && key === 'f') {
        e.preventDefault()
        toggleFilterPanel()
      } else if (mod && e.shiftKey && key === 'h') {
        e.preventDefault()
        toggleHeader()
      } else if (mod && key === '.') {
        e.preventDefault()
        toggleFocusMode()
      } else if (key === 'escape' && !inField) {
        if (focusMode) setFocusMode(false)
        if (mobileFilterOpen) setMobileFilterOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [focusMode, mobileFilterOpen, toggleFilterPanel, toggleHeader, toggleFocusMode, setFocusMode])

  return (
    <WorkspaceLayoutContext.Provider
      value={{
        filterPanelMode,
        setFilterPanelMode,
        toggleFilterPanel,
        mobileFilterOpen,
        setMobileFilterOpen,
        headerCollapsed,
        setHeaderCollapsed,
        toggleHeader,
        focusMode,
        setFocusMode,
        toggleFocusMode,
      }}
    >
      {children}
    </WorkspaceLayoutContext.Provider>
  )
}

export function useWorkspaceLayout() {
  const ctx = useContext(WorkspaceLayoutContext)
  if (!ctx) throw new Error('useWorkspaceLayout must be used within a WorkspaceLayoutProvider')
  return ctx
}
