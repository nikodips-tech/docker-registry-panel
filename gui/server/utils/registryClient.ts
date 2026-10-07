/**
 * HTTP client for a Docker Registry / OCI Distribution API (v2).
 * Written from the OCI Distribution Specification and the Docker Registry HTTP API v2 docs.
 *
 * - Basic auth from configuration, with support for the Bearer token challenge
 *   (`WWW-Authenticate: Bearer realm=...`) used by token-based registries.
 * - `Accept` header with the OCI and Docker v2 manifest media types.
 * - Pagination of `_catalog` and `tags/list` via the `Link` header (rel="next").
 * - 401 / 403 / 404 / 405 / 5xx mapped to typed `RegistryError`s.
 */
import { createHash } from 'node:crypto'
import { isValidDigest, isValidReference, isValidRepositoryName } from '../../shared/utils/validate'

export const MANIFEST_MEDIA_TYPES = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.docker.distribution.manifest.v2+json',
] as const

export const MANIFEST_ACCEPT = MANIFEST_MEDIA_TYPES.join(', ')

export type RegistryErrorKind
  = | 'unauthorized' // 401: credentials missing or rejected
    | 'forbidden' // 403: authenticated but not allowed
    | 'not-found' // 404: repository, manifest or blob unknown
    | 'unsupported' // 405: e.g. DELETE while REGISTRY_STORAGE_DELETE_ENABLED is false
    | 'server' // 5xx
    | 'network' // DNS, connection refused, timeout
    | 'unexpected' // anything else (bad JSON, other 4xx)

export interface RegistryErrorDetail {
  code: string
  message: string
  detail?: unknown
}

export class RegistryError extends Error {
  readonly kind: RegistryErrorKind
  readonly status: number | undefined
  readonly method: string
  readonly url: string
  readonly errors: RegistryErrorDetail[]

  constructor(
    kind: RegistryErrorKind,
    message: string,
    info: { status?: number, method: string, url: string, errors?: RegistryErrorDetail[], cause?: unknown },
  ) {
    super(message, { cause: info.cause })
    this.name = 'RegistryError'
    this.kind = kind
    this.status = info.status
    this.method = info.method
    this.url = info.url
    this.errors = info.errors ?? []
  }

  /** HTTP status to use when surfacing this error from our own API. */
  get httpStatus(): number {
    switch (this.kind) {
      case 'not-found': return 404
      case 'unsupported': return 405
      case 'network': return 503
      default: return 502
    }
  }
}

export interface RegistryClientOptions {
  /** e.g. https://registry.example.com (no trailing /v2) */
  baseUrl: string
  username?: string
  password?: string
  /** Page size for `_catalog` and `tags/list`. Default 100. */
  pageSize?: number
  /** Injectable for tests. Defaults to globalThis.fetch. */
  fetch?: typeof fetch
  /** Per-request timeout in ms. Default 30 000. */
  timeoutMs?: number
}

export interface ManifestResponse {
  /** Canonical digest (from `Docker-Content-Digest`, else computed over the raw body). */
  digest: string
  /** Media type from the body's `mediaType`, falling back to Content-Type. */
  mediaType: string
  /** Size of the raw manifest in bytes. */
  size: number
  body: unknown
}

export interface PingResult {
  ok: true
  /** Value of the `Docker-Distribution-API-Version` header, if present. */
  apiVersion: string | null
}

export interface RegistryClient {
  readonly baseUrl: string
  ping(): Promise<PingResult>
  listRepositories(): Promise<string[]>
  listTags(name: string): Promise<string[]>
  headManifest(name: string, reference: string): Promise<string>
  getManifest(name: string, reference: string): Promise<ManifestResponse>
  getBlobJson<T = unknown>(name: string, digest: string): Promise<T>
  deleteManifest(name: string, digest: string): Promise<void>
}

interface BearerChallenge {
  realm: string
  service?: string
  scope?: string
}

/** Parse `Link: </v2/_catalog?last=x&n=100>; rel="next"` and return the next URL, if any. */
export function parseNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null
  for (const part of linkHeader.split(',')) {
    const m = part.match(/<([^>]+)>\s*;(.*)/)
    if (!m) continue
    const params = m[2]!
    if (/rel\s*=\s*"?next"?/i.test(params)) return m[1]!
  }
  return null
}

/** Parse a `WWW-Authenticate: Bearer realm="...",service="...",scope="..."` challenge. */
export function parseBearerChallenge(header: string | null): BearerChallenge | null {
  if (!header) return null
  const m = header.match(/^\s*Bearer\s+(.*)$/i)
  if (!m) return null
  const out: Record<string, string> = {}
  for (const kv of m[1]!.matchAll(/(\w+)="([^"]*)"/g)) out[kv[1]!] = kv[2]!
  if (!out.realm) return null
  return { realm: out.realm, service: out.service, scope: out.scope }
}

export function sha256Hex(data: Uint8Array | string): string {
  return 'sha256:' + createHash('sha256').update(data).digest('hex')
}

function assertName(name: string): void {
  if (!isValidRepositoryName(name)) throw new TypeError(`Invalid repository name: ${JSON.stringify(name)}`)
}

function assertReference(ref: string): void {
  if (!isValidReference(ref)) throw new TypeError(`Invalid manifest reference: ${JSON.stringify(ref)}`)
}

function assertDigest(digest: string): void {
  if (!isValidDigest(digest)) throw new TypeError(`Invalid digest: ${JSON.stringify(digest)}`)
}

export function createRegistryClient(options: RegistryClientOptions): RegistryClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, '')
  if (!/^https?:\/\//.test(baseUrl)) {
    throw new TypeError(`REGISTRY_URL must start with http:// or https:// (got ${JSON.stringify(options.baseUrl)})`)
  }
  const doFetch = options.fetch ?? globalThis.fetch
  const pageSize = options.pageSize ?? 100
  const timeoutMs = options.timeoutMs ?? 30_000
  const basicAuth = options.username
    ? 'Basic ' + Buffer.from(`${options.username}:${options.password ?? ''}`).toString('base64')
    : null

  // Bearer tokens obtained from a token server, keyed by scope.
  const tokens = new Map<string, { token: string, expiresAt: number }>()

  function resolve(path: string): string {
    return path.startsWith('http://') || path.startsWith('https://') ? path : baseUrl + path
  }

  async function readErrors(res: Response): Promise<RegistryErrorDetail[]> {
    try {
      const json = JSON.parse(await res.text()) as { errors?: RegistryErrorDetail[] }
      return Array.isArray(json.errors) ? json.errors : []
    }
    catch {
      return []
    }
  }

  async function toError(method: string, url: string, res: Response): Promise<RegistryError> {
    const errors = await readErrors(res)
    const summary = errors.map(e => `${e.code}: ${e.message}`).join('; ')
    const msg = (what: string) => `${what} (${method} ${url} -> ${res.status}${summary ? `, ${summary}` : ''})`
    const info = { status: res.status, method, url, errors }
    if (res.status === 401) return new RegistryError('unauthorized', msg('Registry rejected the credentials'), info)
    if (res.status === 403) return new RegistryError('forbidden', msg('Registry denied access'), info)
    if (res.status === 404) return new RegistryError('not-found', msg('Not found on the registry'), info)
    if (res.status === 405) return new RegistryError('unsupported', msg('Operation not supported by the registry'), info)
    if (res.status >= 500) return new RegistryError('server', msg('Registry error'), info)
    return new RegistryError('unexpected', msg('Unexpected registry response'), info)
  }

  async function fetchToken(challenge: BearerChallenge, method: string, url: string): Promise<string> {
    const scopeKey = challenge.scope ?? ''
    const cached = tokens.get(scopeKey)
    if (cached && cached.expiresAt > Date.now()) return cached.token

    const tokenUrl = new URL(challenge.realm)
    if (challenge.service) tokenUrl.searchParams.set('service', challenge.service)
    if (challenge.scope) tokenUrl.searchParams.set('scope', challenge.scope)
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (basicAuth) headers.Authorization = basicAuth

    let res: Response
    try {
      res = await doFetch(tokenUrl, { headers, signal: AbortSignal.timeout(timeoutMs) })
    }
    catch (cause) {
      throw new RegistryError('network', `Cannot reach token server ${tokenUrl.origin}`, { method, url, cause })
    }
    if (!res.ok) {
      throw new RegistryError('unauthorized', `Token server rejected the credentials (${res.status})`, { status: res.status, method, url })
    }
    const data = await res.json() as { token?: string, access_token?: string, expires_in?: number }
    const token = data.token ?? data.access_token
    if (!token) throw new RegistryError('unexpected', 'Token server returned no token', { status: res.status, method, url })
    const ttl = Math.max(0, (data.expires_in ?? 60) - 5) * 1000
    tokens.set(scopeKey, { token, expiresAt: Date.now() + ttl })
    return token
  }

  /** Perform a request; on a Bearer challenge, fetch a token and retry once. */
  async function request(method: string, path: string, headers: Record<string, string> = {}): Promise<Response> {
    const url = resolve(path)
    const send = async (auth: string | null): Promise<Response> => {
      const h: Record<string, string> = { ...headers }
      if (auth) h.Authorization = auth
      try {
        return await doFetch(url, { method, headers: h, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) })
      }
      catch (cause) {
        throw new RegistryError('network', `Cannot reach registry at ${baseUrl}`, { method, url, cause })
      }
    }

    let res = await send(basicAuth)
    if (res.status === 401) {
      const challenge = parseBearerChallenge(res.headers.get('www-authenticate'))
      if (challenge) {
        await res.arrayBuffer().catch(() => undefined) // drain
        const token = await fetchToken(challenge, method, url)
        res = await send(`Bearer ${token}`)
      }
    }
    if (!res.ok) throw await toError(method, url, res)
    return res
  }

  async function requestJson<T>(method: string, path: string, headers?: Record<string, string>): Promise<{ res: Response, body: T }> {
    const res = await request(method, path, { Accept: 'application/json', ...headers })
    const text = await res.text()
    try {
      return { res, body: JSON.parse(text) as T }
    }
    catch (cause) {
      const url = resolve(path)
      throw new RegistryError('unexpected', `Registry returned invalid JSON (${method} ${url})`, { status: res.status, method, url, cause })
    }
  }

  /** Follow `Link: rel="next"` pages, collecting `pick(body)` from each. */
  async function paginate<T, R>(firstPath: string, pick: (body: T) => R[] | null | undefined): Promise<R[]> {
    const out: R[] = []
    const seen = new Set<string>()
    let path: string | null = firstPath
    while (path && !seen.has(path)) {
      seen.add(path)
      const { res, body } = await requestJson<T>('GET', path)
      out.push(...(pick(body) ?? []))
      path = parseNextLink(res.headers.get('link'))
    }
    return out
  }

  const client: RegistryClient = {
    baseUrl,

    async ping() {
      const res = await request('GET', '/v2/')
      await res.arrayBuffer().catch(() => undefined)
      return { ok: true, apiVersion: res.headers.get('docker-distribution-api-version') }
    },

    async listRepositories() {
      return paginate<{ repositories?: string[] | null }, string>(`/v2/_catalog?n=${pageSize}`, b => b.repositories)
    },

    async listTags(name) {
      assertName(name)
      return paginate<{ tags?: string[] | null }, string>(`/v2/${name}/tags/list?n=${pageSize}`, b => b.tags)
    },

    async headManifest(name, reference) {
      assertName(name)
      assertReference(reference)
      const res = await request('HEAD', `/v2/${name}/manifests/${reference}`, { Accept: MANIFEST_ACCEPT })
      await res.arrayBuffer().catch(() => undefined)
      const digest = res.headers.get('docker-content-digest')
      // Some registries omit the header on HEAD: fall back to a GET, which can compute it.
      return digest ?? (await client.getManifest(name, reference)).digest
    },

    async getManifest(name, reference) {
      assertName(name)
      assertReference(reference)
      const path = `/v2/${name}/manifests/${reference}`
      const res = await request('GET', path, { Accept: MANIFEST_ACCEPT })
      const raw = new Uint8Array(await res.arrayBuffer())
      let body: unknown
      try {
        body = JSON.parse(Buffer.from(raw).toString('utf8'))
      }
      catch (cause) {
        const url = resolve(path)
        throw new RegistryError('unexpected', `Manifest is not valid JSON (${url})`, { status: res.status, method: 'GET', url, cause })
      }
      const digest = res.headers.get('docker-content-digest') ?? sha256Hex(raw)
      const contentType = res.headers.get('content-type')?.split(';')[0]?.trim()
      const bodyType = typeof body === 'object' && body !== null && typeof (body as { mediaType?: unknown }).mediaType === 'string'
        ? (body as { mediaType: string }).mediaType
        : undefined
      return { digest, mediaType: bodyType ?? contentType ?? 'application/octet-stream', size: raw.byteLength, body }
    },

    async getBlobJson<T>(name: string, digest: string) {
      assertName(name)
      assertDigest(digest)
      const { body } = await requestJson<T>('GET', `/v2/${name}/blobs/${digest}`)
      return body
    },

    async deleteManifest(name, digest) {
      assertName(name)
      assertDigest(digest)
      const res = await request('DELETE', `/v2/${name}/manifests/${digest}`)
      await res.arrayBuffer().catch(() => undefined)
    },
  }
  return client
}
