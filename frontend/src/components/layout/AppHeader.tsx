import React, { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { UploadModal } from './UploadModal'
import {
  Activity,
  FileUp,
  LogOut,
  Moon,
  Shield,
  Sun,
  User,
} from 'lucide-react'

export function AppHeader() {
  const { user, logout } = useAuth()
  const [uploadOpen, setUploadOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('atc_theme') as 'light' | 'dark') || 'dark'
  })

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    localStorage.setItem('atc_theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }

  return (
    <>
      <header className="h-12 border-b bg-card px-4 flex items-center justify-between z-30 shrink-0">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2 font-bold tracking-wider text-sm">
            <div className="size-7 rounded bg-amber-600 flex items-center justify-center text-white shadow-xs font-mono text-xs">
              ATC
            </div>
            <div className="flex flex-col">
              <span className="font-mono text-xs tracking-wider uppercase font-bold text-foreground">
                Vision <span className="text-[10px] text-primary font-normal">v1.0</span>
              </span>
              <span className="text-[9px] text-muted-foreground leading-none">
                Confiabilidade & Auditoria SAP PM
              </span>
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            className="h-7 text-xs font-medium"
            onClick={() => setUploadOpen(true)}
          >
            <FileUp className="size-3.5" />
            <span className="hidden sm:inline">Ingerir PDF SAP</span>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
          >
            {theme === 'dark' ? <Sun className="size-3.5 text-amber-400" /> : <Moon className="size-3.5" />}
          </Button>

          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs">
                  <div className="size-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="hidden md:inline font-medium max-w-[120px] truncate">{user.name}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 text-xs">
                <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
                  <p className="font-semibold text-foreground truncate">{user.name}</p>
                  <p className="truncate">{user.email}</p>
                </div>
                <DropdownMenuSeparator />
                {user.is_admin && (
                  <DropdownMenuItem asChild>
                    <Link to="/config" className="cursor-pointer">
                      <Shield className="size-3.5 mr-2" />
                      Configurações do Sistema
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={logout} className="text-red-600 dark:text-red-400 cursor-pointer">
                  <LogOut className="size-3.5 mr-2" />
                  Sair do Sistema
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>

      <UploadModal open={uploadOpen} onOpenChange={setUploadOpen} />
    </>
  )
}
