import type {
  Especialidade,
  ExportFormat,
  FieldKey,
  GroupingField,
  IngestionSource,
  PrioridadeATC,
  ReportScope,
  StatusATC,
  TipoOcorrencia,
} from '@/api/types'

export const TIPO_LABELS: Record<TipoOcorrencia, string> = {
  CORRETIVA: 'Corretiva',
  NOTIFICACAO_GERAL: 'Notificação Geral',
  PREVENTIVA_CONDICAO: 'Preventiva Condicional',
  PREVENTIVA_TEMPO: 'Preventiva Tempo/Contador',
}

export const TIPO_SHORT: Record<TipoOcorrencia, string> = {
  CORRETIVA: 'Corretiva',
  NOTIFICACAO_GERAL: 'Notif. Geral',
  PREVENTIVA_CONDICAO: 'Prev. Cond.',
  PREVENTIVA_TEMPO: 'Prev. Tempo',
}

export const TIPO_COLORS: Record<TipoOcorrencia, string> = {
  CORRETIVA: '#ef4444',
  NOTIFICACAO_GERAL: '#38bdf8',
  PREVENTIVA_CONDICAO: '#a78bfa',
  PREVENTIVA_TEMPO: '#34d399',
}

export const TIPOS: TipoOcorrencia[] = ['CORRETIVA', 'NOTIFICACAO_GERAL', 'PREVENTIVA_CONDICAO', 'PREVENTIVA_TEMPO']

export const STATUS_LABELS: Record<StatusATC, string> = {
  NOVO: 'Novo',
  EM_ANALISE: 'Em Análise',
  AGUARDANDO_PARADA: 'Aguardando Parada',
  ENCAMINHADO_INSPECAO: 'Encaminhado p/ Inspeção',
  JUMP_ATIVO: 'Jump Ativo',
  CONCLUIDO: 'Concluído',
}

export const STATUS_CLASSES: Record<StatusATC, string> = {
  NOVO: 'bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/30',
  EM_ANALISE: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
  AGUARDANDO_PARADA: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  ENCAMINHADO_INSPECAO: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30',
  JUMP_ATIVO: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
  CONCLUIDO: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
}

export const STATUSES: StatusATC[] = [
  'NOVO',
  'EM_ANALISE',
  'AGUARDANDO_PARADA',
  'ENCAMINHADO_INSPECAO',
  'JUMP_ATIVO',
  'CONCLUIDO',
]

export const PRIORIDADE_LABELS: Record<PrioridadeATC, string> = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
  CRITICA: 'Crítica',
}

export const PRIORIDADE_CLASSES: Record<PrioridadeATC, string> = {
  BAIXA: 'bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/30',
  MEDIA: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
  ALTA: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  CRITICA: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
}

export const PRIORIDADES: PrioridadeATC[] = ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']

export const ESPECIALIDADE_LABELS: Record<Especialidade, string> = {
  ELETRICA: 'Elétrica/Automação',
  MECANICA: 'Mecânica',
  OUTRA: 'Outra',
}

export const ESPECIALIDADE_COLORS: Record<Especialidade, string> = {
  ELETRICA: '#facc15',
  MECANICA: '#60a5fa',
  OUTRA: '#94a3b8',
}

export const ARVORES = ['BOF1', 'SLM1', 'CCS1', 'CCS2', 'CCS3', 'PCC1', 'COM0'] as const

export const TURNOS = ['Turno A', 'Turno B', 'Turno C', 'Turno D', 'D Dia', 'N Noite']

export const SOURCE_LABELS: Record<IngestionSource, string> = {
  MANUAL_UPLOAD: 'Upload manual',
  WATCH_FOLDER: 'Pasta monitorada',
  WEBHOOK_API: 'API / Webhook',
}

export const FIELD_LABELS: Record<FieldKey, string> = {
  record: 'Registro completo',
  numero_nota: 'Nota',
  numero_ordem: 'Ordem',
  titulo: 'Título',
  tipo: 'Tipo',
  status_ordem: 'Status da ordem',
  data_abertura: 'Data de abertura',
  turno: 'Turno',
  reportado_por: 'Reportado por',
  grupo_planejamento: 'Grupo de planejamento',
  posicao_funcional: 'Posição funcional',
  descricao_posicao_funcional: 'Descrição da posição funcional',
  equipamento: 'Equipamento',
  descricao_longa_notificacao: 'Descrição longa da notificação',
  descricao_longa_ordem: 'Descrição longa da ordem',
  objetos: 'Lista de objetos',
  defeito: 'Defeito',
  causa: 'Causa',
  operacoes: 'Operações',
  avaria: 'Avaria',
  pane: 'Pane',
  jump_tarefas: 'By-pass / Jump',
  confirmacoes: 'Confirmações',
  texto_confirmacao: 'Texto de confirmação',
}

export const GROUPING_LABELS: Record<GroupingField, string> = {
  none: 'Sem agrupamento',
  arvore_planta: 'Árvore da planta',
  tipo_ocorrencia: 'Tipo de ocorrência',
  turno: 'Turno',
  especialidade: 'Especialidade',
}

export const SCOPE_LABELS: Record<ReportScope, string> = {
  relevant_or_analyze: 'Relevantes + Analisar',
  relevant: 'Somente Relevantes',
  analyze: 'Somente Analisar',
  all: 'Todas do filtro atual',
}

export const FORMAT_LABELS: Record<ExportFormat, string> = {
  pdf: 'PDF Executivo',
  xlsx: 'Excel (.xlsx)',
  csv: 'CSV',
  whatsapp: 'WhatsApp / Teams',
  markdown: 'Markdown',
}
