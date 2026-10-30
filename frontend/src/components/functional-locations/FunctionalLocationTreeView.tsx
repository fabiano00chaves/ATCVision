import React, { useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Edit2,
  FolderTree,
  Network,
  RefreshCw,
  Search,
  Check,
  CheckSquare,
  Square,
  Sparkles,
  Info,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { functionalLocationsApi } from '@/api'
import type { FunctionalLocationNode } from '@/api/types'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface FunctionalLocationTreeViewProps {
  selectedCodes?: string[]
  onToggleCode?: (code: string) => void
  onSelectMultiple?: (codes: string[]) => void
  selectionMode?: 'single' | 'multiple'
  arvorePlantaFilter?: string
  compact?: boolean
  showRebuildAction?: boolean
  className?: string
}

const LEVEL_LABELS: Record<number, { name: string; color: string }> = {
  1: { name: 'Planta', color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30' },
  2: { name: 'Setor', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30' },
  3: { name: 'Árvore', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' },
  4: { name: 'Sistema', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30' },
  5: { name: 'Subsistema', color: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30' },
  6: { name: 'Componente', color: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30' },
}

export function FunctionalLocationTreeView({
  selectedCodes = [],
  onToggleCode,
  onSelectMultiple,
  selectionMode = 'multiple',
  arvorePlantaFilter,
  compact = false,
  showRebuildAction = true,
  className,
}: FunctionalLocationTreeViewProps) {
  const [treeData, setTreeData] = useState<FunctionalLocationNode[]>([])
  const [loading, setLoading] = useState(false)
  const [rebuilding, setRebuilding] = useState(false)
  const [search, setSearch] = useState('')
  const [expandedCodes, setExpandedCodes] = useState<Set<string>>(new Set())
  const [editingCode, setEditingCode] = useState<string | null>(null)
  const [editLabelValue, setEditLabelValue] = useState('')

  // Load Tree
  const fetchTree = async () => {
    try {
      setLoading(true)
      const data = await functionalLocationsApi.getTree({
        arvore_planta: arvorePlantaFilter,
        search: search.trim() || undefined,
      })
      setTreeData(data)

      // Auto-expand top levels (Level 1 and 2) by default
      if (!search.trim()) {
        const initialExpanded = new Set<string>()
        const collectTop = (nodes: FunctionalLocationNode[]) => {
          for (const n of nodes) {
            if (n.level <= 2) {
              initialExpanded.add(n.full_code)
              if (n.children) collectTop(n.children)
            }
          }
        }
        collectTop(data)
        setExpandedCodes(initialExpanded)
      } else {
        // If searching, auto-expand all matched paths
        const allCodes = new Set<string>()
        const collectAll = (nodes: FunctionalLocationNode[]) => {
          for (const n of nodes) {
            allCodes.add(n.full_code)
            if (n.children) collectAll(n.children)
          }
        }
        collectAll(data)
        setExpandedCodes(allCodes)
      }
    } catch (err: any) {
      console.error('Failed to load functional location tree:', err)
      toast.error('Erro ao carregar árvore de posições funcionais')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTree()
  }, [arvorePlantaFilter])

  // Debounced search trigger
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchTree()
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  // Rebuild learning routine
  const handleRebuild = async () => {
    try {
      setRebuilding(true)
      const res = await functionalLocationsApi.rebuild()
      toast.success(res.message || 'Árvore sincronizada com sucesso!')
      await fetchTree()
    } catch (err: any) {
      toast.error('Erro ao sincronizar árvore de posições funcionais')
    } finally {
      setRebuilding(false)
    }
  }

  // Toggle node expansion
  const toggleExpand = (code: string) => {
    setExpandedCodes((prev) => {
      const next = new Set(prev)
      if (next.has(code)) {
        next.delete(code)
      } else {
        next.add(code)
      }
      return next
    })
  }

  // Expand / Collapse all
  const handleExpandAll = () => {
    const allCodes = new Set<string>()
    const collectAll = (nodes: FunctionalLocationNode[]) => {
      for (const n of nodes) {
        allCodes.add(n.full_code)
        if (n.children) collectAll(n.children)
      }
    }
    collectAll(treeData)
    setExpandedCodes(allCodes)
  }

  const handleCollapseAll = () => {
    setExpandedCodes(new Set())
  }

  // Save custom label
  const handleSaveCustomLabel = async (code: string) => {
    try {
      await functionalLocationsApi.updateNode(code, {
        custom_label: editLabelValue.trim() || null,
      })
      toast.success(`Rótulo atualizado para ${code}`)
      setEditingCode(null)
      await fetchTree()
    } catch (err: any) {
      toast.error('Erro ao atualizar rótulo da posição funcional')
    }
  }

  // Count total nodes in tree
  const totalNodesCount = useMemo(() => {
    let count = 0
    const countNodes = (nodes: FunctionalLocationNode[]) => {
      for (const n of nodes) {
        count++
        if (n.children) countNodes(n.children)
      }
    }
    countNodes(treeData)
    return count
  }, [treeData])

  // Render individual tree node row
  const renderTreeNode = (node: FunctionalLocationNode, depth = 0) => {
    const hasChildren = Boolean(node.children && node.children.length > 0)
    const isExpanded = expandedCodes.has(node.full_code)
    const isSelected = selectedCodes.includes(node.full_code)
    const lvlMeta = LEVEL_LABELS[node.level] || {
      name: `Nív. ${node.level}`,
      color: 'bg-muted text-muted-foreground border-border',
    }

    return (
      <div key={node.full_code} className="select-none text-xs">
        <div
          className={cn(
            'group flex items-center justify-between py-1 px-2 rounded-md transition-colors border border-transparent',
            isSelected
              ? 'bg-primary/10 border-primary/30 text-primary font-medium'
              : 'hover:bg-muted/60 text-foreground',
            depth > 0 && 'ml-4'
          )}
        >
          {/* Left section: expand arrow, select checkbox, code & labels */}
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggleExpand(node.full_code)}
                className="p-0.5 text-muted-foreground hover:text-foreground rounded transition-transform"
                title={isExpanded ? 'Recolher' : 'Expandir'}
              >
                {isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              </button>
            ) : (
              <span className="w-4.5" />
            )}

            {/* Selection checkbox/toggle */}
            {onToggleCode && (
              <button
                type="button"
                onClick={() => onToggleCode(node.full_code)}
                className={cn(
                  'p-0.5 rounded transition-colors',
                  isSelected ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                )}
                title={isSelected ? 'Desmarcar' : 'Selecionar'}
              >
                {isSelected ? <CheckSquare className="size-3.5" /> : <Square className="size-3.5" />}
              </button>
            )}

            {/* Level badge */}
            <Badge
              variant="outline"
              className={cn('text-[9px] px-1 py-0 h-4 border font-normal shrink-0', lvlMeta.color)}
            >
              {lvlMeta.name}
            </Badge>

            {/* Full Code / Segment */}
            <span
              onClick={() => onToggleCode && onToggleCode(node.full_code)}
              className="font-mono text-xs cursor-pointer hover:underline truncate"
              title={node.full_code}
            >
              {node.segment_code}
              <span className="text-muted-foreground text-[10px] ml-1 font-normal opacity-70">
                ({node.full_code})
              </span>
            </span>

            {/* Custom Label or Description */}
            {editingCode === node.full_code ? (
              <div className="flex items-center gap-1 ml-2">
                <Input
                  value={editLabelValue}
                  onChange={(e) => setEditLabelValue(e.target.value)}
                  placeholder="Nome amigável (ex: Forno Panela 1)"
                  className="h-6 text-xs w-48 bg-background"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveCustomLabel(node.full_code)
                    if (e.key === 'Escape') setEditingCode(null)
                  }}
                />
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => handleSaveCustomLabel(node.full_code)}
                  className="h-6 px-1.5 text-emerald-600"
                >
                  <Check className="size-3" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground truncate ml-1">
                {node.custom_label ? (
                  <span className="text-primary font-medium truncate max-w-[200px]" title={node.custom_label}>
                    • {node.custom_label}
                  </span>
                ) : node.description ? (
                  <span className="italic truncate max-w-[200px]" title={node.description}>
                    • {node.description}
                  </span>
                ) : null}

                <button
                  type="button"
                  onClick={() => {
                    setEditingCode(node.full_code)
                    setEditLabelValue(node.custom_label || '')
                  }}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity p-0.5"
                  title="Editar rótulo amigável deste nó"
                >
                  <Edit2 className="size-2.5" />
                </button>
              </div>
            )}
          </div>

          {/* Right section: occurrences badge */}
          <div className="flex items-center gap-2 shrink-0 ml-2">
            {node.total_occurrences > 0 && (
              <Badge
                variant="secondary"
                className={cn(
                  'text-[10px] px-1.5 py-0 h-4 font-mono font-medium',
                  node.total_occurrences >= 10
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                    : 'bg-muted text-muted-foreground'
                )}
                title={`${node.total_occurrences} ocorrências registradas neste nó e seus subcomponentes`}
              >
                {node.total_occurrences} {node.total_occurrences === 1 ? 'ocorr.' : 'ocorr.'}
              </Badge>
            )}
          </div>
        </div>

        {/* Child nodes */}
        {hasChildren && isExpanded && (
          <div className="border-l border-border/40 ml-2 pl-1 space-y-0.5 py-0.5">
            {node.children!.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col h-full space-y-2', className)}>
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar nó, sistema ou código SAP..."
            className="pl-8 h-7 text-xs bg-background"
          />
        </div>

        <div className="flex items-center gap-1 text-xs">
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={handleExpandAll}
            className="h-7 text-[11px]"
            title="Expandir todos os ramos"
          >
            Expandir Tudo
          </Button>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={handleCollapseAll}
            className="h-7 text-[11px]"
            title="Recolher todos os ramos"
          >
            Recolher
          </Button>

          {showRebuildAction && (
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={handleRebuild}
              disabled={rebuilding}
              className="h-7 gap-1 text-[11px]"
              title="Varre todo o histórico de relatórios SAP PM e atualiza a árvore de posições funcionais"
            >
              <RefreshCw className={cn('size-3', rebuilding && 'animate-spin text-primary')} />
              <span>Sincronizar</span>
            </Button>
          )}
        </div>
      </div>

      {/* Summary line */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
        <span className="flex items-center gap-1.5">
          <FolderTree className="size-3.5 text-primary" />
          {totalNodesCount} nós estruturados na árvore
          {arvorePlantaFilter && (
            <span className="text-primary font-medium ml-1">• Filtro: {arvorePlantaFilter}</span>
          )}
        </span>
        {selectedCodes.length > 0 && (
          <span className="text-primary font-semibold">
            {selectedCodes.length} {selectedCodes.length === 1 ? 'posição selecionada' : 'posições selecionadas'}
          </span>
        )}
      </div>

      {/* Tree Content Area */}
      <div className="flex-1 overflow-y-auto min-h-[250px] max-h-[480px] p-1 space-y-1 rounded-md border border-border/40 bg-background/50">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
            <RefreshCw className="size-5 animate-spin text-primary" />
            <span className="text-xs">Carregando árvore de posições funcionais...</span>
          </div>
        ) : treeData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2 text-center p-4">
            <Info className="size-6 text-muted-foreground/60" />
            <span className="text-xs font-medium">Nenhuma posição funcional encontrada</span>
            <span className="text-[11px] text-muted-foreground/80 max-w-sm">
              Faça a ingestão de relatórios SAP PM ou clique em "Sincronizar" para aprender a árvore a partir das ocorrências existentes.
            </span>
            {showRebuildAction && (
              <Button size="xs" variant="outline" onClick={handleRebuild} disabled={rebuilding} className="mt-1 gap-1">
                <Sparkles className="size-3 text-primary" /> Aprender do Banco
              </Button>
            )}
          </div>
        ) : (
          treeData.map((rootNode) => renderTreeNode(rootNode, 0))
        )}
      </div>
    </div>
  )
}
