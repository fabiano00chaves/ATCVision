import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { documentsApi } from '@/api'
import type { DocumentStats, PdfDocument } from '@/api/types'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { UploadModal } from '@/components/layout/UploadModal'
import { DocumentCleanupModal } from '@/components/documents/DocumentCleanupModal'
import {
  AlertTriangle,
  ArrowUpDown,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  ExternalLink,
  Eye,
  FileCheck,
  FileText,
  FileUp,
  FolderArchive,
  HardDrive,
  Info,
  Layers,
  LayoutGrid,
  List,
  Loader2,
  MoreVertical,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export function Documents() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [documents, setDocuments] = useState<PdfDocument[]>([])
  const [stats, setStats] = useState<DocumentStats | null>(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  // Modals
  const [uploadOpen, setUploadOpen] = useState(false)
  const [cleanupOpen, setCleanupOpen] = useState(false)

  // Filters & Management State
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'grouped' | 'table'>('grouped')
  const [binaryFilter, setBinaryFilter] = useState<'all' | 'with_binary' | 'purged'>('all')
  const [periodFilter, setPeriodFilter] = useState<'all' | '7d' | '30d' | 'this_month'>('all')
  const [sortKey, setSortKey] = useState<'recent' | 'oldest' | 'name' | 'size' | 'occurrences'>('recent')

  // Group collapse state
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})

  // Multi-selection state
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([])

  const loadData = async () => {
    setLoading(true)
    try {
      const [res, st] = await Promise.all([
        documentsApi.list(300, 0),
        documentsApi.stats().catch(() => null),
      ])
      setDocuments(res.items)
      setTotal(res.total)
      if (st) setStats(st)
    } catch {
      toast.error('Erro ao listar relatórios do sistema')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes <= 0) return '0 B'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  // Filter & Sort Logic
  const filteredDocuments = useMemo(() => {
    const now = new Date()
    return documents.filter((doc) => {
      // 1. Search filter
      if (search.trim()) {
        const q = search.toLowerCase()
        const matchesName = doc.filename.toLowerCase().includes(q)
        if (!matchesName) return false
      }

      // 2. Binary filter
      if (binaryFilter === 'with_binary' && !doc.has_binary) return false
      if (binaryFilter === 'purged' && doc.has_binary) return false

      // 3. Period filter
      if (periodFilter !== 'all') {
        const docDate = doc.report_period_start ? new Date(doc.report_period_start) : new Date(doc.created_at)
        const diffDays = (now.getTime() - docDate.getTime()) / (1000 * 3600 * 24)

        if (periodFilter === '7d' && diffDays > 7) return false
        if (periodFilter === '30d' && diffDays > 30) return false
        if (periodFilter === 'this_month') {
          if (docDate.getMonth() !== now.getMonth() || docDate.getFullYear() !== now.getFullYear()) {
            return false
          }
        }
      }

      return true
    }).sort((a, b) => {
      if (sortKey === 'name') return a.filename.localeCompare(b.filename)
      if (sortKey === 'size') return (b.file_size_bytes || 0) - (a.file_size_bytes || 0)
      if (sortKey === 'occurrences') return (b.occurrence_count || 0) - (a.occurrence_count || 0)
      if (sortKey === 'oldest') {
        const da = a.report_period_start || a.created_at
        const db = b.report_period_start || b.created_at
        return da.localeCompare(db)
      }
      // 'recent' default
      const da = a.report_period_start || a.created_at
      const db = b.report_period_start || b.created_at
      return db.localeCompare(da)
    })
  }, [documents, search, binaryFilter, periodFilter, sortKey])

  // Group by Month / Year for Grouped View
  const groupedDocuments = useMemo(() => {
    const groups: {
      key: string
      label: string
      items: PdfDocument[]
      totalSize: number
      totalOccurrences: number
    }[] = []

    const groupMap: Record<string, typeof groups[0]> = {}

    for (const doc of filteredDocuments) {
      const dt = doc.report_period_start ? new Date(doc.report_period_start) : new Date(doc.created_at)
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`

      if (!groupMap[key]) {
        const monthName = dt.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })
        const capitalized = monthName.charAt(0).toUpperCase() + monthName.slice(1)
        groupMap[key] = {
          key,
          label: capitalized,
          items: [],
          totalSize: 0,
          totalOccurrences: 0,
        }
        groups.push(groupMap[key])
      }

      groupMap[key].items.push(doc)
      groupMap[key].totalSize += doc.file_size_bytes || 0
      groupMap[key].totalOccurrences += doc.occurrence_count || 0
    }

    return groups
  }, [filteredDocuments])

  // Selection handlers
  const toggleDocSelection = (id: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const toggleAllVisible = () => {
    const visibleIds = filteredDocuments.map((d) => d.id)
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedDocIds.includes(id))
    if (allSelected) {
      setSelectedDocIds((prev) => prev.filter((id) => !visibleIds.includes(id)))
    } else {
      setSelectedDocIds((prev) => Array.from(new Set([...prev, ...visibleIds])))
    }
  }

  const toggleGroupSelection = (groupItems: PdfDocument[]) => {
    const groupIds = groupItems.map((d) => d.id)
    const allInGroupSelected = groupIds.every((id) => selectedDocIds.includes(id))
    if (allInGroupSelected) {
      setSelectedDocIds((prev) => prev.filter((id) => !groupIds.includes(id)))
    } else {
      setSelectedDocIds((prev) => Array.from(new Set([...prev, ...groupIds])))
    }
  }

  const toggleGroupCollapse = (groupKey: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }))
  }

  // Single Document Actions
  const handlePurgeSingle = async (doc: PdfDocument) => {
    if (!confirm(`Deseja liberar o arquivo físico "${doc.filename}" do disco?\n\nTodas as ocorrências e notas continuarão preservadas no sistema.`)) return
    try {
      const res = await documentsApi.remove(doc.id, true, false)
      toast.success(res.message)
      loadData()
    } catch {
      toast.error('Erro ao liberar espaço do documento')
    }
  }

  const handleDeleteSingle = async (doc: PdfDocument) => {
    if (!confirm(`ATENÇÃO: Deseja EXCLUIR DEFINITIVAMENTE o documento "${doc.filename}" e TODAS as suas ocorrências exclusivas?`)) return
    try {
      const res = await documentsApi.remove(doc.id, false, true)
      toast.success(res.message)
      loadData()
    } catch {
      toast.error('Erro ao excluir documento')
    }
  }

  // Calculate selected total bytes
  const selectedTotalBytes = useMemo(() => {
    return documents
      .filter((d) => selectedDocIds.includes(d.id))
      .reduce((acc, d) => acc + (d.file_size_bytes || 0), 0)
  }, [documents, selectedDocIds])

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-background">
      {/* Top Header & Storage KPI Metric Cards */}
      <div className="bg-card border-b p-3 space-y-3 shrink-0 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-sm font-bold flex items-center gap-2 text-foreground">
              <FileText className="size-4 text-primary" />
              Gestão de Relatórios & Banco de Arquivos ({total})
            </h1>
            <p className="text-[11px] text-muted-foreground">
              Organização cronológica, auditoria de coordenadas e saneamento de armazenamento físico
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="xs"
              variant="outline"
              onClick={() => setCleanupOpen(true)}
              className="gap-1 border-primary/30 hover:bg-primary/10 text-primary font-medium"
            >
              <HardDrive className="size-3.5" />
              Sanear Armazenamento
            </Button>

            <Button size="xs" onClick={() => setUploadOpen(true)} className="gap-1">
              <FileUp className="size-3.5" /> Inserir PDF SAP
            </Button>
          </div>
        </div>

        {/* Storage & Audit Metric Bar */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-border/40">
            <div className="bg-muted/30 p-2 rounded-md flex items-center gap-2.5">
              <div className="size-7 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <FileText className="size-3.5" />
              </div>
              <div className="overflow-hidden">
                <span className="text-[10px] text-muted-foreground block truncate">Relatórios Ingeridos</span>
                <span className="text-xs font-bold font-mono text-foreground">{stats.total_documents} arquivos</span>
              </div>
            </div>

            <div className="bg-muted/30 p-2 rounded-md flex items-center gap-2.5">
              <div className="size-7 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <HardDrive className="size-3.5" />
              </div>
              <div className="overflow-hidden">
                <span className="text-[10px] text-muted-foreground block truncate">Espaço em Disco</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold font-mono text-foreground">
                    {formatBytes(stats.total_storage_bytes)}
                  </span>
                  {stats.total_purged_documents > 0 && (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                      {stats.total_purged_documents} otimizados
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-muted/30 p-2 rounded-md flex items-center gap-2.5">
              <div className="size-7 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <Database className="size-3.5" />
              </div>
              <div className="overflow-hidden">
                <span className="text-[10px] text-muted-foreground block truncate">Ocorrências Mapeadas</span>
                <span className="text-xs font-bold font-mono text-foreground">
                  {stats.total_occurrences} registros
                </span>
              </div>
            </div>

            <div className="bg-muted/30 p-2 rounded-md flex items-center gap-2.5">
              <div className="size-7 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <Calendar className="size-3.5" />
              </div>
              <div className="overflow-hidden">
                <span className="text-[10px] text-muted-foreground block truncate">Cobertura do Acervo</span>
                <span className="text-[11px] font-medium font-mono text-foreground truncate block">
                  {stats.oldest_report_date
                    ? `${new Date(stats.oldest_report_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })} → ${stats.newest_report_date ? new Date(stats.newest_report_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : 'Hoje'}`
                    : 'Em sincronização'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Filter and View Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/40 text-xs">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrar por nome do arquivo (ex: 19_10, IPAG)..."
              className="pl-8 h-7 text-xs bg-background"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1.5 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {/* View Switcher */}
            <div className="flex items-center gap-0.5 bg-muted/60 p-0.5 rounded-md">
              <Button
                size="xs"
                variant={viewMode === 'grouped' ? 'default' : 'ghost'}
                onClick={() => setViewMode('grouped')}
                className="h-6 gap-1"
                title="Agrupar por Mês / Ano"
              >
                <Layers className="size-3" />
                <span className="hidden sm:inline">Por Mês</span>
              </Button>
              <Button
                size="xs"
                variant={viewMode === 'table' ? 'default' : 'ghost'}
                onClick={() => setViewMode('table')}
                className="h-6 gap-1"
                title="Tabela Plana Contínua"
              >
                <List className="size-3" />
                <span className="hidden sm:inline">Tabela Plana</span>
              </Button>
            </div>

            {/* Binary / Storage Status Filter */}
            <div className="flex items-center gap-0.5 bg-muted/60 p-0.5 rounded-md">
              <Button
                size="xs"
                variant={binaryFilter === 'all' ? 'default' : 'ghost'}
                onClick={() => setBinaryFilter('all')}
                className="h-6"
              >
                Todos
              </Button>
              <Button
                size="xs"
                variant={binaryFilter === 'with_binary' ? 'default' : 'ghost'}
                onClick={() => setBinaryFilter('with_binary')}
                className="h-6"
                title="Apenas relatórios com arquivo PDF preservado no disco"
              >
                Com PDF
              </Button>
              <Button
                size="xs"
                variant={binaryFilter === 'purged' ? 'default' : 'ghost'}
                onClick={() => setBinaryFilter('purged')}
                className="h-6"
                title="Apenas relatórios com espaço otimizado (binário liberado)"
              >
                Otimizados
              </Button>
            </div>

            {/* Period Quick Filter */}
            <div className="flex items-center gap-0.5 bg-muted/60 p-0.5 rounded-md">
              <Button
                size="xs"
                variant={periodFilter === 'all' ? 'default' : 'ghost'}
                onClick={() => setPeriodFilter('all')}
                className="h-6"
              >
                Todo Período
              </Button>
              <Button
                size="xs"
                variant={periodFilter === '7d' ? 'default' : 'ghost'}
                onClick={() => setPeriodFilter('7d')}
                className="h-6"
              >
                7d
              </Button>
              <Button
                size="xs"
                variant={periodFilter === '30d' ? 'default' : 'ghost'}
                onClick={() => setPeriodFilter('30d')}
                className="h-6"
              >
                30d
              </Button>
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="xs" variant="outline" className="h-6 gap-1">
                    <ArrowUpDown className="size-3 text-muted-foreground" />
                    <span>Ordenar</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="text-xs">
                  <DropdownMenuItem onClick={() => setSortKey('recent')}>
                    Mais Recentes Primeiro {sortKey === 'recent' && '✓'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortKey('oldest')}>
                    Mais Antigos Primeiro {sortKey === 'oldest' && '✓'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortKey('name')}>
                    Nome do Arquivo (A-Z) {sortKey === 'name' && '✓'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortKey('size')}>
                    Maior Tamanho em Disco {sortKey === 'size' && '✓'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortKey('occurrences')}>
                    Mais Ocorrências {sortKey === 'occurrences' && '✓'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 max-w-7xl mx-auto w-full space-y-4">
        {loading ? (
          <div className="flex items-center justify-center p-16 text-muted-foreground">
            <Loader2 className="size-6 animate-spin mr-2" />
            <span>Carregando acervo de relatórios...</span>
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="p-16 text-center text-muted-foreground border rounded-lg bg-card">
            <FileText className="size-10 mb-2 mx-auto opacity-30" />
            <p className="font-semibold text-sm">Nenhum relatório encontrado</p>
            <p className="text-xs mt-1">Ajuste os filtros de pesquisa ou insira novos PDFs SAP.</p>
          </div>
        ) : viewMode === 'grouped' ? (
          /* Grouped by Month View */
          <div className="space-y-4">
            {groupedDocuments.map((group) => {
              const isCollapsed = collapsedGroups[group.key] || false
              const allInGroupSelected = group.items.length > 0 && group.items.every((d) => selectedDocIds.includes(d.id))
              const someInGroupSelected = group.items.some((d) => selectedDocIds.includes(d.id))

              return (
                <div key={group.key} className="border rounded-lg bg-card overflow-hidden shadow-2xs">
                  {/* Group Header */}
                  <div className="p-2.5 bg-muted/40 border-b flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={allInGroupSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someInGroupSelected && !allInGroupSelected
                        }}
                        onChange={() => toggleGroupSelection(group.items)}
                        className="rounded border-border size-3.5 cursor-pointer text-primary focus:ring-primary"
                        title="Selecionar todos os relatórios deste mês"
                      />

                      <button
                        onClick={() => toggleGroupCollapse(group.key)}
                        className="flex items-center gap-1.5 font-bold text-foreground hover:text-primary transition-colors text-left"
                      >
                        {isCollapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
                        <FolderArchive className="size-4 text-primary" />
                        <span>{group.label}</span>
                      </button>

                      <Badge variant="outline" className="text-[10px] font-mono">
                        {group.items.length} {group.items.length === 1 ? 'relatório' : 'relatórios'}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-mono">
                      <span>Espaço: <strong className="text-foreground">{formatBytes(group.totalSize)}</strong></span>
                      <span className="hidden sm:inline">•</span>
                      <span className="hidden sm:inline">Ocorrências: <strong className="text-primary">{group.totalOccurrences}</strong></span>
                    </div>
                  </div>

                  {/* Group Items Table */}
                  {!isCollapsed && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-muted/20 border-b text-muted-foreground text-[10px] uppercase tracking-wider">
                          <tr>
                            <th className="p-2.5 w-8 text-center"></th>
                            <th className="p-2.5">Nome do Arquivo & Status</th>
                            <th className="p-2.5">Período de Turno</th>
                            <th className="p-2.5">Emissão</th>
                            <th className="p-2.5 text-center">Páginas</th>
                            <th className="p-2.5 text-center">Ocorrências</th>
                            <th className="p-2.5">Tamanho em Disco</th>
                            <th className="p-2.5 text-right">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/30">
                          {group.items.map((doc) => (
                            <DocumentRow
                              key={doc.id}
                              doc={doc}
                              isSelected={selectedDocIds.includes(doc.id)}
                              onToggleSelect={() => toggleDocSelection(doc.id)}
                              onPurgeSingle={() => handlePurgeSingle(doc)}
                              onDeleteSingle={() => handleDeleteSingle(doc)}
                              formatBytes={formatBytes}
                              navigate={navigate}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          /* Table View */
          <div className="border rounded-lg bg-card overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 border-b text-muted-foreground text-[11px]">
                  <tr>
                    <th className="p-3 w-8 text-center">
                      <input
                        type="checkbox"
                        checked={filteredDocuments.length > 0 && filteredDocuments.every((d) => selectedDocIds.includes(d.id))}
                        onChange={toggleAllVisible}
                        className="rounded border-border size-3.5 cursor-pointer text-primary focus:ring-primary"
                        title="Selecionar todos os visíveis"
                      />
                    </th>
                    <th className="p-3">Nome do Arquivo</th>
                    <th className="p-3">Período de Turno</th>
                    <th className="p-3">Emissão</th>
                    <th className="p-3 text-center">Páginas</th>
                    <th className="p-3 text-center">Ocorrências</th>
                    <th className="p-3">Tamanho em Disco</th>
                    <th className="p-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {filteredDocuments.map((doc) => (
                    <DocumentRow
                      key={doc.id}
                      doc={doc}
                      isSelected={selectedDocIds.includes(doc.id)}
                      onToggleSelect={() => toggleDocSelection(doc.id)}
                      onPurgeSingle={() => handlePurgeSingle(doc)}
                      onDeleteSingle={() => handleDeleteSingle(doc)}
                      formatBytes={formatBytes}
                      navigate={navigate}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Floating Batch Action Bar when documents are selected */}
      {selectedDocIds.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-popover/95 border border-primary/30 backdrop-blur-md px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-3 text-xs animate-in slide-in-from-bottom-3 duration-200">
          <div className="flex items-center gap-2 pr-2 border-r">
            <div className="size-5 rounded-full bg-primary text-primary-foreground font-bold flex items-center justify-center text-[11px]">
              {selectedDocIds.length}
            </div>
            <span className="font-semibold text-foreground">
              {selectedDocIds.length} {selectedDocIds.length === 1 ? 'relatório selecionado' : 'relatórios selecionados'}
            </span>
            <Badge variant="outline" className="text-[10px] font-mono">
              ~{formatBytes(selectedTotalBytes)}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="xs"
              variant="outline"
              onClick={() => setCleanupOpen(true)}
              className="gap-1.5 border-emerald-500/40 hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium"
            >
              <Sparkles className="size-3 text-emerald-500" />
              Liberar Espaço Físico
            </Button>

            <Button
              size="xs"
              variant="destructive"
              onClick={() => setCleanupOpen(true)}
              className="gap-1.5"
            >
              <Trash2 className="size-3" />
              Excluir Relatórios e Ocorrências
            </Button>

            <Button
              size="xs"
              variant="ghost"
              onClick={() => setSelectedDocIds([])}
              className="text-muted-foreground hover:text-foreground h-7"
            >
              Desmarcar
            </Button>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      <UploadModal open={uploadOpen} onOpenChange={setUploadOpen} onSuccess={loadData} />

      {/* Smart Cleanup & Sanitization Modal */}
      <DocumentCleanupModal
        open={cleanupOpen}
        onOpenChange={setCleanupOpen}
        selectedDocIds={selectedDocIds}
        allDocuments={documents}
        onSuccess={() => {
          setSelectedDocIds([])
          loadData()
        }}
      />
    </div>
  )
}

interface DocumentRowProps {
  doc: PdfDocument
  isSelected: boolean
  onToggleSelect: () => void
  onPurgeSingle: () => void
  onDeleteSingle: () => void
  formatBytes: (b?: number) => string
  navigate: (path: string) => void
}

function DocumentRow({
  doc,
  isSelected,
  onToggleSelect,
  onPurgeSingle,
  onDeleteSingle,
  formatBytes,
  navigate,
}: DocumentRowProps) {
  return (
    <tr
      className={cn(
        'transition-colors hover:bg-muted/20',
        isSelected && 'bg-primary/5'
      )}
    >
      <td className="p-2.5 text-center">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          className="rounded border-border size-3.5 cursor-pointer text-primary focus:ring-primary"
        />
      </td>

      {/* Filename & Binary Status */}
      <td className="p-2.5 font-medium text-foreground">
        <div className="flex items-center gap-2">
          {doc.has_binary ? (
            <FileText className="size-4 text-primary shrink-0" />
          ) : (
            <span title="Binário liberado do disco — Dados preservados">
              <FileCheck className="size-4 text-emerald-500 shrink-0" />
            </span>
          )}

          <div className="flex flex-col overflow-hidden">
            <span className="truncate max-w-sm sm:max-w-md font-mono text-[11px] text-foreground">
              {doc.filename}
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              {doc.has_binary ? (
                <span className="text-[10px] text-muted-foreground font-mono">
                  {formatBytes(doc.file_size_bytes)}
                </span>
              ) : (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                  Espaço Otimizado (Dados Preservados)
                </span>
              )}
              {doc.ocr_applied && (
                <span className="text-[9px] bg-sky-500/10 text-sky-600 dark:text-sky-400 px-1 rounded font-mono">
                  OCR
                </span>
              )}
            </div>
          </div>
        </div>

        {doc.parse_warnings && doc.parse_warnings.length > 0 && (
          <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 pl-6">
            ⚠️ {doc.parse_warnings[0]}
          </p>
        )}
      </td>

      {/* Shift Period */}
      <td className="p-2.5 text-muted-foreground text-[11px]">
        {doc.report_period_start ? (
          <span>
            {new Date(doc.report_period_start).toLocaleString('pt-BR', {
              dateStyle: 'short',
              timeStyle: 'short',
            })}
            {' → '}
            {doc.report_period_end
              ? new Date(doc.report_period_end).toLocaleString('pt-BR', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })
              : ''}
          </span>
        ) : (
          '-'
        )}
      </td>

      {/* Emission Date */}
      <td className="p-2.5 text-muted-foreground text-[11px]">
        {doc.emitted_at
          ? new Date(doc.emitted_at).toLocaleString('pt-BR', {
              dateStyle: 'short',
              timeStyle: 'short',
            })
          : '-'}
      </td>

      {/* Pages */}
      <td className="p-2.5 text-center font-mono text-muted-foreground text-[11px]">
        {doc.page_count}
      </td>

      {/* Occurrences count */}
      <td className="p-2.5 text-center font-bold font-mono text-primary text-xs">
        {doc.occurrence_count}
      </td>

      {/* Size / Status Badge */}
      <td className="p-2.5 text-[11px] font-mono">
        {doc.has_binary ? (
          <Badge variant="outline" className="text-[10px] font-mono font-normal">
            {formatBytes(doc.file_size_bytes)}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[9px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
            Liberado
          </Badge>
        )}
      </td>

      {/* Actions */}
      <td className="p-2.5 text-right">
        <div className="flex items-center justify-end gap-1">
          <Button
            size="xs"
            variant="outline"
            onClick={() => navigate(`/ocorrencias?document_ids=${doc.id}`)}
            className="h-6 text-[11px] gap-1"
            title="Abrir ocorrências deste PDF"
          >
            <Eye className="size-3" />
            <span className="hidden sm:inline">Ocorrências</span>
          </Button>

          {doc.has_binary ? (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => window.open(documentsApi.fileUrl(doc.id), '_blank')}
              className="h-6 px-1.5"
              title="Abrir PDF original em nova aba"
            >
              <ExternalLink className="size-3 text-muted-foreground" />
            </Button>
          ) : (
            <Button
              size="xs"
              variant="ghost"
              disabled
              className="h-6 px-1.5 opacity-40 cursor-not-allowed"
              title="Arquivo binário físico liberado no saneamento"
            >
              <ExternalLink className="size-3 text-muted-foreground" />
            </Button>
          )}

          {/* More Actions Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="xs" variant="ghost" className="h-6 px-1 text-muted-foreground hover:text-foreground">
                <MoreVertical className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="text-xs">
              {doc.has_binary && (
                <DropdownMenuItem onClick={onPurgeSingle} className="text-emerald-600 dark:text-emerald-400 gap-1.5 cursor-pointer">
                  <Sparkles className="size-3.5" />
                  Liberar Espaço Físico (Manter Dados)
                </DropdownMenuItem>
              )}
              {doc.has_binary && <DropdownMenuSeparator />}
              <DropdownMenuItem onClick={onDeleteSingle} className="text-destructive gap-1.5 cursor-pointer">
                <Trash2 className="size-3.5" />
                Excluir Documento e Ocorrências
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </td>
    </tr>
  )
}
