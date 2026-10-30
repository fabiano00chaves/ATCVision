import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Network, Check, X, Trash2 } from 'lucide-react'
import { FunctionalLocationTreeView } from './FunctionalLocationTreeView'

interface FunctionalLocationTreeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  value?: string[]
  onApply: (selectedLocations: string[]) => void
  arvorePlantaFilter?: string
}

export function FunctionalLocationTreeModal({
  open,
  onOpenChange,
  value = [],
  onApply,
  arvorePlantaFilter,
}: FunctionalLocationTreeModalProps) {
  const [selected, setSelected] = useState<string[]>(value)

  useEffect(() => {
    if (open) {
      setSelected(value)
    }
  }, [open, value])

  const handleToggle = (code: string) => {
    setSelected((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    )
  }

  const handleRemoveOne = (code: string) => {
    setSelected((prev) => prev.filter((c) => c !== code))
  }

  const handleClear = () => {
    setSelected([])
  }

  const handleConfirm = () => {
    onApply(selected)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-5">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Network className="size-5 text-primary" />
            Navegador da Árvore de Posições Funcionais
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Selecione nós ou ramificações hierárquicas da planta. Qualquer nó selecionado (ex: BT-ST-SLM1-21)
            filtrará automaticamente todas as ocorrências filhas e equipamentos desse ramo.
          </DialogDescription>
        </DialogHeader>

        {/* Tree Container */}
        <div className="flex-1 min-h-[350px] overflow-hidden py-1">
          <FunctionalLocationTreeView
            selectedCodes={selected}
            onToggleCode={handleToggle}
            arvorePlantaFilter={arvorePlantaFilter}
            showRebuildAction={true}
          />
        </div>

        {/* Selected nodes summary */}
        {selected.length > 0 && (
          <div className="shrink-0 p-2 rounded-lg bg-muted/40 border border-border/50 space-y-1.5 mt-1 max-h-24 overflow-y-auto">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-foreground">
                Selecionados para o Filtro ({selected.length}):
              </span>
              <button
                type="button"
                onClick={handleClear}
                className="text-[11px] text-muted-foreground hover:text-destructive flex items-center gap-1"
              >
                <Trash2 className="size-3" /> Limpar todos
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {selected.map((code) => (
                <Badge
                  key={code}
                  variant="secondary"
                  className="font-mono text-[10px] py-0 px-1.5 gap-1 bg-background border"
                >
                  <span>{code}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveOne(code)}
                    className="text-muted-foreground hover:text-destructive ml-0.5"
                  >
                    <X className="size-2.5" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Footer actions */}
        <DialogFooter className="border-t pt-3 flex items-center justify-between shrink-0 mt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleConfirm}
            className="gap-1.5 text-xs font-semibold"
          >
            <Check className="size-3.5" />
            Aplicar Seleção {selected.length > 0 && `(${selected.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
