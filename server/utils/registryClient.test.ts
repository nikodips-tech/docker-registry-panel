import { describe, expect, it, vi } from 'vitest'
import { createRegistryClient, MANIFEST_ACCEPT, parseBearerChallenge, parseNextLink, RegistryError, sha256Hex } from './registryClient'

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>

/** Build a fetch mock from a map of "METHOD /path" -> handler (or static Response). */
function mockFetch(routes: Record<string, Handler | Response>) {
  const calls: { method: string, url: string, headers: Record<string, string> }[] = []
  const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method ?? 'GET').toUpperCase()
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]))
    calls.push({ method, url, headers })
    const path = url.replace(/^https?:\/\/[^/]+/, '')
    const route = routes[`${method} ${path}`] ?? routes[`${method} ${url}`]
    if (!route) return new Response('not mocked: ' + method + ' ' + url, { status: 599 })
    return typeof route === 'function' ? route(url, init ?? {}) : route.clone()
  })
  return { fetchFn: fetchFn as unknown as typeof fetch, calls }
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, ...init, headers: { 'content-type': 'application/json', ...(init.headers as Record<string, string>) } })

describe('parseNextLink', () => {
  it('extracts the rel="next" URL', () => {
    expect(parseNextLink('</v2/_catalog?last=backend%2Fapi&n=2>; rel="next"')).toBe('/v2/_catalog?last=backend%2Fapi&n=2')
  })
  it('ignores other rels and missing header', () => {
    expect(parseNextLink('</v2/_catalog?n=2>; rel="prev"')).toBeNull()
    expect(parseNextLink(null)).toBeNull()
  })
  it('handles multiple links', () => {
    expect(parseNextLink('</a>; rel="prev", </b>; rel="next"')).toBe('/b')
  })
})

describe('parseBearerChallenge', () => {
  it('parses realm, service and scope', () => {
    expect(parseBearerChallenge('Bearer realm="https://auth.example.com/token",service="registry",scope="repository:a/b:pull"'))
      .toEqual({ realm: 'https://auth.example.com/token', service: 'registry', scope: 'repository:a/b:pull' })
  })
  it('returns null for Basic challenges', () => {
    expect(parseBearerChallenge('Basic realm="Registry"')).toBeNull()
  })
})

describe('createRegistryClient', () => {
  it('rejects a base URL without scheme', () => {
    expect(() => createRegistryClient({ baseUrl: 'registry.example.com' })).toThrow(TypeError)
  })

  it('sends basic auth and the Accept header for manifests', async () => {
    const body = { schemaVersion: 2, mediaType: 'application/vnd.docker.distribution.manifest.v2+json', config: {}, layers: [] }
    const { fetchFn, calls } = mockFetch({
      'GET /v2/backend/api/manifests/latest': json(body, { headers: { 'content-type': body.mediaType } }),
    })
    const client = createRegistryClient({ baseUrl: 'https://r.example.com/', username: 'u', password: 'p', fetch: fetchFn })
    const m = await client.getManifest('backend/api', 'latest')
    expect(calls[0]!.headers.authorization).toBe('Basic ' + Buffer.from('u:p').toString('base64'))
    expect(calls[0]!.headers.accept).toBe(MANIFEST_ACCEPT)
    expect(m.mediaType).toBe(body.mediaType)
    expect(m.body).toEqual(body)
    // no Docker-Content-Digest header: digest computed over the raw body
    expect(m.digest).toBe(sha256Hex(JSON.stringify(body)))
  })

  it('prefers the Docker-Content-Digest header', async () => {
    const { fetchFn } = mockFetch({
      'GET /v2/a/manifests/t': json({ schemaVersion: 2 }, { headers: { 'docker-content-digest': 'sha256:' + 'a'.repeat(64) } }),
      'HEAD /v2/a/manifests/t': new Response(null, { headers: { 'docker-content-digest': 'sha256:' + 'b'.repeat(64) } }),
    })
    const client = createRegistryClient({ baseUrl: 'http://r', fetch: fetchFn })
    expect((await client.getManifest('a', 't')).digest).toBe('sha256:' + 'a'.repeat(64))
    expect(await client.headManifest('a', 't')).toBe('sha256:' + 'b'.repeat(64))
  })

  it('follows Link pagination for the catalog and tags', async () => {
    const { fetchFn, calls } = mockFetch({
      'GET /v2/_catalog?n=2': json({ repositories: ['alpine', 'backend/api'] }, { headers: { link: '</v2/_catalog?last=backend%2Fapi&n=2>; rel="next"' } }),
      'GET /v2/_catalog?last=backend%2Fapi&n=2': json({ repositories: ['busybox'] }),
      'GET /v2/backend/api/tags/list?n=2': json({ name: 'backend/api', tags: ['v1', 'v2'] }, { headers: { link: '</v2/backend/api/tags/list?last=v2&n=2>; rel="next"' } }),
      'GET /v2/backend/api/tags/list?last=v2&n=2': json({ name: 'backend/api', tags: ['v3'] }),
      'GET /v2/empty/tags/list?n=2': json({ name: 'empty', tags: null }),
    })
    const client = createRegistryClient({ baseUrl: 'http://r', pageSize: 2, fetch: fetchFn })
    expect(await client.listRepositories()).toEqual(['alpine', 'backend/api', 'busybox'])
    expect(await client.listTags('backend/api')).toEqual(['v1', 'v2', 'v3'])
    expect(await client.listTags('empty')).toEqual([])
    expect(calls.map(c => c.url)).toContain('http://r/v2/_catalog?last=backend%2Fapi&n=2')
  })

  it('maps 401 / 404 / 405 / 5xx to typed errors with registry error codes', async () => {
    const { fetchFn } = mockFetch({
      'GET /v2/': new Response('', { status: 401, headers: { 'www-authenticate': 'Basic realm="Registry"' } }),
      'GET /v2/missing/tags/list?n=100': json({ errors: [{ code: 'NAME_UNKNOWN', message: 'repository name not known to registry' }] }, { status: 404 }),
      'DELETE /v2/a/manifests/sha256:0000000000000000000000000000000000000000000000000000000000000000': json({ errors: [{ code: 'UNSUPPORTED', message: 'The operation is unsupported.' }] }, { status: 405 }),
      'GET /v2/_catalog?n=100': new Response('oops', { status: 502 }),
    })
    const client = createRegistryClient({ baseUrl: 'http://r', fetch: fetchFn })

    const e401 = await client.ping().catch(e => e)
    expect(e401).toBeInstanceOf(RegistryError)
    expect(e401.kind).toBe('unauthorized')
    expect(e401.status).toBe(401)

    const e404 = await client.listTags('missing').catch(e => e)
    expect(e404.kind).toBe('not-found')
    expect(e404.errors[0].code).toBe('NAME_UNKNOWN')
    expect(e404.httpStatus).toBe(404)

    const e405 = await client.deleteManifest('a', 'sha256:' + '0'.repeat(64)).catch(e => e)
    expect(e405.kind).toBe('unsupported')

    const e5xx = await client.listRepositories().catch(e => e)
    expect(e5xx.kind).toBe('server')
    expect(e5xx.httpStatus).toBe(502)
  })

  it('maps fetch failures to a network error', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('fetch failed')
    }) as unknown as typeof fetch
    const client = createRegistryClient({ baseUrl: 'http://r', fetch: fetchFn })
    const err = await client.ping().catch(e => e)
    expect(err.kind).toBe('network')
    expect(err.httpStatus).toBe(503)
  })

  it('answers a Bearer challenge with a token and caches it', async () => {
    let tokenRequests = 0
    const { fetchFn, calls } = mockFetch({
      'GET /v2/': (_url, init) => {
        const auth = (init.headers as Record<string, string>).Authorization
        if (auth === 'Bearer tok123') return new Response('{}', { status: 200 })
        return new Response('', { status: 401, headers: { 'www-authenticate': 'Bearer realm="https://auth.example.com/token",service="reg"' } })
      },
      'GET https://auth.example.com/token?service=reg': () => {
        tokenRequests++
        return json({ token: 'tok123', expires_in: 300 })
      },
    })
    const client = createRegistryClient({ baseUrl: 'http://r', username: 'u', password: 'p', fetch: fetchFn })
    await client.ping()
    await client.ping()
    expect(tokenRequests).toBe(1)
    const tokenCall = calls.find(c => c.url.startsWith('https://auth.example.com'))!
    expect(tokenCall.headers.authorization).toMatch(/^Basic /)
  })

  it('refuses invalid names, references and digests before hitting the network', async () => {
    const { fetchFn, calls } = mockFetch({})
    const client = createRegistryClient({ baseUrl: 'http://r', fetch: fetchFn })
    await expect(client.listTags('../etc')).rejects.toThrow(TypeError)
    await expect(client.getManifest('a', 'bad tag')).rejects.toThrow(TypeError)
    await expect(client.deleteManifest('a', 'latest')).rejects.toThrow(TypeError)
    expect(calls).toHaveLength(0)
  })
})
