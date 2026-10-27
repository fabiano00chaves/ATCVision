import React, { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, Eye, EyeOff, Loader2, Lock, Mail, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'

export function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return
    setError(null)
    setLoading(true)
    try {
      await login(email, password)
      toast.success('Autenticado com sucesso!')
      navigate('/')
    } catch (err: any) {
      setError(err.message || 'Falha na autenticação. Verifique suas credenciais.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center space-y-1">
          <div className="inline-flex size-12 rounded-xl bg-amber-600 items-center justify-center text-white font-mono font-bold text-lg shadow-md mb-2">
            ATC
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">ATC Vision</h1>
          <p className="text-xs text-muted-foreground">
            Auditoria Visual e Gestão de Confiabilidade SAP PM
          </p>
        </div>

        <Card className="shadow-md border-border/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Acesso ao Sistema</CardTitle>
            <CardDescription className="text-xs">
              Entre com suas credenciais corporativas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-3">
              {error && (
                <div className="p-2 rounded bg-red-50 dark:bg-red-950/50 border border-red-300 dark:border-red-900 text-red-600 dark:text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">E-mail</label>
                <div className="relative">
                  <Mail className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@vision.fk.adm.br"
                    required
                    className="pl-8 text-xs h-8"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">Senha</label>
                <div className="relative">
                  <Lock className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="pl-8 pr-8 text-xs h-8"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full mt-2" size="sm" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin mr-1.5" />
                    Entrando...
                  </>
                ) : (
                  'Entrar'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-[10px] text-muted-foreground font-mono">
          ArcelorMittal Tubarão • Aciaria / Refino Secundário
        </p>
      </div>
    </div>
  )
}
