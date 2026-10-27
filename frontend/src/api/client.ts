/* Low-level fetch wrapper for the ATC Vision API (v1). */

export const API_BASE = '/api/v1'

export class ApiError extends Error {
  status: number
  detail: unknown
  constructor(status: number, message: string, detail?: unknown) {
    super(message)
    this.status = status
    this.detail = detail
  }
}

type QueryValue = string | number | boolean | null | undefined | string[] | readonly string[]
export type QueryParams = Record<string, QueryValue>

export function buildQuery(params?: QueryParams | URLSearchParams): string {
  if (!params) return ''
  if (params instanceof URLSearchParams) {
    const s = params.toString()
    return s ? `?${s}` : ''
  }
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    if (Array.isArray(v)) {
      if (v.length) sp.set(k, v.join(','))
    } else if (typeof v === 'boolean') {
      if (v) sp.set(k, 'true')
    } else {
      sp.set(k, String(v))
    }
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

let unauthorizedHandler: (() => void) | null = null
/** Registered by the auth layer; invoked on any 401 (except on the login call itself). */
export function setUnauthorizedHandler(fn: (() => void) | null) {
  unauthorizedHandler = fn
}

function extractMessage(status: number, body: unknown): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const d = (body as { detail: unknown }).detail
    if (typeof d === 'string') return d
    if (Array.isArray(d)) {
      // FastAPI validation errors
      return d
        .map((e) => {
          if (e && typeof e === 'object' && 'msg' in e) {
            const loc = 'loc' in e && Array.isArray(e.loc) ? (e.loc as unknown[]).slice(1).join('.') : ''
            return loc ? `${loc}: ${String(e.msg)}` : String(e.msg)
          }
          return String(e)
        })
        .join('; ')
    }
  }
  switch (status) {
    case 400:
      return 'Requisição inválida.'
    case 401:
      return 'Sessão expirada. Faça login novamente.'
    case 403:
      return 'Acesso negado.'
    case 404:
      return 'Recurso não encontrado.'
    case 409:
      return 'Conflito: o recurso já existe.'
    case 413:
      return 'Arquivo muito grande (máx. 100 MB).'
    case 415:
      return 'Tipo de arquivo não suportado.'
    case 422:
      return 'Dados inválidos.'
    default:
      return `Erro ${status} no servidor.`
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  query?: QueryParams | URLSearchParams
  json?: unknown
  body?: BodyInit
  signal?: AbortSignal
  /** skip 401 redirect (used by login / me probe) */
  skipAuthRedirect?: boolean
  headers?: Record<string, string>
}

async function rawRequest(path: string, opts: RequestOptions = {}): Promise<Response> {
  const method = opts.method ?? 'GET'
  const headers: Record<string, string> = { Accept: 'application/json', ...(opts.headers ?? {}) }
  if (method !== 'GET') headers['X-ATC-Client'] = 'web'
  let body: BodyInit | undefined = opts.body
  if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.json)
  }
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}${buildQuery(opts.query)}`, {
      method,
      headers,
      body,
      credentials: 'include',
      signal: opts.signal,
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new ApiError(0, 'Falha de conexão com o servidor.')
  }
  if (!res.ok) {
    let parsed: unknown = undefined
    try {
      const text = await res.text()
      parsed = text ? JSON.parse(text) : undefined
    } catch {
      /* ignore */
    }
    if (res.status === 401 && !opts.skipAuthRedirect) unauthorizedHandler?.()
    throw new ApiError(res.status, extractMessage(res.status, parsed), parsed)
  }
  return res
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await rawRequest(path, opts)
  if (res.status === 204) return undefined as T
  const ct = res.headers.get('content-type') ?? ''
  if (ct.includes('application/json')) return (await res.json()) as T
  const text = await res.text()
  try {
    return JSON.parse(text) as T
  } catch {
    return text as unknown as T
  }
}

export interface BlobResult {
  blob: Blob
  filename: string | null
  contentType: string
}

export function filenameFromDisposition(cd: string | null): string | null {
  if (!cd) return null
  const star = /filename\*\s*=\s*([^']*)''([^;]+)/i.exec(cd)
  if (star) {
    try {
      return decodeURIComponent(star[2].trim().replace(/^"|"$/g, ''))
    } catch {
      /* fallthrough */
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(cd)
  return plain ? plain[1].trim() : null
}

/** Request that may return either a file (blob) or JSON. */
export async function requestBlobOrJson<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<{ kind: 'blob'; data: BlobResult } | { kind: 'json'; data: T }> {
  const res = await rawRequest(path, { ...opts, headers: { Accept: '*/*', ...(opts.headers ?? {}) } })
  const ct = res.headers.get('content-type') ?? ''
  if (ct.includes('application/json')) {
    return { kind: 'json', data: (await res.json()) as T }
  }
  const blob = await res.blob()
  return {
    kind: 'blob',
    data: { blob, filename: filenameFromDisposition(res.headers.get('content-disposition')), contentType: ct },
  }
}

/** Multipart upload with progress via XHR (fetch has no upload progress). */
export function uploadWithProgress<T>(
  path: string,
  form: FormData,
  onProgress?: (fraction: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_BASE}${path}`)
    xhr.withCredentials = true
    xhr.setRequestHeader('X-ATC-Client', 'web')
    xhr.setRequestHeader('Accept', 'application/json')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total)
    }
    xhr.onload = () => {
      let parsed: unknown = undefined
      try {
        parsed = xhr.responseText ? JSON.parse(xhr.responseText) : undefined
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(parsed as T)
      else {
        if (xhr.status === 401) unauthorizedHandler?.()
        reject(new ApiError(xhr.status, extractMessage(xhr.status, parsed), parsed))
      }
    }
    xhr.onerror = () => reject(new ApiError(0, 'Falha de conexão com o servidor.'))
    xhr.send(form)
  })
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message
  if (e instanceof Error) return e.message
  return String(e)
}
