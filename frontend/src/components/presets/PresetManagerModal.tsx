import React, { useEffect, useState } from 'react'
import { presetsApi } from '@/api'
import type { Especialidade, Preset, PresetInput } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FunctionalLocationInput } from '@/components/filters/FunctionalLocationInput'
import {
  AlertTriangle,
  ArrowLeft,
  BookmarkPlus,
  Check,
  Clock,
  Compass,
  Filter,
  Flame,
  Layers,
  Loader2,
  OctagonAlert,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Star,
  Trash2,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export interface PresetManagerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * - Preset object: opens directly in edit mode for this preset
   * - null: opens directly in create mode for a new preset
   * - undefined: opens in list mode showing all presets
   */
  initialPreset?: Preset | null
  activePresetId?: string
  onSelectPreset?: (preset: Preset) => void
  onSuccess?: () => void
}

const AVAILABLE_ICONS = [
  { name: 'Zap', icon: Zap, label: 'Elétrica / Energia' },
  { name: 'Flame', icon: Flame, label: 'Fogo / Térmico' },
  { name: 'AlertTriangle', icon: AlertTriangle, label: 'Alerta / Jumps' },
  { name: 'OctagonAlert', icon: OctagonAlert, label: 'Panes / Paradas' },
  { name: 'Search', icon: Search, label: 'Busca / Análise' },
  { name: 'Star', icon: Star, label: 'Relevante / Destaque' },
  { name: 'Layers', icon: Layers, label: 'Área / Estrutura' },
  { name: 'Compass', icon: Compass, label: 'Setor / Rota' },
  { name: 'Clock', icon: Clock, label: 'Turno / Tempo' },
  { name: 'Filter', icon: Filter, label: 'Filtro Geral' },
]

const AVAILABLE_COLORS = [
  { hex: '#3b82f6', label: 'Azul' },
  { hex: '#f97316', label: 'Laranja' },
  { hex: '#eab308', label: 'Amarelo' },
  { hex: '#ef4444', label: 'Vermelho' },
  { hex: '#8b5cf6', label: 'Roxo' },
  { hex: '#10b981', label: 'Verde' },
  { hex: '#06b6d4', label: 'Ciano' },
  { hex: '#ec4899', label: 'Rosa' },
]

const ARVORES = ['BOF1', 'SLM1', 'CCS1', 'CCS2', 'CCS3', 'PCC1', 'COM0'] as const
const SPECIALTIES: { value: Especialidade; label: string }[] = [
  { value: 'ELETRICA', label: '⚡ Elétrica / Automação' },
  { value: 'MECANICA', label: '⚙️ Mecânica' },
  { value: 'OUTRA', label: '🔧 Outra' },
]

export function PresetManagerModal({
  open,
  onOpenChange,
  initialPreset,
  activePresetId,
  onSelectPreset,
  onSuccess,
}: PresetManagerModalProps) {
  // Mode: 'list' (all presets) or 'edit' (create/edit preset form)
  const [viewMode, setViewMode] = useState<'list' | 'edit'>('list')
  const [presets, setPresets] = useState<Preset[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [editingPreset, setEditingPreset] = useState<Preset | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Form states
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('Filter')
  const [color, setColor] = useState('#3b82f6')
  const [showInQuickbar, setShowInQuickbar] = useState(true)
  const [isDefault, setIsDefault] = useState(false)

  // Filter Payload states
  const [pflist, setPflist] = useState<string[]>([])
  const [arvores, setArvores] = useState<string[]>([])
  const [specialties, setSpecialties] = useState<Especialidade[]>([])
  const [onlyPane, setOnlyPane] = useState(false)
  const [onlyJump, setOnlyJump] = useState(false)
  const [onlyRelevant, setOnlyRelevant] = useState(false)
  const [onlyAnalyze, setOnlyAnalyze] = useState(false)

  const [saving, setSaving] = useState(false)

  const loadPresets = async () => {
    try {
      setLoading(true)
      const list = await presetsApi.list()
      setPresets(list)
    } catch {
      // Ignored
    } finally {
      setLoading(false)
    }
  }

  const setupForm = (targetPreset: Preset | null) => {
    if (targetPreset) {
      setName(targetPreset.name)
      setIcon(targetPreset.icon || 'Filter')
      setColor(targetPreset.color || '#3b82f6')
      setShowInQuickbar(targetPreset.show_in_quickbar ?? true)
      setIsDefault(targetPreset.is_default ?? false)

      const payload = targetPreset.filter_payload || {}
      setPflist(payload.functional_locations_prefixes || [])
      setArvores(payload.arvores || [])
      setSpecialties(payload.specialties || [])
      setOnlyPane(!!payload.only_pane)
      setOnlyJump(!!payload.only_jump)
      setOnlyRelevant(!!payload.only_relevant)
      setOnlyAnalyze(!!payload.only_analyze)
    } else {
      // Defaults for new preset
      setName('')
      setIcon('Zap')
      setColor('#3b82f6')
      setShowInQuickbar(true)
      setIsDefault(false)
      setPflist([])
      setArvores([])
      setSpecialties([])
      setOnlyPane(false)
      setOnlyJump(false)
      setOnlyRelevant(false)
      setOnlyAnalyze(false)
    }
  }

  useEffect(() => {
    if (open) {
      loadPresets()
      if (initialPreset !== undefined) {
        setEditingPreset(initialPreset)
        setupForm(initialPreset)
        setViewMode('edit')
      } else {
        setViewMode('list')
        setEditingPreset(null)
      }
    }
  }, [open, initialPreset])

  const startEdit = (preset: Preset) => {
    setEditingPreset(preset)
    setupForm(preset)
    setViewMode('edit')
  }

  const startCreate = () => {
    setEditingPreset(null)
    setupForm(null)
    setViewMode('edit')
  }

  const handleDelete = async (preset: Preset) => {
    const confirmed = window.confirm(
      `Deseja realmente excluir o foco rápido "${preset.name}"? Esta ação não pode ser desfeita.`
    )
    if (!confirmed) return

    try {
      setDeletingId(preset.id)
      await presetsApi.remove(preset.id)
      toast.success(`Foco rápido "${preset.name}" excluído`)
      window.dispatchEvent(new CustomEvent('atc:presets-changed'))
      await loadPresets()
      onSuccess?.()
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao excluir foco')
    } finally {
      setDeletingId(null)
    }
  }

  const toggleArvore = (arv: string) => {
    setArvores((prev) =>
      prev.includes(arv) ? prev.filter((a) => a !== arv) : [...prev, arv]
    )
  }

  const toggleSpecialty = (esp: Especialidade) => {
    setSpecialties((prev) =>
      prev.includes(esp) ? prev.filter((s) => s !== esp) : [...prev, esp]
    )
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('Informe um nome para o foco rápido')
      return
    }

    setSaving(true)
    const payload: PresetInput = {
      name: name.trim(),
      icon,
      color,
      is_default: isDefault,
      show_in_quickbar: showInQuickbar,
      sort_order: editingPreset?.sort_order ?? 10,
      filter_payload: {
        functional_locations_prefixes: pflist,
        arvores,
        specialties,
        only_pane: onlyPane,
        only_jump: onlyJump,
        only_relevant: onlyRelevant,
        only_analyze: onlyAnalyze,
      },
    }

    try {
      if (editingPreset) {
        await presetsApi.update(editingPreset.id, payload)
        toast.success(`Foco "${name}" atualizado com sucesso!`)
      } else {
        await presetsApi.create(payload)
        toast.success(`Foco "${name}" cadastrado com sucesso!`)
      }
      window.dispatchEvent(new CustomEvent('atc:presets-changed'))
      await loadPresets()
      onSuccess?.()
      setViewMode('list')
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar foco rápido')
    } finally {
      setSaving(false)
    }
  }

  const getPresetIconComp = (iconName?: string, className = 'size-3.5') => {
    const item = AVAILABLE_ICONS.find((i) => i.name === iconName)
    const IconComp = item ? item.icon : Filter
    return <IconComp className={className} />
  }

  const filteredPresets = presets.filter((p) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    const nameMatch = p.name.toLowerCase().includes(q)
    const pfMatch = p.filter_payload?.functional_locations_prefixes?.some((pf) =>
      pf.toLowerCase().includes(q)
    )
    const arvMatch = p.filter_payload?.arvores?.some((a) => a.toLowerCase().includes(q))
    return nameMatch || pfMatch || arvMatch
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-5">
        {viewMode === 'list' ? (
          /* ================= LIST MODE ================= */
          <div className="flex flex-col flex-1 overflow-hidden space-y-4">
            <DialogHeader className="shrink-0">
              <div className="flex items-center justify-between pr-6">
                <DialogTitle className="flex items-center gap-2 text-base font-bold">
                  <SlidersHorizontal className="size-5 text-primary" />
                  <span>Gerenciar Focos Rápidos (Presets)</span>
                </DialogTitle>
                <Button
                  size="xs"
                  onClick={startCreate}
                  className="gap-1 text-xs font-semibold"
                >
                  <Plus className="size-3.5" />
                  <span>Novo Foco</span>
                </Button>
              </div>
              <DialogDescription className="text-xs text-muted-foreground">
                Edite os focos existentes, gerencie atalhos na barra rápida ou crie novos filtros operacionais.
              </DialogDescription>
            </DialogHeader>

            {/* Search filter */}
            <div className="relative shrink-0">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar foco por nome, Posição Funcional ou árvore..."
                className="h-8 pl-8 text-xs bg-muted/20"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-2 text-muted-foreground hover:text-foreground text-xs cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Presets List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[260px] max-h-[50vh]">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                  <Loader2 className="size-5 animate-spin text-primary" />
                  <span className="text-xs">Carregando focos...</span>
                </div>
              ) : filteredPresets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg bg-muted/10 p-4">
                  <Filter className="size-8 text-muted-foreground/40 mb-2" />
                  <p className="text-xs font-medium text-foreground">
                    {search ? 'Nenhum foco encontrado para esta busca' : 'Nenhum foco rápido cadastrado'}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1 max-w-sm">
                    {search
                      ? 'Tente buscar por outro termo ou limpe o campo de busca.'
                      : 'Crie seu primeiro foco operacional para filtrar rapidamente ocorrências por Posição Funcional.'}
                  </p>
                  {!search && (
                    <Button size="xs" onClick={startCreate} className="mt-3 gap-1 font-semibold">
                      <Plus className="size-3" /> Criar Primeiro Foco
                    </Button>
                  )}
                </div>
              ) : (
                filteredPresets.map((preset) => {
                  const isActive = preset.id === activePresetId
                  const isDeleting = deletingId === preset.id
                  const payload = preset.filter_payload || {}
                  const pflist = payload.functional_locations_prefixes || []
                  const arvores = payload.arvores || []
                  const specialties = payload.specialties || []

                  return (
                    <div
                      key={preset.id}
                      className={cn(
                        'p-2.5 rounded-lg border bg-card flex items-center justify-between gap-3 text-xs transition-colors hover:border-primary/40',
                        isActive && 'border-primary/50 bg-primary/5'
                      )}
                    >
                      {/* Left: Icon, color, details */}
                      <div className="flex items-start gap-2.5 overflow-hidden flex-1 min-w-0">
                        <div
                          className="size-7 rounded-md flex items-center justify-center shrink-0 border mt-0.5"
                          style={{
                            borderColor: preset.color || '#3b82f6',
                            color: preset.color || '#3b82f6',
                            backgroundColor: `${preset.color || '#3b82f6'}15`,
                          }}
                          title={`Cor: ${preset.color || '#3b82f6'}`}
                        >
                          {getPresetIconComp(preset.icon, 'size-3.5')}
                        </div>

                        <div className="overflow-hidden flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-foreground truncate">
                              {preset.name}
                            </span>
                            {isActive && (
                              <Badge className="text-[9px] px-1 py-0 bg-primary text-primary-foreground font-bold">
                                Ativo Agora
                              </Badge>
                            )}
                            {preset.show_in_quickbar && (
                              <Badge variant="secondary" className="text-[9px] px-1.5 py-0 font-normal">
                                Na Barra Rápida
                              </Badge>
                            )}
                            {preset.is_default && (
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-primary/40 text-primary font-bold">
                                Padrão
                              </Badge>
                            )}
                          </div>

                          {/* Filter badges summary */}
                          <div className="flex flex-wrap items-center gap-1 mt-1 text-[10px]">
                            {pflist.length > 0 && (
                              <span className="font-mono text-primary font-bold bg-primary/10 border border-primary/20 px-1.5 py-0.2 rounded truncate max-w-[340px]">
                                PF ({pflist.length}): {pflist.join(', ')}
                              </span>
                            )}
                            {arvores.length > 0 && (
                              <span className="font-mono text-muted-foreground bg-muted/60 px-1.5 py-0.2 rounded">
                                Árvores: {arvores.join(', ')}
                              </span>
                            )}
                            {specialties.length > 0 && (
                              <span className="font-mono text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded">
                                {specialties.join(', ')}
                              </span>
                            )}
                            {payload.only_pane && (
                              <span className="px-1 py-0.2 rounded bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 font-bold">
                                Panes
                              </span>
                            )}
                            {payload.only_jump && (
                              <span className="px-1 py-0.2 rounded bg-amber-500/15 text-amber-600 border border-amber-500/30">
                                Jumps
                              </span>
                            )}
                            {payload.only_relevant && (
                              <span className="px-1 py-0.2 rounded bg-emerald-500/15 text-emerald-600 border border-emerald-500/30">
                                Relevantes
                              </span>
                            )}
                            {payload.only_analyze && (
                              <span className="px-1 py-0.2 rounded bg-purple-500/15 text-purple-600 border border-purple-500/30">
                                Analisar
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        {onSelectPreset && !isActive && (
                          <Button
                            size="xs"
                            variant="ghost"
                            className="h-7 px-2 text-[11px] text-muted-foreground hover:text-primary"
                            onClick={() => {
                              onSelectPreset(preset)
                              onOpenChange(false)
                            }}
                            title="Ativar este foco agora"
                          >
                            <Check className="size-3 mr-1" /> Ativar
                          </Button>
                        )}

                        <Button
                          size="xs"
                          variant="outline"
                          className="h-7 px-2.5 text-xs font-semibold gap-1 border-primary/30 text-primary hover:bg-primary/10"
                          onClick={() => startEdit(preset)}
                          title={`Editar foco "${preset.name}"`}
                        >
                          <Pencil className="size-3" />
                          <span>Editar</span>
                        </Button>

                        <Button
                          size="xs"
                          variant="ghost"
                          className="h-7 px-2 text-destructive hover:bg-destructive/10"
                          disabled={isDeleting}
                          onClick={() => handleDelete(preset)}
                          title="Excluir foco"
                        >
                          {isDeleting ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Trash2 className="size-3" />
                          )}
                        </Button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <DialogFooter className="border-t pt-3 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-muted-foreground font-mono">
                {presets.length} foco(s) cadastrado(s)
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Fechar
              </Button>
            </DialogFooter>
          </div>
        ) : (
          /* ================= EDIT / CREATE MODE ================= */
          <form onSubmit={handleSave} className="flex flex-col flex-1 overflow-hidden space-y-4">
            <DialogHeader className="shrink-0">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setViewMode('list')}
                  className="h-7 px-2 gap-1 text-xs text-muted-foreground hover:text-foreground -ml-1 cursor-pointer"
                  title="Voltar para a lista de focos"
                >
                  <ArrowLeft className="size-3.5" />
                  <span>Voltar</span>
                </Button>
                <div className="h-4 w-px bg-border/60" />
                <DialogTitle className="flex items-center gap-1.5 text-base font-bold">
                  <BookmarkPlus className="size-5 text-primary" />
                  <span>{editingPreset ? `Editar Foco: ${name || editingPreset.name}` : 'Novo Foco Rápido'}</span>
                </DialogTitle>
              </div>
              <DialogDescription className="text-xs text-muted-foreground pl-1">
                Configure o foco operacional por Posição Funcional, árvore e flags para acesso em 1 clique na rotina diária.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 text-xs">
              {/* Nome, Ícone e Cor */}
              <div className="space-y-3 p-3 rounded-lg border bg-card text-xs">
                <div>
                  <label className="font-semibold text-[11px] block text-foreground mb-1">
                    Nome do Foco Operacional *
                  </label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: ⚡ Foco: Refino Secundário (SLM1) ou Fornos Panela"
                    className="h-8 text-xs font-medium bg-background"
                    required
                  />
                </div>

                {/* Ícone e Cor */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="font-semibold text-[11px] block text-foreground mb-1.5">
                      Ícone Representativo
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {AVAILABLE_ICONS.map((item) => {
                        const IconComp = item.icon
                        const selected = icon === item.name
                        return (
                          <button
                            key={item.name}
                            type="button"
                            onClick={() => setIcon(item.name)}
                            className={cn(
                              'size-7 rounded-md border flex items-center justify-center transition-all cursor-pointer',
                              selected
                                ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                                : 'border-border bg-background hover:bg-muted text-muted-foreground'
                            )}
                            title={item.label}
                          >
                            <IconComp className="size-3.5" />
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-[11px] block text-foreground mb-1.5">
                      Cor de Destaque
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      {AVAILABLE_COLORS.map((c) => {
                        const selected = color === c.hex
                        return (
                          <button
                            key={c.hex}
                            type="button"
                            onClick={() => setColor(c.hex)}
                            className={cn(
                              'size-6 rounded-full border-2 transition-all cursor-pointer flex items-center justify-center',
                              selected
                                ? 'scale-110 border-foreground shadow-xs'
                                : 'border-transparent hover:scale-105'
                            )}
                            style={{ backgroundColor: c.hex }}
                            title={c.label}
                          >
                            {selected && <Check className="size-3 text-white drop-shadow-sm" />}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Posições Funcionais */}
              <div className="p-3 rounded-lg border bg-card space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-[11px] block text-foreground">
                    Posições Funcionais do Foco (Tags / Copiar & Colar)
                  </label>
                  <span className="text-[10px] text-muted-foreground">
                    Ocorrências que iniciem com estes prefixos serão filtradas
                  </span>
                </div>
                <FunctionalLocationInput
                  value={pflist}
                  onChange={setPflist}
                  placeholder="Ex: BT-ST-SLM1, BT-ST-BOF1... (Enter para adicionar)"
                />
              </div>

              {/* Árvores e Especialidades */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Árvores */}
                <div className="p-3 rounded-lg border bg-card space-y-2">
                  <label className="font-semibold text-[11px] block text-foreground">
                    Árvores Técnicas Relacionadas
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {ARVORES.map((arv) => {
                      const selected = arvores.includes(arv)
                      return (
                        <button
                          key={arv}
                          type="button"
                          onClick={() => toggleArvore(arv)}
                          className={cn(
                            'px-2 py-0.5 rounded text-[11px] font-mono font-medium border transition-colors cursor-pointer',
                            selected
                              ? 'bg-primary text-primary-foreground border-primary font-bold'
                              : 'bg-background hover:bg-muted text-muted-foreground border-border'
                          )}
                        >
                          {arv}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Especialidades */}
                <div className="p-3 rounded-lg border bg-card space-y-2">
                  <label className="font-semibold text-[11px] block text-foreground">
                    Especialidades Técnicas
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {SPECIALTIES.map((item) => {
                      const selected = specialties.includes(item.value)
                      return (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => toggleSpecialty(item.value)}
                          className={cn(
                            'px-2 py-0.5 rounded text-[11px] font-medium border transition-colors cursor-pointer',
                            selected
                              ? 'bg-amber-500 text-white border-amber-600 font-bold'
                              : 'bg-background hover:bg-muted text-muted-foreground border-border'
                          )}
                        >
                          {item.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Filtros Críticos e Flags */}
              <div className="p-3 rounded-lg border bg-card space-y-2">
                <label className="font-semibold text-[11px] block text-foreground">
                  Filtros de Gravidade e Destaques
                </label>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                    <input
                      type="checkbox"
                      checked={onlyPane}
                      onChange={(e) => setOnlyPane(e.target.checked)}
                      className="size-3.5 rounded text-red-500 focus:ring-red-500 cursor-pointer"
                    />
                    <span className="text-foreground">Apenas Ocorrências com Pane</span>
                  </label>

                  <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                    <input
                      type="checkbox"
                      checked={onlyJump}
                      onChange={(e) => setOnlyJump(e.target.checked)}
                      className="size-3.5 rounded text-amber-500 focus:ring-amber-500 cursor-pointer"
                    />
                    <span className="text-foreground">Apenas Jumps</span>
                  </label>

                  <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                    <input
                      type="checkbox"
                      checked={onlyRelevant}
                      onChange={(e) => setOnlyRelevant(e.target.checked)}
                      className="size-3.5 rounded text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                    />
                    <span className="text-foreground">Apenas Relevantes</span>
                  </label>

                  <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                    <input
                      type="checkbox"
                      checked={onlyAnalyze}
                      onChange={(e) => setOnlyAnalyze(e.target.checked)}
                      className="size-3.5 rounded text-purple-500 focus:ring-purple-500 cursor-pointer"
                    />
                    <span className="text-foreground">Apenas Analisar</span>
                  </label>
                </div>
              </div>

              {/* Opções de Exibição */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border bg-muted/20 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showInQuickbar}
                    onChange={(e) => setShowInQuickbar(e.target.checked)}
                    className="size-3.5 rounded text-primary focus:ring-primary cursor-pointer"
                  />
                  <span className="font-medium text-foreground">
                    Exibir botão na barra de Foco Rápido da Rotina Matinal
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isDefault}
                    onChange={(e) => setIsDefault(e.target.checked)}
                    className="size-3.5 rounded text-primary focus:ring-primary cursor-pointer"
                  />
                  <span className="font-medium text-foreground">Definir como filtro padrão</span>
                </label>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setViewMode('list')}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={saving || !name.trim()} className="gap-1.5">
                {saving ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <BookmarkPlus className="size-3.5" />
                    {editingPreset ? 'Salvar Alterações' : 'Criar Foco Rápido'}
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
