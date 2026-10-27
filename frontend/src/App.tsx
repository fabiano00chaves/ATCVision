import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { AppShell } from '@/components/layout/AppShell'
import { Login } from '@/pages/Login'
import { DailyReport } from '@/pages/DailyReport'
import { Occurrences } from '@/pages/Occurrences'
import { Dashboards } from '@/pages/Dashboards'
import { Reports } from '@/pages/Reports'
import { Documents } from '@/pages/Documents'
import { Settings } from '@/pages/Settings'
import { Loader2 } from 'lucide-react'

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
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
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
        </BrowserRouter>
        <Toaster richColors position="top-right" closeButton theme="dark" />
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App
