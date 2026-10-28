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
  BookmarkPlus,
  Clock,
  Compass,
  Filter,
  Flame,
  Layers,
  Loader2,
  OctagonAlert,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface PresetEditorModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  presetToEdit?: Preset | null
  onSuccess: () => void
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

export function PresetEditorModal({
  open,
  onOpenChange,
  presetToEdit,
  onSuccess,
}: PresetEditorModalProps) {
  const isEditing = !!presetToEdit

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

  useEffect(() => {
    if (open) {
      if (presetToEdit) {
        setName(presetToEdit.name)
        setIcon(presetToEdit.icon || 'Filter')
        setColor(presetToEdit.color || '#3b82f6')
        setShowInQuickbar(presetToEdit.show_in_quickbar ?? true)
        setIsDefault(presetToEdit.is_default ?? false)

        const payload = presetToEdit.filter_payload || {}
        setPflist(payload.functional_locations_prefixes || [])
        setArvores(payload.arvores || [])
        setSpecialties(payload.specialties || [])
        setOnlyPane(!!payload.only_pane)
        setOnlyJump(!!payload.only_jump)
        setOnlyRelevant(!!payload.only_relevant)
        setOnlyAnalyze(!!payload.only_analyze)
      } else {
        // Reset defaults
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
  }, [open, presetToEdit])

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
      toast.error('Informe um nome para o filtro da área')
      return
    }

    setSaving(true)
    const payload: PresetInput = {
      name: name.trim(),
      icon,
      color,
      is_default: isDefault,
      show_in_quickbar: showInQuickbar,
      sort_order: presetToEdit?.sort_order ?? 10,
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
      if (isEditing && presetToEdit) {
        await presetsApi.update(presetToEdit.id, payload)
        toast.success(`Filtro "${name}" atualizado com sucesso!`)
      } else {
        await presetsApi.create(payload)
        toast.success(`Filtro da Área "${name}" cadastrado com sucesso!`)
      }
      onSuccess()
      onOpenChange(false)
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar filtro')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-5">
        <form onSubmit={handleSave} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <BookmarkPlus className="size-5 text-primary" />
              {isEditing ? 'Editar Filtro da Área (Preset)' : 'Novo Filtro Pré-Cadastrado da Área'}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Configure o foco operacional por Posição Funcional (simples, múltipla ou lista copiada) para acesso em 1 clique na rotina diária.
            </DialogDescription>
          </DialogHeader>

          {/* Nome, Ícone e Cor */}
          <div className="space-y-3 p-3 rounded-lg border bg-card text-xs">
            <div>
              <label className="font-semibold text-[11px] block text-foreground mb-1">
                Nome do Filtro Operacional *
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: ⚡ Meu Foco: Refino Secundário (SLM1) ou Fornos Panela"
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
                          'size-7 rounded-md border flex items-center justify-center transition-all',
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
                          'size-6 rounded-full border-2 transition-all cursor-pointer',
                          selected ? 'ring-2 ring-primary ring-offset-2 scale-110' : 'opacity-80 hover:opacity-100'
                        )}
                        style={{ backgroundColor: c.hex, borderColor: 'rgba(255,255,255,0.4)' }}
                        title={c.label}
                      />
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* CRITICAL SECTION: Posições Funcionais (PF) */}
          <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <label className="font-bold text-xs flex items-center gap-1.5 text-foreground">
                <Compass className="size-4 text-primary" />
                Foco por Posição Funcional (Simples, Múltipla ou Lista em Massa)
              </label>
              {pflist.length > 0 && (
                <Badge variant="outline" className="text-[10px] font-mono bg-background">
                  {pflist.length} {pflist.length === 1 ? 'posição funcional' : 'posições funcionais'}
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Você pode adicionar uma única Posição Funcional, múltiplas PFs ou colar uma coluna inteira de tags copiada do Excel.
            </p>

            <FunctionalLocationInput
              value={pflist}
              onChange={setPflist}
              placeholder="Digite a PF e aperte Enter (ex: BT-ST-SLM1, BT-ST-SLM1-PAN01)..."
            />
          </div>

          {/* Árvores e Especialidade */}
          <div className="p-3 rounded-lg border bg-card space-y-3 text-xs">
            {/* Árvores de Ativos */}
            <div>
              <label className="font-semibold text-[11px] block text-foreground mb-1.5">
                Árvores de Ativos da Planta:
              </label>
              <div className="flex flex-wrap gap-1">
                {ARVORES.map((arv) => {
                  const active = arvores.includes(arv)
                  return (
                    <button
                      key={arv}
                      type="button"
                      onClick={() => toggleArvore(arv)}
                      className={cn(
                        'px-2 py-0.5 rounded text-[11px] font-mono border transition-all',
                        active
                          ? 'bg-primary text-primary-foreground border-primary font-bold shadow-2xs'
                          : 'bg-background hover:bg-muted text-muted-foreground border-border'
                      )}
                    >
                      {arv}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Especialidade */}
            <div>
              <label className="font-semibold text-[11px] block text-foreground mb-1.5">
                Especialidade da Manutenção:
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleSpecialty('ELETRICA')}
                  className={cn(
                    'px-2.5 py-1 rounded text-xs border font-medium transition-all',
                    specialties.includes('ELETRICA')
                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500 font-bold'
                      : 'bg-background text-muted-foreground border-border hover:bg-muted'
                  )}
                >
                  ⚡ Elétrica / Automação (ELETRICA)
                </button>

                <button
                  type="button"
                  onClick={() => toggleSpecialty('MECANICA')}
                  className={cn(
                    'px-2.5 py-1 rounded text-xs border font-medium transition-all',
                    specialties.includes('MECANICA')
                      ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500 font-bold'
                      : 'bg-background text-muted-foreground border-border hover:bg-muted'
                  )}
                >
                  ⚙️ Mecânica (MECANICA)
                </button>
              </div>
            </div>

            {/* Flags de Severidade Operacional */}
            <div className="pt-2 border-t grid grid-cols-2 sm:grid-cols-4 gap-2">
              <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                <input
                  type="checkbox"
                  checked={onlyPane}
                  onChange={(e) => setOnlyPane(e.target.checked)}
                  className="size-3.5 rounded text-destructive focus:ring-destructive"
                />
                <span className="text-foreground">Apenas Panes</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                <input
                  type="checkbox"
                  checked={onlyJump}
                  onChange={(e) => setOnlyJump(e.target.checked)}
                  className="size-3.5 rounded text-amber-500 focus:ring-amber-500"
                />
                <span className="text-foreground">Apenas Jumps</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                <input
                  type="checkbox"
                  checked={onlyRelevant}
                  onChange={(e) => setOnlyRelevant(e.target.checked)}
                  className="size-3.5 rounded text-emerald-500 focus:ring-emerald-500"
                />
                <span className="text-foreground">Apenas Relevantes</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                <input
                  type="checkbox"
                  checked={onlyAnalyze}
                  onChange={(e) => setOnlyAnalyze(e.target.checked)}
                  className="size-3.5 rounded text-purple-500 focus:ring-purple-500"
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
                className="size-3.5 rounded text-primary focus:ring-primary"
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
                className="size-3.5 rounded text-primary focus:ring-primary"
              />
              <span className="font-medium text-foreground">Definir como filtro padrão</span>
            </label>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
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
                  {isEditing ? 'Salvar Alterações' : 'Criar Filtro da Área'}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
