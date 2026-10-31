import React, { Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SidebarProvider } from '@/context/SidebarContext'
import { WorkspaceLayoutProvider } from '@/context/WorkspaceLayoutContext'
import { Toaster } from 'sonner'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { AppShell } from '@/components/layout/AppShell'
import { Loader2 } from 'lucide-react'

// Code-split dynamic page imports for optimal initial bundle size
const Login = React.lazy(() => import('@/pages/Login').then((m) => ({ default: m.Login })))
const DailyReport = React.lazy(() => import('@/pages/DailyReport').then((m) => ({ default: m.DailyReport })))
const Occurrences = React.lazy(() => import('@/pages/Occurrences').then((m) => ({ default: m.Occurrences })))
const Dashboards = React.lazy(() => import('@/pages/Dashboards').then((m) => ({ default: m.Dashboards })))
const Reports = React.lazy(() => import('@/pages/Reports').then((m) => ({ default: m.Reports })))
const Documents = React.lazy(() => import('@/pages/Documents').then((m) => ({ default: m.Documents })))
const Settings = React.lazy(() => import('@/pages/Settings').then((m) => ({ default: m.Settings })))

function PageFallback() {
  return (
    <div className="flex h-[calc(100vh-4rem)] w-full items-center justify-center text-muted-foreground">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="size-7 animate-spin text-primary" />
        <span className="text-xs font-mono">Carregando visão ATC...</span>
      </div>
    </div>
  )
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 1000 * 60 * 2,
    },
  },
})

function ProtectedLayout() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-primary" />
          <span className="text-xs text-muted-foreground font-mono">
            Carregando sessão ATC Vision...
          </span>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <AppShell />
}

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return null
  }

  if (user) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

export function App() {
  return (
    <ErrorBoundary fallbackTitle="Falha Crítica na Aplicação ATC Vision">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider delayDuration={200}>
            <SidebarProvider>
              <WorkspaceLayoutProvider>
                <BrowserRouter>
                  <Suspense fallback={<PageFallback />}>
                    <Routes>
                      <Route
                        path="/login"
                        element={
                          <PublicOnlyRoute>
                            <Login />
                          </PublicOnlyRoute>
                        }
                      />
                      <Route element={<ProtectedLayout />}>
                        <Route path="/" element={<DailyReport />} />
                        <Route path="/ocorrencias" element={<Occurrences />} />
                        <Route path="/ocorrencias/:id" element={<Occurrences />} />
                        <Route path="/dashboards" element={<Dashboards />} />
                        <Route path="/relatorios" element={<Reports />} />
                        <Route path="/documentos" element={<Documents />} />
                        <Route path="/config" element={<Settings />} />
                      </Route>
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </Suspense>
                </BrowserRouter>
                <Toaster richColors position="top-right" closeButton theme="dark" />
              </WorkspaceLayoutProvider>
            </SidebarProvider>
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
