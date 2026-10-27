// Types mirroring docs/API_CONTRACT.md (v1)

export type TipoOcorrencia = 'CORRETIVA' | 'NOTIFICACAO_GERAL' | 'PREVENTIVA_CONDICAO' | 'PREVENTIVA_TEMPO'
export type StatusATC =
  | 'NOVO'
  | 'EM_ANALISE'
  | 'AGUARDANDO_PARADA'
  | 'ENCAMINHADO_INSPECAO'
  | 'JUMP_ATIVO'
  | 'CONCLUIDO'
export type PrioridadeATC = 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA'
export type Especialidade = 'ELETRICA' | 'MECANICA' | 'OUTRA'
export type JumpStatus = 'PENDENTE' | 'RETIRADO' | null
export type IngestionSource = 'MANUAL_UPLOAD' | 'WATCH_FOLDER' | 'WEBHOOK_API'
export type Arvore = 'BOF1' | 'SLM1' | 'CCS1' | 'CCS2' | 'CCS3' | 'PCC1' | 'COM0'

export interface Paginated<T> {
  items: T[]
  total: number
}

// ---------- Auth ----------
export interface User {
  id: string
  email: string
  name: string
  is_admin: boolean
}

// ---------- Documents ----------
export interface PageSize {
  w: number
  h: number
}

export interface PdfDocument {
  id: string
  filename: string
  file_hash_sha256: string
  report_period_start: string | null
  report_period_end: string | null
  emitted_at: string | null
  page_count: number
  ocr_applied: boolean
  ingestion_source: IngestionSource
  created_at: string
  occurrence_count: number
  parse_warnings: string[]
  page_sizes: PageSize[]
}

export interface UploadResultItem {
  filename: string
  status: 'created' | 'duplicate' | 'error'
  document?: PdfDocument
  occurrences_created: number
  occurrences_updated: number
  error?: string
}

export interface UploadResult {
  results: UploadResultItem[]
}

// ---------- Occurrences ----------
export interface OccurrenceSummary {
  id: string
  unique_sap_key: string
  tipo_ocorrencia: TipoOcorrencia
  numero_nota: string | null
  numero_ordem: string | null
  titulo: string
  status_ordem: string | null
  prioridade_sap: string | null
  data_abertura: string | null
  hora_abertura: string | null
  abertura_timestamp: string | null
  turno: string | null
  grupo_planejamento: string | null
  reportado_por_id: string | null
  reportado_por_nome: string | null
  especialidade: Especialidade
  posicao_funcional: string | null
  arvore_planta: string | null
  descricao_posicao_funcional: string | null
  descricao_curta_objeto: string | null
  teve_pane: boolean
  duracao_pane_min: number
  duracao_avaria_min: number | null
  tem_jump_force: boolean
  jump_status: JumpStatus
  hh_total_minutos: number
  quantidade_executantes: number
  flag_analisar: boolean
  flag_relevante: boolean
  status_atc: StatusATC
  prioridade_atc: PrioridadeATC | null
  tags_customizadas: string[]
  comment_count: number
  snippet: string | null
  document_ids: string[]
  primary_document_id: string | null
  /** present on /dashboards/jumps items */
  detalhe_jump_tarefas?: string | null
}

export interface Confirmation {
  id: string
  data_execucao: string | null
  hora_execucao: string | null
  centro_trabalho: string | null
  matricula: string | null
  nome_executante: string | null
  duracao_min: number | null
}

export interface Comment {
  id: string
  author_name: string
  comment_text: string
  is_action_item: boolean
  created_at: string
  updated_at: string
}

export interface BBox {
  page: number // 1-based
  x0: number
  y0: number
  x1: number
  y1: number
}

export type FieldKey =
  | 'record'
  | 'numero_nota'
  | 'numero_ordem'
  | 'titulo'
  | 'tipo'
  | 'status_ordem'
  | 'data_abertura'
  | 'turno'
  | 'reportado_por'
  | 'grupo_planejamento'
  | 'posicao_funcional'
  | 'descricao_posicao_funcional'
  | 'equipamento'
  | 'descricao_longa_notificacao'
  | 'descricao_longa_ordem'
  | 'objetos'
  | 'defeito'
  | 'causa'
  | 'operacoes'
  | 'avaria'
  | 'pane'
  | 'jump_tarefas'
  | 'confirmacoes'
  | 'texto_confirmacao'

export interface Mapping {
  id: string
  pdf_document_id: string
  document_filename: string
  report_period_start: string | null
  report_period_end: string | null
  start_page: number
  end_page: number
  page_sizes: PageSize[]
  field_bboxes: Partial<Record<FieldKey, BBox[]>>
}

export interface Operacao {
  numero: string
  descricao: string
}

export interface ObjetoItem {
  ordem: string | null
  posicao_funcional: string | null
  descricao: string | null
  equipamento: string | null
  description: string | null
}

export interface OccurrenceDetail extends OccurrenceSummary {
  descricao_longa_notificacao: string | null
  descricao_longa_ordem: string | null
  texto_confirmacao: string | null
  defeito: string | null
  causa: string | null
  observacoes_objeto: string | null
  equipamento_codigo: string | null
  equipamento_descricao: string | null
  inicio_avaria: string | null
  fim_avaria: string | null
  detalhe_jump_tarefas: string | null
  jump_retirado_em: string | null
  operacoes: Operacao[]
  objetos: ObjetoItem[]
  confirmations: Confirmation[]
  comments: Comment[]
  mappings: Mapping[]
  created_at: string
  updated_at: string
}

export interface OccurrencePatch {
  flag_analisar?: boolean
  flag_relevante?: boolean
  status_atc?: StatusATC
  prioridade_atc?: PrioridadeATC | null
  tags_customizadas?: string[]
  jump_status?: JumpStatus
}

export interface OccurrenceCounts {
  total: number
  presets: { preset_id: string; count: number }[]
}

export interface Neighbors {
  prev_id: string | null
  next_id: string | null
}

export type SortKey = 'abertura_desc' | 'abertura_asc' | 'relevance' | 'pane_desc'

/** Shared filter query params */
export interface OccurrenceFilters {
  start?: string
  end?: string
  document_ids?: string[]
  q?: string
  nota?: string
  ordem?: string
  fl_prefixes?: string[]
  arvores?: string[]
  fl_desc?: string
  specialties?: Especialidade[]
  turnos?: string[]
  planning_groups?: string[]
  tipos?: TipoOcorrencia[]
  status_atc?: StatusATC[]
  prioridade_atc?: PrioridadeATC[]
  only_pane?: boolean
  only_jump?: boolean
  only_relevant?: boolean
  only_analyze?: boolean
  preset_id?: string
  sort?: SortKey
}

// ---------- Daily window ----------
export type DailyMode = 'last24' | 'weekend' | 'days'
export interface DailyWindow {
  start: string
  end: string
  label: string
}

// ---------- Presets ----------
export interface PresetFilterPayload {
  functional_locations_prefixes?: string[]
  planning_groups?: string[]
  specialties?: Especialidade[]
  reportado_por_ids?: string[]
  keywords?: string[]
  tipos?: TipoOcorrencia[]
  arvores?: string[]
  turnos?: string[]
  status_atc?: StatusATC[]
  fl_desc?: string
  only_pane?: boolean
  only_jump?: boolean
  only_relevant?: boolean
  only_analyze?: boolean
}

export interface Preset {
  id: string
  name: string
  icon: string
  color: string
  is_default: boolean
  show_in_quickbar: boolean
  sort_order: number
  filter_payload: PresetFilterPayload
}

export type PresetInput = Omit<Preset, 'id'>

// ---------- Dashboards ----------
export interface KpiDay {
  date: string
  CORRETIVA: number
  NOTIFICACAO_GERAL: number
  PREVENTIVA_CONDICAO: number
  PREVENTIVA_TEMPO: number
  pane_min: number
}

export interface Kpis {
  total: number
  by_tipo: { tipo: TipoOcorrencia; count: number }[]
  by_especialidade: { especialidade: Especialidade; count: number }[]
  by_arvore: { arvore: string; count: number; pane_min: number }[]
  by_turno: { turno: string; count: number }[]
  pane_count: number
  pane_total_min: number
  jump_count: number
  jump_pendentes: number
  hh_total_min: number
  mttr_min: number | null
  mttr_by_arvore: { arvore: string; mttr_min: number | null; count: number }[]
  mttr_by_especialidade: { especialidade: Especialidade; mttr_min: number | null; count: number }[]
  by_day: KpiDay[]
}

export interface BadActorItem {
  posicao_funcional: string
  descricao: string | null
  arvore: string | null
  count: number
  pane_min: number
  last_at: string | null
  occurrences: { id: string; titulo: string; abertura_timestamp: string | null; teve_pane: boolean }[]
}

export interface BadActors {
  days: number
  items: BadActorItem[]
}

export interface FailureModes {
  matrix: { defeito: string; causa: string; count: number }[]
  top_defeitos: { label: string; count: number }[]
  top_causas: { label: string; count: number }[]
  quality: {
    total: number
    causa_nao_encontrada: number
    analise_nao_realizada: number
    sem_causa: number
    sem_defeito: number
    pct_baixa_qualidade: number
  }
}

export type JumpFilter = 'PENDENTE' | 'RETIRADO' | 'ALL'

// ---------- Reports ----------
export type ExportFormat = 'pdf' | 'xlsx' | 'csv' | 'whatsapp' | 'markdown'
export type GroupingField = 'arvore_planta' | 'tipo_ocorrencia' | 'turno' | 'especialidade' | 'none'
export type ReportFieldKey =
  | 'nota_ordem'
  | 'posicao_funcional'
  | 'arvore_completa'
  | 'titulo_resumo'
  | 'pane'
  | 'jump'
  | 'comentarios_atc'
  | 'executantes_hh'
  | 'defeito_causa'
  | 'status_atc'
  | 'turno_abertura'
  | 'tipo'
export type ReportScope = 'relevant_or_analyze' | 'relevant' | 'analyze' | 'all'

export interface ReportTemplate {
  id: string
  name: string
  description: string
  selected_fields: string[]
  grouping_field: GroupingField
  include_atc_comments: boolean
  header_title: string
  export_format_default: ExportFormat
}

export type ReportTemplateInput = Omit<ReportTemplate, 'id'>

export interface ReportField {
  key: string
  label: string
  default: boolean
}

/** filters serialized as JSON (arrays for csv params) */
export type ReportFilters = Omit<OccurrenceFilters, 'sort'> & { sort?: SortKey }

export interface GenerateRequest {
  template_id?: string
  selected_fields?: string[]
  grouping_field?: string
  include_atc_comments?: boolean
  header_title?: string
  format: ExportFormat
  scope: ReportScope
  filters: ReportFilters
  occurrence_ids?: string[]
}

export interface GenerateTextResult {
  text: string
  count: number
}

// ---------- Settings / meta / tokens / webhooks ----------
export interface Settings {
  daily_cutoff_start: string
  daily_cutoff_end: string
  default_home: 'daily' | 'occurrences' | 'dashboards'
  timezone: string
  watch_folder_enabled: boolean
  watch_folder_path: string
  ocr_enabled: boolean
  ocr_min_chars_per_page: number
  bad_actor_default_days: number
  specialty_rules: { ELETRICA: string[]; MECANICA: string[] }
}

export interface Facets {
  planning_groups: string[]
  arvores: string[]
  turnos: string[]
  reportado_por: { id: string; nome: string }[]
  tipos: string[]
  tags: string[]
}

/** The contract does not detail the token list item shape; fields beyond id/name are optional. */
export interface ApiTokenItem {
  id: string
  name: string
  created_at?: string | null
  last_used_at?: string | null
  prefix?: string | null
  token_prefix?: string | null
  revoked?: boolean
}

export interface ApiTokenCreated {
  token: string
  item: ApiTokenItem
}

export interface Webhook {
  id: string
  name: string
  target_url: string
  events: string[]
  is_active: boolean
  created_at?: string | null
}

export type WebhookInput = Omit<Webhook, 'id' | 'created_at'>

export interface Health {
  status: string
  db: boolean
  version: string
}
