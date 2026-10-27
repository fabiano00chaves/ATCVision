import React, { useEffect, useState } from 'react'
import { reportsApi } from '@/api'
import type {
  ExportFormat,
  GenerateRequest,
  OccurrenceFilters,
  ReportField,
  ReportTemplate,
} from '@/api/types'
import { FilterBar } from '@/components/filters/FilterBar'
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
  Check,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  Share2,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

export function Reports() {
  const [filters, setFilters] = useState<OccurrenceFilters>({})
  const [fields, setFields] = useState<ReportField[]>([])
  const [templates, setTemplates] = useState<ReportTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')

  // Report Builder State
  const [headerTitle, setHeaderTitle] = useState('ATC Vision — Relatório de Confiabilidade')
  const [scope, setScope] = useState<'relevant_or_analyze' | 'relevant' | 'analyze' | 'all'>(
    'relevant_or_analyze'
  )
  const [selectedFieldKeys, setSelectedFieldKeys] = useState<string[]>([])
  const [includeComments, setIncludeComments] = useState<boolean>(true)
  const [exportFormat, setExportFormat] = useState<'pdf' | 'xlsx' | 'csv' | 'whatsapp'>('pdf')

  // Text preview modal for WhatsApp / Teams
  const [textPreviewOpen, setTextPreviewOpen] = useState(false)
  const [generatedText, setGeneratedText] = useState('')
  const [generating, setGenerating] = useState(false)

  // Save new template modal
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')
  const [newTemplateDesc, setNewTemplateDesc] = useState('')

  const loadInitial = async () => {
    try {
      const [fList, tList] = await Promise.all([reportsApi.fields(), reportsApi.templates()])
      setFields(fList)
      setTemplates(tList)
      if (tList.length > 0) {
        applyTemplate(tList[0])
      } else {
        setSelectedFieldKeys(fList.filter((f) => f.default).map((f) => f.key))
      }
    } catch {
      toast.error('Erro ao carregar configurações de relatórios')
    }
  }

  useEffect(() => {
    loadInitial()
  }, [])

  const applyTemplate = (t: ReportTemplate) => {
    setSelectedTemplateId(t.id)
    setHeaderTitle(t.header_title)
    setSelectedFieldKeys(t.selected_fields)
    setIncludeComments(t.include_atc_comments)
    setExportFormat((t.export_format_default as any) || 'pdf')
  }

  const toggleField = (key: string) => {
    setSelectedFieldKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  const handleGenerate = async (fmt: ExportFormat) => {
    setGenerating(true)
    const req: GenerateRequest = {
      template_id: selectedTemplateId || undefined,
      selected_fields: selectedFieldKeys,
      header_title: headerTitle,
      include_atc_comments: includeComments,
      format: fmt,
      scope: scope,
      filters: filters,
    }

    try {
      const res = await reportsApi.generate(req)
      if (res.kind === 'json') {
        setGeneratedText(res.data.text)
        setTextPreviewOpen(true)
      } else {
        const url = window.URL.createObjectURL(res.data.blob)
        const a = document.createElement('a')
        a.href = url
        a.download = res.data.filename || `relatorio_atc_vision.${fmt}`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
        toast.success(`Relatório ${fmt.toUpperCase()} gerado com sucesso!`)
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao gerar relatório')
    } finally {
      setGenerating(false)
    }
  }

  const handleSaveTemplate = async () => {
    if (!newTemplateName.trim()) return
    try {
      const created = await reportsApi.createTemplate({
        name: newTemplateName.trim(),
        description: newTemplateDesc.trim(),
        selected_fields: selectedFieldKeys,
        grouping_field: 'arvore_planta',
        include_atc_comments: includeComments,
        header_title: headerTitle,
        export_format_default: exportFormat,
      })
      toast.success('Template salvo com sucesso!')
      setTemplates((prev) => [...prev, created])
      setSelectedTemplateId(created.id)
      setSaveTemplateOpen(false)
      setNewTemplateName('')
      setNewTemplateDesc('')
    } catch {
      toast.error('Erro ao salvar template')
    }
  }

  const handleDeleteTemplate = async (id: string) => {
    try {
      await reportsApi.deleteTemplate(id)
      setTemplates((prev) => prev.filter((t) => t.id !== id))
      toast.success('Template removido')
    } catch {
      toast.error('Erro ao remover template')
    }
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedText)
    toast.success('Texto copiado para a área de transferência!')
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-background">
      <FilterBar filters={filters} onChange={setFilters} />

      <div className="flex-1 overflow-y-auto p-4 space-y-6 max-w-5xl mx-auto w-full">
        {/* Template Selector Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">Template:</span>
            <select
              value={selectedTemplateId}
              onChange={(e) => {
                const t = templates.find((x) => x.id === e.target.value)
                if (t) applyTemplate(t)
              }}
              className="h-8 rounded-md border bg-background px-2 text-xs font-medium"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Button size="xs" variant="outline" onClick={() => setSaveTemplateOpen(true)}>
              <Plus className="size-3 mr-1" /> Salvar Configuração como Template
            </Button>
            {selectedTemplateId && (
              <Button
                size="xs"
                variant="ghost"
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => handleDeleteTemplate(selectedTemplateId)}
              >
                <Trash2 className="size-3" />
              </Button>
            )}
          </div>
        </div>

        {/* Builder Settings Card */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Column 1: Metadata & Scope */}
          <Card className="shadow-2xs space-y-3 p-4">
            <div>
              <label className="text-xs font-semibold">Título do Cabeçalho</label>
              <Input
                value={headerTitle}
                onChange={(e) => setHeaderTitle(e.target.value)}
                className="mt-1 text-xs"
              />
            </div>

            <div className="space-y-1.5 pt-2 border-t">
              <label className="text-xs font-semibold">Escopo das Ocorrências</label>
              <div className="space-y-1 text-xs">
                {[
                  { id: 'relevant_or_analyze', label: '⭐ Foco ATC (Relevantes ou Analisar)' },
                  { id: 'relevant', label: '⭐ Apenas Ocorrências Relevantes' },
                  { id: 'analyze', label: '🔍 Apenas Marcadas p/ Analisar' },
                  { id: 'all', label: '📋 Todas as Ocorrências do Filtro Ativo' },
                ].map((s) => (
                  <label key={s.id} className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-muted">
                    <input
                      type="radio"
                      name="scope"
                      checked={scope === s.id}
                      onChange={() => setScope(s.id as any)}
                      className="size-3.5"
                    />
                    <span>{s.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t">
              <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeComments}
                  onChange={(e) => setIncludeComments(e.target.checked)}
                  className="size-3.5"
                />
                Incluir Parecer Técnico e Comentários ATC
              </label>
            </div>
          </Card>

          {/* Column 2: Field Selection Checklist */}
          <Card className="md:col-span-2 shadow-2xs p-4 space-y-3">
            <div>
              <h3 className="text-xs font-semibold">Colunas e Campos Incluídos no Relatório</h3>
              <p className="text-[11px] text-muted-foreground">
                Selecione os dados técnicos essenciais para a sua apresentação
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {fields.map((f) => {
                const checked = selectedFieldKeys.includes(f.key)
                return (
                  <label
                    key={f.key}
                    className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${
                      checked ? 'bg-primary/5 border-primary/60 font-semibold' : 'bg-muted/30 border-border hover:bg-muted'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleField(f.key)}
                      className="size-3.5"
                    />
                    <span>{f.label}</span>
                  </label>
                )
              })}
            </div>
          </Card>
        </div>

        {/* 1-Click Export Actions */}
        <Card className="shadow-2xs p-4 bg-muted/20 border-dashed">
          <h3 className="text-xs font-semibold mb-3">Exportação Instantânea (1 Clique)</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Button
              className="h-10 text-xs font-semibold bg-red-700 hover:bg-red-800 text-white"
              onClick={() => handleGenerate('pdf')}
              disabled={generating}
            >
              {generating ? <Loader2 className="size-4 animate-spin mr-1" /> : <FileText className="size-4 mr-1" />}
              PDF Executivo
            </Button>

            <Button
              className="h-10 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white"
              onClick={() => handleGenerate('xlsx')}
              disabled={generating}
            >
              {generating ? <Loader2 className="size-4 animate-spin mr-1" /> : <FileSpreadsheet className="size-4 mr-1" />}
              Planilha Excel (.xlsx)
            </Button>

            <Button
              className="h-10 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => handleGenerate('whatsapp')}
              disabled={generating}
            >
              <MessageSquare className="size-4 mr-1" />
              WhatsApp / Teams
            </Button>

            <Button
              variant="outline"
              className="h-10 text-xs font-semibold"
              onClick={() => handleGenerate('csv')}
              disabled={generating}
            >
              <Download className="size-4 mr-1" />
              Arquivo CSV
            </Button>
          </div>
        </Card>
      </div>

      {/* WhatsApp / Teams Text Preview Modal */}
      <Dialog open={textPreviewOpen} onOpenChange={setTextPreviewOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <MessageSquare className="size-4 text-emerald-600" />
              Resumo Formatado para WhatsApp e Microsoft Teams
            </DialogTitle>
            <DialogDescription className="text-xs">
              Texto enxuto pronto para envio à equipe e gerência com destaques e parecer do ATC.
            </DialogDescription>
          </DialogHeader>

          <div className="p-3 bg-muted/60 rounded-md border font-mono text-[11px] whitespace-pre-wrap max-h-80 overflow-y-auto leading-relaxed">
            {generatedText}
          </div>

          <DialogFooter className="flex justify-between items-center sm:justify-between">
            <Button variant="ghost" size="sm" onClick={() => setTextPreviewOpen(false)}>
              Fechar
            </Button>
            <Button size="sm" onClick={copyToClipboard} className="bg-emerald-600 hover:bg-emerald-700">
              <Copy className="size-3.5 mr-1.5" />
              Copiar para Área de Transferência
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save Template Modal */}
      <Dialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Salvar Novo Template de Relatório</DialogTitle>
            <DialogDescription className="text-xs">
              Grave as colunas e configurações atuais para reutilizar nas próximas reuniões.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium">Nome do Template</label>
              <Input
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                placeholder="Ex: Alinhamento Matinal Operação"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium">Descrição</label>
              <Input
                value={newTemplateDesc}
                onChange={(e) => setNewTemplateDesc(e.target.value)}
                placeholder="Ex: Foco nas panes e intervenções elétricas"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setSaveTemplateOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSaveTemplate} disabled={!newTemplateName.trim()}>
              Salvar Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
