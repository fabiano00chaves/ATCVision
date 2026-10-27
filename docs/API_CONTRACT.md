# ATC Vision — API Contract (v1)

Base URL: `/api/v1` (the frontend nginx proxies `/api/` → backend `:8000`).

## Conventions

* JSON everywhere (except uploads/downloads). Field names are `snake_case`.
* **Plant-local naive datetimes.** All SAP-derived timestamps (`abertura_timestamp`,
  `inicio_avaria`, `report_period_start`, filters `start`/`end` …) are ISO strings
  **without timezone** (`2026-10-26T06:00:00`) and represent America/Sao_Paulo plant time.
  System timestamps (`created_at`, `updated_at`) are ISO with offset.
* Dates `YYYY-MM-DD`, times `HH:MM:SS`.
* Errors: `{"detail": "message"}` with proper HTTP status (400/401/403/404/409/413/415/422).
* Pagination: `limit` + `offset`, response `{ "items": [...], "total": n }`.
* **Auth:** cookie `atc_session` (HttpOnly, Secure, SameSite=Lax) set by login.
  Always call with `credentials: "include"`.
  **Every non-GET request authenticated by cookie MUST send header `X-ATC-Client: web`**
  (CSRF defense). Automations use header `X-API-Key: <token>` instead.
* 401 → frontend redirects to `/login`.

## Enums

```
TipoOcorrencia  = "CORRETIVA" | "NOTIFICACAO_GERAL" | "PREVENTIVA_CONDICAO" | "PREVENTIVA_TEMPO"
  labels: Corretiva | Notificação Geral | Preventiva Condicional | Preventiva Tempo/Contador
StatusATC       = "NOVO" | "EM_ANALISE" | "AGUARDANDO_PARADA" | "ENCAMINHADO_INSPECAO" | "JUMP_ATIVO" | "CONCLUIDO"
PrioridadeATC   = "BAIXA" | "MEDIA" | "ALTA" | "CRITICA"
Especialidade   = "ELETRICA" | "MECANICA" | "OUTRA"
JumpStatus      = "PENDENTE" | "RETIRADO" | null
IngestionSource = "MANUAL_UPLOAD" | "WATCH_FOLDER" | "WEBHOOK_API"
Arvores (plant trees) = "BOF1","SLM1","CCS1","CCS2","CCS3","PCC1","COM0"
Turnos          = "Turno A","Turno B","Turno C","Turno D","D Dia","N Noite"
```

## Auth

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/auth/login` | `{email, password}` | `{user: User}` + Set-Cookie |
| POST | `/auth/logout` | – | `{ok:true}` |
| GET  | `/auth/me` | – | `User` |

`User = {id, email, name, is_admin}`

## Documents (PDF ingestion)

| Method | Path | Notes |
|---|---|---|
| POST | `/documents/upload` | multipart, field `files` (1..n PDFs, ≤ 100 MB each) |
| GET  | `/documents?limit&offset` | newest first |
| GET  | `/documents/{id}` | `Document` |
| GET  | `/documents/{id}/file` | `application/pdf` stream (the *viewable* PDF – OCR'd version if OCR applied) |
| DELETE | `/documents/{id}` | admin; deletes document + mappings (occurrences kept if mapped elsewhere) |

```ts
Document = {
  id, filename, file_hash_sha256, report_period_start: string|null, report_period_end: string|null,
  emitted_at: string|null, page_count, ocr_applied: boolean, ingestion_source, created_at,
  occurrence_count: number, parse_warnings: string[], page_sizes: {w:number,h:number}[]  // index = page-1, PDF points
}
UploadResult = { results: Array<{
  filename, status: "created" | "duplicate" | "error",
  document?: Document, occurrences_created: number, occurrences_updated: number, error?: string
}> }
```

## Occurrences

### Shared filter query params (used by list, counts, dashboards, reports)

| Param | Type | Meaning |
|---|---|---|
| `start`, `end` | naive ISO datetime | `abertura_timestamp` in `[start, end)` |
| `document_ids` | csv uuid | only occurrences mapped to any of these PDFs |
| `q` | string | keyword (full-text + trigram typo tolerant) over título, descrições, confirmação, defeito, causa, executantes, comentários ATC |
| `nota`, `ordem` | string | partial match |
| `fl_prefixes` | csv | functional location prefixes, e.g. `BT-ST-SLM1,BT-ST-BOF1` |
| `arvores` | csv | `SLM1,BOF1,...` |
| `fl_desc` | string | partial match on descrição da posição funcional |
| `specialties` | csv | `ELETRICA,MECANICA` |
| `turnos` | csv | `Turno A,Turno B` (values as stored) |
| `planning_groups` | csv | `058/AT00,184/AT00` |
| `tipos` | csv | TipoOcorrencia |
| `status_atc`, `prioridade_atc` | csv | enums |
| `only_pane`, `only_jump`, `only_relevant`, `only_analyze` | bool | |
| `preset_id` | uuid | ANDs the preset's `filter_payload` with the other params |
| `sort` | `abertura_desc` (default) \| `abertura_asc` \| `relevance` \| `pane_desc` | |
| `limit` (default 50, max 500), `offset` | int | |

| Method | Path | Response |
|---|---|---|
| GET | `/occurrences` | `{items: OccurrenceSummary[], total}` |
| GET | `/occurrences/counts?<filters>` | `{total, presets: [{preset_id, count}]}` – count of each quickbar preset inside the given filters (window) |
| GET | `/occurrences/{id}` | `OccurrenceDetail` |
| PATCH | `/occurrences/{id}` | body: any of `{flag_analisar, flag_relevante, status_atc, prioridade_atc, tags_customizadas: string[], jump_status}` → `OccurrenceDetail` |
| GET | `/occurrences/{id}/neighbors?<filters>` | `{prev_id: string|null, next_id: string|null}` in current filter order |
| GET | `/occurrences/{id}/comments` | `Comment[]` |
| POST | `/occurrences/{id}/comments` | `{comment_text, is_action_item}` → `Comment` |
| PATCH | `/comments/{id}` | `{comment_text?, is_action_item?}` → `Comment` |
| DELETE | `/comments/{id}` | `{ok:true}` |

```ts
OccurrenceSummary = {
  id, unique_sap_key, tipo_ocorrencia: TipoOcorrencia, numero_nota: string|null, numero_ordem: string|null,
  titulo, status_ordem: string|null, prioridade_sap: string|null,
  data_abertura: string|null, hora_abertura: string|null, abertura_timestamp: string|null,
  turno: string|null, grupo_planejamento: string|null, reportado_por_id: string|null, reportado_por_nome: string|null,
  especialidade: Especialidade, posicao_funcional: string|null, arvore_planta: string|null,
  descricao_posicao_funcional: string|null, descricao_curta_objeto: string|null,
  teve_pane: boolean, duracao_pane_min: number, duracao_avaria_min: number|null,
  tem_jump_force: boolean, jump_status: JumpStatus,
  hh_total_minutos: number, quantidade_executantes: number,
  flag_analisar: boolean, flag_relevante: boolean, status_atc: StatusATC, prioridade_atc: PrioridadeATC|null,
  tags_customizadas: string[], comment_count: number,
  snippet: string|null,            // plain-text excerpt around keyword match (when q given)
  document_ids: string[], primary_document_id: string|null
}

OccurrenceDetail = OccurrenceSummary & {
  descricao_longa_notificacao: string|null, descricao_longa_ordem: string|null, texto_confirmacao: string|null,
  defeito: string|null, causa: string|null, observacoes_objeto: string|null,
  equipamento_codigo: string|null, equipamento_descricao: string|null,
  inicio_avaria: string|null, fim_avaria: string|null,
  detalhe_jump_tarefas: string|null, jump_retirado_em: string|null,
  operacoes: {numero: string, descricao: string}[],
  objetos: {ordem: string|null, posicao_funcional: string|null, descricao: string|null, equipamento: string|null, description: string|null}[],
  confirmations: Confirmation[], comments: Comment[], mappings: Mapping[],
  created_at, updated_at
}
Confirmation = {id, data_execucao, hora_execucao, centro_trabalho, matricula, nome_executante, duracao_min}
Comment      = {id, author_name, comment_text, is_action_item, created_at, updated_at}
BBox         = {page: number /*1-based*/, x0, y0, x1, y1}   // PDF points, origin TOP-LEFT of page
Mapping = {
  id, pdf_document_id, document_filename, report_period_start, report_period_end,
  start_page, end_page, page_sizes: {w,h}[],          // whole document, index = page-1
  field_bboxes: Record<FieldKey, BBox[]>
}
FieldKey = "record" | "numero_nota" | "numero_ordem" | "titulo" | "tipo" | "status_ordem" | "data_abertura"
         | "turno" | "reportado_por" | "grupo_planejamento" | "posicao_funcional" | "descricao_posicao_funcional"
         | "equipamento" | "descricao_longa_notificacao" | "descricao_longa_ordem" | "objetos" | "defeito"
         | "causa" | "operacoes" | "avaria" | "pane" | "jump_tarefas" | "confirmacoes" | "texto_confirmacao"
```

Highlight rendering: `scale = renderedPageWidthPx / page_sizes[page-1].w`; rectangle =
`(x0*scale, y0*scale, (x1-x0)*scale, (y1-y0)*scale)` relative to the page canvas top-left.

## Daily report window

`GET /daily/window?mode=last24|weekend|days&n=3&ref=YYYY-MM-DD`
→ `{start, end, label}` computed with settings cutoff (default 06:00→06:00).
* `last24`: `ref-1 06:00 → ref 06:00` (ref default = today)
* `weekend`: previous Friday 06:00 → Monday (ref week) 06:00
* `days`: `ref-n 06:00 → ref 06:00`

## Filter presets

| Method | Path |
|---|---|
| GET | `/presets` → `Preset[]` (sorted by `sort_order`) |
| POST | `/presets` → `Preset` |
| PUT | `/presets/{id}` → `Preset` |
| DELETE | `/presets/{id}` |

```ts
Preset = { id, name, icon /* lucide icon name or emoji */, color /* tailwind-ish hex */, is_default, show_in_quickbar, sort_order,
  filter_payload: {
    functional_locations_prefixes: string[], planning_groups: string[], specialties: Especialidade[],
    reportado_por_ids: string[], keywords: string[], tipos: TipoOcorrencia[],
    only_pane: boolean, only_jump: boolean, only_relevant: boolean, only_analyze: boolean
  } }
```

## Dashboards (all accept the shared filters)

| GET | Response |
|---|---|
| `/dashboards/kpis` | `{total, by_tipo:[{tipo,count}], by_especialidade:[{especialidade,count}], by_arvore:[{arvore,count,pane_min}], by_turno:[{turno,count}], pane_count, pane_total_min, jump_count, jump_pendentes, hh_total_min, mttr_min: number|null, mttr_by_arvore:[{arvore,mttr_min,count}], mttr_by_especialidade:[{especialidade,mttr_min,count}], by_day:[{date, CORRETIVA, NOTIFICACAO_GERAL, PREVENTIVA_CONDICAO, PREVENTIVA_TEMPO, pane_min}]}` |
| `/dashboards/bad-actors?days=7&min_count=2` | `{days, items:[{posicao_funcional, descricao, arvore, count, pane_min, last_at, occurrences:[{id,titulo,abertura_timestamp,teve_pane}]}]}` (ignores start/end; uses now-days) |
| `/dashboards/failure-modes` | `{matrix:[{defeito,causa,count}], top_defeitos:[{label,count}], top_causas:[{label,count}], quality:{total, causa_nao_encontrada, analise_nao_realizada, sem_causa, sem_defeito, pct_baixa_qualidade}}` |
| `/dashboards/jumps?jump_status=PENDENTE|RETIRADO|ALL` | `{items: OccurrenceSummary[] (with detalhe_jump_tarefas), total}` |

## Report templates & generation

| Method | Path |
|---|---|
| GET/POST | `/report-templates` |
| PUT/DELETE | `/report-templates/{id}` |
| GET | `/report-fields` → `[{key,label,default}]` |
| POST | `/reports/generate` |

```ts
ReportTemplate = { id, name, description, selected_fields: string[], grouping_field: "arvore_planta"|"tipo_ocorrencia"|"turno"|"especialidade"|"none",
                   include_atc_comments: boolean, header_title: string, export_format_default: ExportFormat }
ExportFormat = "pdf" | "xlsx" | "csv" | "whatsapp" | "markdown"
ReportFieldKey = "nota_ordem" | "posicao_funcional" | "arvore_completa" | "titulo_resumo" | "pane" | "jump"
               | "comentarios_atc" | "executantes_hh" | "defeito_causa" | "status_atc" | "turno_abertura" | "tipo"
GenerateRequest = {
  template_id?: string, selected_fields?: ReportFieldKey[], grouping_field?: string, include_atc_comments?: boolean,
  header_title?: string, format: ExportFormat,
  scope: "relevant_or_analyze" | "relevant" | "analyze" | "all",
  filters: { ...shared filter params as JSON (arrays for csv params) },
  occurrence_ids?: string[]       // explicit selection overrides scope/filters
}
```
Response: `pdf|xlsx|csv` → file download (Content-Disposition). `whatsapp|markdown` → `{text, count}`.

## Settings, tokens, webhooks (admin)

| Method | Path |
|---|---|
| GET/PUT | `/settings` → `Settings` |
| GET | `/meta/facets?<filters>` → `{planning_groups:string[], arvores:string[], turnos:string[], reportado_por:[{id,nome}], tipos:string[], tags:string[]}` |
| GET/POST | `/api-tokens` (POST `{name}` → `{token, item}`; token shown once) |
| DELETE | `/api-tokens/{id}` |
| GET/POST | `/webhooks` (outgoing: `{name, target_url, events:["document.ingested"], is_active}`) |
| PUT/DELETE | `/webhooks/{id}` |
| POST | `/ingest` (X-API-Key) multipart `file` **or** JSON `{filename, content_base64}` → `UploadResult` |
| GET | `/health` → `{status:"ok", db:true, version}` |

```ts
Settings = { daily_cutoff_start: "06:00", daily_cutoff_end: "06:00", default_home: "daily"|"occurrences"|"dashboards",
             timezone: "America/Sao_Paulo", watch_folder_enabled: boolean, watch_folder_path: string,
             ocr_enabled: boolean, ocr_min_chars_per_page: number, bad_actor_default_days: number,
             specialty_rules: { ELETRICA: string[] /* reportado_por prefixes / ids / planning groups */, MECANICA: string[] } }
```
