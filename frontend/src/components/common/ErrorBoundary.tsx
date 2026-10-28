import React, { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
  fallbackTitle?: string
  fallbackMessage?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary capturou erro:', error, errorInfo)
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full min-h-[220px] flex-col items-center justify-center p-6 text-center bg-card border rounded-lg m-2">
          <div className="flex size-12 items-center justify-center rounded-full bg-red-500/10 text-red-500 mb-3">
            <AlertTriangle className="size-6" />
          </div>
          <h3 className="text-sm font-bold text-foreground">
            {this.props.fallbackTitle || 'Ocorreu uma falha ao renderizar este componente'}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-md">
            {this.props.fallbackMessage ||
              'Um erro inesperado aconteceu durante a exibição. Você pode tentar recarregar ou verificar o console.'}
          </p>
          {this.state.error && (
            <pre className="mt-3 p-2 bg-muted/60 text-muted-foreground text-[10px] font-mono rounded max-w-lg overflow-x-auto text-left">
              {this.state.error.message}
            </pre>
          )}
          <div className="mt-4 flex gap-2">
            <Button size="sm" variant="outline" onClick={this.handleReset}>
              <RefreshCw className="size-3.5 mr-1.5" /> Tentar Novamente
            </Button>
            <Button size="sm" variant="default" onClick={() => window.location.reload()}>
              Recarregar Página
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
