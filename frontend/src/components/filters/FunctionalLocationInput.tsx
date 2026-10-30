import React, { useState, useEffect, useRef } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  ClipboardList,
  Compass,
  FileSpreadsheet,
  Network,
  Plus,
  Sparkles,
  Tag,
  Trash2,
  X,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { functionalLocationsApi } from '@/api'
import type { FunctionalLocationNode } from '@/api/types'
import { FunctionalLocationTreeModal } from '@/components/functional-locations/FunctionalLocationTreeModal'

interface FunctionalLocationInputProps {
  value?: string[]
  onChange: (locations: string[]) => void
  placeholder?: string
  className?: string
  compact?: boolean
  arvorePlantaFilter?: string
}

const COMMON_PLANT_AREAS = [
  { code: 'BT-ST-SLM1', label: 'Refino Secundário (SLM1)' },
  { code: 'BT-ST-BOF1', label: 'Aciaria LD (BOF1)' },
  { code: 'BT-ST-CCS1', label: 'Lingotamento Contínuo 1 (CCS1)' },
  { code: 'BT-ST-CCS2', label: 'Lingotamento Contínuo 2 (CCS2)' },
  { code: 'BT-ST-CCS3', label: 'Lingotamento Contínuo 3 (CCS3)' },
  { code: 'BT-ST-PCC1', label: 'Pátio de Placas (PCC1)' },
]

export function FunctionalLocationInput({
  value = [],
  onChange,
  placeholder = 'Ex: BT-ST-SLM1, SLM1-PAN01 (Pressione Enter)...',
  className,
  compact = false,
  arvorePlantaFilter,
}: FunctionalLocationInputProps) {
  const [inputValue, setInputValue] = useState('')
  const [pasteModeOpen, setPasteModeOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [treeModalOpen, setTreeModalOpen] = useState(false)

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<FunctionalLocationNode[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Search suggestions on input change
  useEffect(() => {
    const trimmed = inputValue.trim()
    if (trimmed.length < 2) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    const timer = setTimeout(async () => {
      try {
        setLoadingSuggestions(true)
        const results = await functionalLocationsApi.search(trimmed, 8)
        setSuggestions(results)
        setShowSuggestions(results.length > 0)
      } catch (err) {
        console.error('Error fetching suggestions:', err)
      } finally {
        setLoadingSuggestions(false)
      }
    }, 200)

    return () => clearTimeout(timer)
  }, [inputValue])

  // Close suggestions on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Add a single tag
  const handleAddTag = (textToAdd?: string) => {
    const raw = (textToAdd !== undefined ? textToAdd : inputValue).trim()
    if (!raw) return

    const tokens = raw
      .split(/[,;\n\r\t]+/)
      .map((t) => t.trim().toUpperCase())
      .filter((t) => t.length > 0)

    if (tokens.length === 0) return

    const next = Array.from(new Set([...value, ...tokens]))
    onChange(next)
    setInputValue('')
    setShowSuggestions(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddTag()
    } else if (e.key === ',' || e.key === ';') {
      e.preventDefault()
      handleAddTag()
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  // Remove single tag
  const handleRemoveTag = (tagToRemove: string) => {
    onChange(value.filter((t) => t !== tagToRemove))
  }

  // Clear all
  const handleClearAll = () => {
    onChange([])
  }

  // Process bulk paste
  const handleProcessBulkPaste = () => {
    if (!pasteText.trim()) return

    const tokens = pasteText
      .split(/[,;\n\r\t]+/)
      .map((t) => t.trim().toUpperCase())
      .filter((t) => t.length > 0)

    if (tokens.length === 0) {
      toast.error('Nenhuma posição funcional válida encontrada no texto')
      return
    }

    const next = Array.from(new Set([...value, ...tokens]))
    const addedCount = next.length - value.length
    onChange(next)
    setPasteText('')
    setPasteModeOpen(false)
    toast.success(`${tokens.length} posições funcionais processadas (${addedCount} novas adicionadas)!`)
  }

  return (
    <div ref={containerRef} className={cn('space-y-2 text-xs relative', className)}>
      {/* Input bar with quick actions */}
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Tag className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
          <Input
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value)
              if (!showSuggestions && e.target.value.length >= 2) {
                setShowSuggestions(true)
              }
            }}
            onFocus={() => {
              if (suggestions.length > 0) setShowSuggestions(true)
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="pl-8 pr-16 h-7 text-xs font-mono bg-background"
          />

          {loadingSuggestions ? (
            <Loader2 className="absolute right-2 top-2 size-3 text-muted-foreground animate-spin" />
          ) : inputValue ? (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() => handleAddTag()}
              className="absolute right-1 top-0.5 h-6 px-1.5 text-primary text-[10px]"
            >
              <Plus className="size-3 mr-0.5" /> Adicionar
            </Button>
          ) : null}

          {/* Autocomplete floating suggestions */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-50 left-0 right-0 top-8 bg-popover border border-border rounded-md shadow-lg overflow-hidden py-1 max-h-56 overflow-y-auto animate-in fade-in-50 zoom-in-95">
              <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground border-b border-border/40">
                Posições Funcionais Aprendidas
              </div>
              {suggestions.map((item) => (
                <button
                  key={item.full_code}
                  type="button"
                  onClick={() => handleAddTag(item.full_code)}
                  className="w-full text-left px-2.5 py-1.5 hover:bg-muted/80 flex items-center justify-between gap-2 transition-colors border-b border-border/20 last:border-0"
                >
                  <div className="min-w-0">
                    <div className="font-mono text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <span>{item.full_code}</span>
                      {item.arvore_planta && (
                        <span className="text-[10px] text-muted-foreground font-normal">
                          ({item.arvore_planta})
                        </span>
                      )}
                    </div>
                    {(item.custom_label || item.description) && (
                      <div className="text-[11px] text-muted-foreground truncate">
                        {item.custom_label || item.description}
                      </div>
                    )}
                  </div>
                  {item.occurrence_count > 0 && (
                    <Badge variant="outline" className="text-[10px] py-0 px-1 font-mono shrink-0">
                      {item.occurrence_count} ocorr.
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Tree Navigator Button */}
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() => setTreeModalOpen(true)}
          className="h-7 gap-1 text-[11px] shrink-0 border-primary/30 hover:bg-primary/5 text-primary"
          title="Navegar e selecionar nós da árvore de posições funcionais"
        >
          <Network className="size-3 text-primary" />
          <span>Árvore de PFs</span>
        </Button>

        <Button
          type="button"
          size="xs"
          variant={pasteModeOpen ? 'default' : 'outline'}
          onClick={() => setPasteModeOpen(!pasteModeOpen)}
          className="h-7 gap-1 text-[11px] shrink-0"
          title="Colar lista de Posições Funcionais copiadas do Excel ou Bloco de Notas"
        >
          <FileSpreadsheet className="size-3" />
          <span>Colar Lista</span>
        </Button>

        {value.length > 0 && (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={handleClearAll}
            className="h-7 text-muted-foreground hover:text-red-500 text-[11px] shrink-0"
            title="Remover todas as Posições Funcionais"
          >
            Limpar ({value.length})
          </Button>
        )}
      </div>

      {/* Bulk Paste Box (Excel / Notepad) */}
      {pasteModeOpen && (
        <div className="p-2.5 bg-muted/40 border border-primary/30 rounded-lg space-y-2 animate-in fade-in-50 duration-150">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <ClipboardList className="size-3.5 text-primary" />
              Colar Lista de Posições Funcionais (Excel / Bloco de Notas):
            </span>
            <button
              type="button"
              onClick={() => setPasteModeOpen(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <Textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Cole aqui a coluna de PFs copiada do Excel ou separadas por vírgula / ponto-e-vírgula...&#10;Exemplo:&#10;BT-ST-SLM1-PAN01&#10;BT-ST-SLM1-PAN02&#10;BT-ST-SLM1-FOR01"
            className="text-xs font-mono h-24 bg-background resize-y"
          />

          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              Separação automática por quebras de linha, vírgulas ou ponto-e-vírgula.
            </span>
            <Button
              type="button"
              size="xs"
              onClick={handleProcessBulkPaste}
              disabled={!pasteText.trim()}
              className="h-6 gap-1"
            >
              <Sparkles className="size-3" /> Processar e Inserir PFs
            </Button>
          </div>
        </div>
      )}

      {/* Selected Tags list */}
      {value.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-md bg-muted/20 border border-border/40">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider shrink-0 mr-1">
            PFs no Filtro ({value.length}):
          </span>
          {value.map((pf) => (
            <Badge
              key={pf}
              variant="secondary"
              className="font-mono text-[11px] py-0.5 px-2 gap-1 bg-background border hover:border-destructive/40 transition-colors group"
            >
              <span className="text-foreground">{pf}</span>
              <button
                type="button"
                onClick={() => handleRemoveTag(pf)}
                className="text-muted-foreground hover:text-destructive group-hover:opacity-100 transition-opacity ml-0.5"
                title={`Remover ${pf}`}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Suggested Quick Plant Areas */}
      {!compact && (
        <div className="flex flex-wrap items-center gap-1 pt-0.5 text-[10px]">
          <span className="text-muted-foreground mr-0.5 flex items-center gap-0.5">
            <Compass className="size-3" /> Sugestões de Área:
          </span>
          {COMMON_PLANT_AREAS.map((area) => {
            const alreadySelected = value.includes(area.code)
            return (
              <button
                key={area.code}
                type="button"
                onClick={() => handleAddTag(area.code)}
                disabled={alreadySelected}
                className={cn(
                  'px-1.5 py-0.5 rounded border text-[10px] font-mono transition-all',
                  alreadySelected
                    ? 'opacity-40 bg-muted border-border cursor-not-allowed'
                    : 'bg-background hover:bg-muted text-muted-foreground hover:text-foreground border-border hover:border-primary/40'
                )}
                title={`Adicionar ${area.label}`}
              >
                + {area.code}
              </button>
            )
          })}
        </div>
      )}

      {/* Tree Selector Modal Dialog */}
      <FunctionalLocationTreeModal
        open={treeModalOpen}
        onOpenChange={setTreeModalOpen}
        value={value}
        onApply={(newSelection) => onChange(newSelection)}
        arvorePlantaFilter={arvorePlantaFilter}
      />
    </div>
  )
}
