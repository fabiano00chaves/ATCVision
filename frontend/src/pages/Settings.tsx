import React, { useEffect, useState } from 'react'
import { presetsApi, settingsApi, tokensApi, webhooksApi } from '@/api'
import type {
  ApiTokenCreated,
  ApiTokenItem,
  Preset,
  Settings as SystemSettingsType,
  Webhook,
} from '@/api/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  BookmarkPlus,
  Copy,
  FolderSync,
  KeyRound,
  Pencil,
  Plus,
  Save,
  Send,
  Settings as SettingsIcon,
  Shield,
  Trash2,
  Webhook as WebhookIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { PresetEditorModal } from '@/components/presets/PresetEditorModal'

export function Settings() {
  const [settingsData, setSettingsData] = useState<SystemSettingsType | null>(null)
  const [presets, setPresets] = useState<Preset[]>([])
  const [tokens, setTokens] = useState<ApiTokenItem[]>([])
  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [loading, setLoading] = useState(true)

  // Preset Creation/Editing modal
  const [presetModalOpen, setPresetModalOpen] = useState(false)
  const [presetToEdit, setPresetToEdit] = useState<Preset | null>(null)

  // API Token Generation modal
  const [tokenModalOpen, setTokenModalOpen] = useState(false)
  const [tokenName, setTokenName] = useState('')
  const [createdTokenResult, setCreatedTokenResult] = useState<ApiTokenCreated | null>(null)

  // Webhook Creation modal
  const [webhookModalOpen, setWebhookModalOpen] = useState(false)
  const [webhookName, setWebhookName] = useState('')
  const [webhookUrl, setWebhookUrl] = useState('')

  const loadAll = async () => {
    setLoading(true)
    try {
      const [s, p, t, w] = await Promise.all([
        settingsApi.get(),
        presetsApi.list(),
        tokensApi.list(),
        webhooksApi.list(),
      ])
      setSettingsData(s)
      setPresets(p)
      setTokens(t)
      setWebhooks(w)
    } catch {
      toast.error('Erro ao carregar configurações do sistema')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  const handleSaveSettings = async () => {
    if (!settingsData) return
    try {
      const updated = await settingsApi.put(settingsData)
      setSettingsData(updated)
      toast.success('Configurações do sistema salvas com sucesso!')
    } catch {
      toast.error('Erro ao atualizar configurações')
    }
  }

  const handleDeletePreset = async (id: string) => {
    try {
      await presetsApi.remove(id)
      setPresets((prev) => prev.filter((p) => p.id !== id))
      toast.success('Preset removido')
    } catch {
      toast.error('Erro ao remover preset')
    }
  }

  const handleCreateToken = async () => {
    if (!tokenName.trim()) return
    try {
      const res = await tokensApi.create(tokenName.trim())
      setCreatedTokenResult(res)
      setTokens((prev) => [res.item, ...prev])
      toast.success('Token de API gerado com sucesso!')
    } catch {
      toast.error('Erro ao gerar token de API')
    }
  }

  const handleRevokeToken = async (id: string) => {
    try {
      await tokensApi.revoke(id)
      setTokens((prev) => prev.filter((t) => t.id !== id))
      toast.success('Token revogado')
    } catch {
      toast.error('Erro ao revogar token')
    }
  }

  const handleCreateWebhook = async () => {
    if (!webhookName.trim() || !webhookUrl.trim()) return
    try {
      const created = await webhooksApi.create({
        name: webhookName.trim(),
        target_url: webhookUrl.trim(),
        events: ['document.ingested'],
        is_active: true,
      })
      setWebhooks((prev) => [...prev, created])
      toast.success('Webhook cadastrado com sucesso!')
      setWebhookModalOpen(false)
      setWebhookName('')
      setWebhookUrl('')
    } catch {
      toast.error('Erro ao cadastrar webhook')
    }
  }

  const handleDeleteWebhook = async (id: string) => {
    try {
      await webhooksApi.remove(id)
      setWebhooks((prev) => prev.filter((w) => w.id !== id))
      toast.success('Webhook excluído')
    } catch {
      toast.error('Erro ao excluir webhook')
    }
  }

  if (loading || !settingsData) {
    return <div className="p-8 text-center text-xs text-muted-foreground">Carregando configurações...</div>
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-background">
      <div className="bg-card border-b p-3 flex items-center justify-between shrink-0 shadow-2xs">
        <div>
          <h1 className="text-sm font-bold flex items-center gap-2">
            <SettingsIcon className="size-4 text-primary" />
            Configurações e Parâmetros Operacionais
          </h1>
          <p className="text-[11px] text-muted-foreground">
            Ajustes da rotina matinal, pasta de monitoramento, OCR, tokens de API e filtros salvos
          </p>
        </div>

        <Button size="sm" onClick={handleSaveSettings}>
          <Save className="size-3.5 mr-1.5" /> Salvar Preferências
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 max-w-5xl mx-auto w-full">
        {/* System Settings Section */}
        <Card className="shadow-2xs p-4 space-y-4">
          <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
            <Shield className="size-4 text-primary" /> Janela Operacional do Relatório Diário e OCR
          </CardTitle>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="font-medium">Horário de Corte Inicial</label>
              <Input
                value={settingsData.daily_cutoff_start}
                onChange={(e) =>
                  setSettingsData({ ...settingsData, daily_cutoff_start: e.target.value })
                }
                placeholder="06:00"
                className="mt-1 font-mono"
              />
              <span className="text-[10px] text-muted-foreground">Horário padrão de início de turno</span>
            </div>

            <div>
              <label className="font-medium">Horário de Corte Final</label>
              <Input
                value={settingsData.daily_cutoff_end}
                onChange={(e) =>
                  setSettingsData({ ...settingsData, daily_cutoff_end: e.target.value })
                }
                placeholder="06:00"
                className="mt-1 font-mono"
              />
              <span className="text-[10px] text-muted-foreground">Horário de fechamento da rotina matinal</span>
            </div>

            <div>
              <label className="font-medium">Tela Inicial Padrão</label>
              <select
                value={settingsData.default_home}
                onChange={(e) =>
                  setSettingsData({ ...settingsData, default_home: e.target.value as any })
                }
                className="h-8 mt-1 w-full rounded-md border bg-background px-2 text-xs"
              >
                <option value="daily">Relatório Diário (Recomendado)</option>
                <option value="occurrences">Explorador de Ocorrências</option>
                <option value="dashboards">Dashboards de Confiabilidade</option>
              </select>
            </div>
          </div>

          <div className="pt-3 border-t grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="font-medium">Pasta Monitorada (Watch Folder Inbox)</label>
              <Input
                value={settingsData.watch_folder_path}
                onChange={(e) =>
                  setSettingsData({ ...settingsData, watch_folder_path: e.target.value })
                }
                className="mt-1 font-mono text-[11px]"
              />
              <label className="flex items-center gap-2 mt-2 cursor-pointer text-[11px]">
                <input
                  type="checkbox"
                  checked={settingsData.watch_folder_enabled}
                  onChange={(e) =>
                    setSettingsData({ ...settingsData, watch_folder_enabled: e.target.checked })
                  }
                  className="size-3.5"
                />
                Ativar monitoramento contínuo em segundo plano
              </label>
            </div>

            <div>
              <label className="font-medium">Motor de OCR Híbrido (OCRmyPDF + Tesseract)</label>
              <div className="flex items-center gap-2 mt-1">
                <label className="flex items-center gap-2 cursor-pointer text-[11px]">
                  <input
                    type="checkbox"
                    checked={settingsData.ocr_enabled}
                    onChange={(e) =>
                      setSettingsData({ ...settingsData, ocr_enabled: e.target.checked })
                    }
                    className="size-3.5"
                  />
                  Ativar fallback automático de OCR para PDFs sem texto selecionável
                </label>
              </div>
              <div className="mt-2">
                <span className="text-[11px] text-muted-foreground">
                  Mínimo de caracteres por página para disparar OCR:
                </span>
                <Input
                  type="number"
                  value={settingsData.ocr_min_chars_per_page}
                  onChange={(e) =>
                    setSettingsData({
                      ...settingsData,
                      ocr_min_chars_per_page: parseInt(e.target.value) || 40,
                    })
                  }
                  className="w-24 mt-1 font-mono text-xs"
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Presets Management Section */}
        <Card className="shadow-2xs p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                <BookmarkPlus className="size-4 text-primary" /> Filtros Pré-Cadastrados da Área (Presets)
              </CardTitle>
              <CardDescription className="text-[11px]">
                Configuração dos botões de 1 clique exibidos na rotina matinal e no explorador
              </CardDescription>
            </div>

            <Button
              size="xs"
              variant="outline"
              onClick={() => {
                setPresetToEdit(null)
                setPresetModalOpen(true)
              }}
              className="gap-1 border-primary/30 hover:bg-primary/10 text-primary font-medium"
            >
              <Plus className="size-3" /> Novo Filtro da Área
            </Button>
          </div>

          <div className="space-y-2">
            {presets.map((p) => (
              <div key={p.id} className="p-2.5 rounded border bg-card flex items-center justify-between text-xs hover:border-primary/30 transition-colors">
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <div
                    className="size-3 rounded-full shrink-0"
                    style={{ backgroundColor: p.color || '#3b82f6' }}
                  />
                  <div className="overflow-hidden">
                    <p className="font-semibold text-foreground flex items-center gap-2">
                      <span>{p.name}</span>
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground">
                      {p.filter_payload.functional_locations_prefixes && p.filter_payload.functional_locations_prefixes.length > 0 && (
                        <span className="font-mono text-[10px] text-primary font-bold bg-primary/10 border border-primary/20 px-1.5 py-0.2 rounded">
                          PF ({p.filter_payload.functional_locations_prefixes.length}):{' '}
                          {p.filter_payload.functional_locations_prefixes.join(', ')}
                        </span>
                      )}
                      {p.filter_payload.arvores && p.filter_payload.arvores.length > 0 && (
                        <span className="font-mono text-muted-foreground">
                          Árvores: {p.filter_payload.arvores.join(', ')}
                        </span>
                      )}
                      {p.filter_payload.specialties && p.filter_payload.specialties.length > 0 && (
                        <span className="font-mono text-amber-600 dark:text-amber-400">
                          {p.filter_payload.specialties.join(', ')}
                        </span>
                      )}
                      {p.filter_payload.only_pane && <Badge variant="outline" className="text-[9px] text-destructive py-0 px-1 border-destructive/30">Apenas Panes</Badge>}
                      {p.filter_payload.only_jump && <Badge variant="outline" className="text-[9px] text-amber-600 py-0 px-1 border-amber-600/30">Apenas Jumps</Badge>}
                      {p.filter_payload.only_relevant && <Badge variant="outline" className="text-[9px] text-emerald-600 py-0 px-1 border-emerald-600/30">Relevantes</Badge>}
                      {p.filter_payload.only_analyze && <Badge variant="outline" className="text-[9px] text-purple-600 py-0 px-1 border-purple-600/30">Analisar</Badge>}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 ml-3">
                  {p.show_in_quickbar && <Badge variant="secondary" className="text-[10px]">Na Barra Rápida</Badge>}
                  {p.is_default && <Badge variant="outline" className="text-[10px]">Padrão</Badge>}
                  
                  <Button
                    size="xs"
                    variant="ghost"
                    className="text-muted-foreground hover:text-foreground h-7 px-2"
                    onClick={() => {
                      setPresetToEdit(p)
                      setPresetModalOpen(true)
                    }}
                    title="Editar configurações do filtro e Posições Funcionais"
                  >
                    <Pencil className="size-3 mr-1" /> Editar
                  </Button>

                  <Button
                    size="xs"
                    variant="ghost"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 px-2"
                    onClick={() => handleDeletePreset(p.id)}
                    title="Excluir este filtro pré-cadastrado"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              </div>
            ))}
            {presets.length === 0 && (
              <p className="text-[11px] text-muted-foreground italic text-center py-4">
                Nenhum filtro pré-cadastrado cadastrado. Clique no botão acima para criar o primeiro.
              </p>
            )}
          </div>
        </Card>

        {/* API Tokens Section */}
        <Card className="shadow-2xs p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                <KeyRound className="size-4 text-primary" /> Tokens de API para Ingestão Automatizada
              </CardTitle>
              <CardDescription className="text-[11px]">
                Chaves seguras para scripts, automações n8n e webhooks externos no header <code>X-API-Key</code>
              </CardDescription>
            </div>
            <Button size="xs" variant="outline" onClick={() => setTokenModalOpen(true)}>
              <Plus className="size-3 mr-1" /> Gerar Novo Token
            </Button>
          </div>

          <div className="space-y-2">
            {tokens.map((t) => (
              <div key={t.id} className="p-2.5 rounded border bg-card flex items-center justify-between text-xs">
                <div>
                  <p className="font-semibold">{t.name}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    Prefixo: <b>{t.prefix || t.token_prefix}...</b> • Criado em:{' '}
                    {t.created_at ? new Date(t.created_at).toLocaleDateString('pt-BR') : '-'}
                  </p>
                </div>
                <Button
                  size="xs"
                  variant="ghost"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => handleRevokeToken(t.id)}
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            ))}
            {tokens.length === 0 && (
              <p className="text-muted-foreground text-[11px] italic text-center py-2">
                Nenhum token de API adicional cadastrado.
              </p>
            )}
          </div>
        </Card>

        {/* Outgoing Webhooks Section */}
        <Card className="shadow-2xs p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                <WebhookIcon className="size-4 text-primary" /> Webhooks de Notificação Externa
              </CardTitle>
              <CardDescription className="text-[11px]">
                Notifique endpoints HTTP (n8n, Teams, alertas) instantaneamente ao ingerir novos PDFs
              </CardDescription>
            </div>
            <Button size="xs" variant="outline" onClick={() => setWebhookModalOpen(true)}>
              <Plus className="size-3 mr-1" /> Adicionar Webhook
            </Button>
          </div>

          <div className="space-y-2">
            {webhooks.map((w) => (
              <div key={w.id} className="p-2.5 rounded border bg-card flex items-center justify-between text-xs">
                <div>
                  <p className="font-semibold">{w.name}</p>
                  <p className="text-[10px] text-muted-foreground font-mono truncate max-w-md">
                    {w.target_url}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={w.is_active ? 'success' : 'secondary'}>
                    {w.is_active ? 'Ativo' : 'Inativo'}
                  </Badge>
                  <Button
                    size="xs"
                    variant="ghost"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => handleDeleteWebhook(w.id)}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              </div>
            ))}
            {webhooks.length === 0 && (
              <p className="text-muted-foreground text-[11px] italic text-center py-2">
                Nenhum webhook cadastrado.
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* Generate API Token Modal */}
      <Dialog
        open={tokenModalOpen}
        onOpenChange={(v) => {
          setTokenModalOpen(v)
          if (!v) {
            setCreatedTokenResult(null)
            setTokenName('')
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Gerar Token de API</DialogTitle>
            <DialogDescription className="text-xs">
              O token concederá permissão de ingestão direta de relatórios no endpoint <code>/api/v1/ingest</code>.
            </DialogDescription>
          </DialogHeader>

          {!createdTokenResult ? (
            <div className="space-y-3 py-2">
              <div>
                <label className="text-xs font-medium">Nome da Aplicação / Integração</label>
                <Input
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                  placeholder="Ex: n8n Pipeline SAP"
                  className="mt-1"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3 py-2">
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded text-xs space-y-1">
                <p className="font-bold text-amber-800 dark:text-amber-300">
                  Copie seu token agora. Ele não será exibido novamente!
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <input
                    readOnly
                    value={createdTokenResult.token}
                    className="flex-1 font-mono text-[11px] p-1.5 border rounded bg-background"
                  />
                  <Button
                    size="xs"
                    onClick={() => {
                      navigator.clipboard.writeText(createdTokenResult.token)
                      toast.success('Token copiado!')
                    }}
                  >
                    <Copy className="size-3 mr-1" /> Copiar
                  </Button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            {!createdTokenResult ? (
              <Button size="sm" onClick={handleCreateToken} disabled={!tokenName.trim()}>
                Gerar Chave
              </Button>
            ) : (
              <Button size="sm" onClick={() => setTokenModalOpen(false)}>
                Concluído
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Webhook Modal */}
      <Dialog open={webhookModalOpen} onOpenChange={setWebhookModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Cadastrar Webhook</DialogTitle>
            <DialogDescription className="text-xs">
              URL HTTPS para receber eventos com assinatura HMAC SHA256
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium">Nome do Webhook</label>
              <Input
                value={webhookName}
                onChange={(e) => setWebhookName(e.target.value)}
                placeholder="Ex: Notificador n8n / Teams"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium">URL Alvo (HTTPS)</label>
              <Input
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://n8n.fk.adm.br/webhook/atc-vision"
                className="mt-1 font-mono text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setWebhookModalOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleCreateWebhook} disabled={!webhookName.trim() || !webhookUrl.trim()}>
              Cadastrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preset Creation & Editing Modal */}
      <PresetEditorModal
        open={presetModalOpen}
        onOpenChange={setPresetModalOpen}
        presetToEdit={presetToEdit}
        onSuccess={loadAll}
      />
    </div>
  )
}
