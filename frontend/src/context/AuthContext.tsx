import React, { createContext, useContext, useEffect, useState } from 'react'
import { authApi } from '@/api'
import { setUnauthorizedHandler } from '@/api/client'
import type { User } from '@/api/types'

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, pass: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    try {
      const me = await authApi.me()
      setUser(me)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null)
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    })
    refresh()
  }, [])

  const login = async (email: string, pass: string) => {
    const res = await authApi.login(email, pass)
    setUser(res.user)
  }

  const logout = async () => {
    try {
      await authApi.logout()
    } finally {
      setUser(null)
      window.location.href = '/login'
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
