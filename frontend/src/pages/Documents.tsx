import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { documentsApi } from '@/api'
import type { PdfDocument } from '@/api/types'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { UploadModal } from '@/components/layout/UploadModal'
import {
  AlertTriangle,
  Calendar,
  ExternalLink,
  Eye,
  FileText,
  FileUp,
  Loader2,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

export function Documents() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [documents, setDocuments] = useState<PdfDocument[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)

  const loadDocs = async () => {
    setLoading(true)
    try {
      const res = await documentsApi.list(100, 0)
      setDocuments(res.items)
      setTotal(res.total)
    } catch {
      toast.error('Erro ao listar documentos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDocs()
  }, [])

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Tem certeza que deseja excluir o documento "${name}" e seus mapeamentos?`)) return
    try {
      await documentsApi.remove(id)
      toast.success('Documento excluído com sucesso')
      loadDocs()
    } catch {
      toast.error('Erro ao excluir documento')
    }
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-background">
      {/* Header */}
      <div className="bg-card border-b p-3 flex items-center justify-between shrink-0 shadow-2xs">
        <div>
          <h1 className="text-sm font-bold flex items-center gap-2">
            <FileText className="size-4 text-primary" />
            Relatórios SAP PM Ingeridos no Sistema ({total})
          </h1>
          <p className="text-[11px] text-muted-foreground">
            Arquivos originais e versões pesquisáveis pós-OCR com coordenadas espaciais mapeadas
          </p>
        </div>

        <Button size="sm" onClick={() => setUploadOpen(true)}>
          <FileUp className="size-3.5 mr-1.5" /> Fazer Upload de PDF
        </Button>
      </div>

      {/* Documents Table */}
      <div className="flex-1 overflow-y-auto p-4 max-w-6xl mx-auto w-full">
        {loading ? (
          <div className="flex items-center justify-center p-12 text-muted-foreground">
            <Loader2 className="size-6 animate-spin mr-2" />
            <span>Carregando relatórios...</span>
          </div>
        ) : (
          <div className="border rounded-lg bg-card overflow-hidden shadow-2xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 border-b text-muted-foreground text-[11px]">
                <tr>
                  <th className="p-3">Nome do Arquivo</th>
                  <th className="p-3">Período de Turno</th>
                  <th className="p-3">Emissão</th>
                  <th className="p-3 text-center">Páginas</th>
                  <th className="p-3 text-center">Ocorrências</th>
                  <th className="p-3">Fonte / OCR</th>
                  <th className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-muted/20">
                    <td className="p-3 font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        <FileText className="size-4 text-primary shrink-0" />
                        <span className="truncate max-w-xs">{doc.filename}</span>
                      </div>
                      {doc.parse_warnings && doc.parse_warnings.length > 0 && (
                        <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                          ⚠️ {doc.parse_warnings[0]}
                        </p>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {doc.report_period_start ? (
                        <span>
                          {new Date(doc.report_period_start).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                          {' → '}
                          {doc.report_period_end ? new Date(doc.report_period_end).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {doc.emitted_at ? new Date(doc.emitted_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                    </td>
                    <td className="p-3 text-center font-mono">{doc.page_count}</td>
                    <td className="p-3 text-center font-bold font-mono text-primary">
                      {doc.occurrence_count}
                    </td>
                    <td className="p-3 space-y-1">
                      <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">
                        {doc.ingestion_source}
                      </span>
                      {doc.ocr_applied && <Badge variant="info">OCR</Badge>}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => navigate(`/ocorrencias?document_ids=${doc.id}`)}
                          title="Abrir ocorrências deste PDF"
                        >
                          <Eye className="size-3 mr-1" /> Ocorrências
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => window.open(documentsApi.fileUrl(doc.id), '_blank')}
                          title="Visualizar PDF original em nova aba"
                        >
                          <ExternalLink className="size-3" />
                        </Button>
                        {user?.is_admin && (
                          <Button
                            size="xs"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleDelete(doc.id, doc.filename)}
                            title="Excluir documento"
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {documents.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground italic">
                      Nenhum relatório PDF ingerido. Clique em "Fazer Upload de PDF" para começar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <UploadModal open={uploadOpen} onOpenChange={setUploadOpen} onSuccess={loadDocs} />
    </div>
  )
}
