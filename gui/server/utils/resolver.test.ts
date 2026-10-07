import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearCache } from './cache'
import { resolveReference, resolveTagDetail, resolveTags, tagsPointingAt } from './resolver'
import { RegistryError, sha256Hex, type ManifestResponse, type RegistryClient } from './registryClient'

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8'))

const dockerManifest = fixture('manifest-backend-api.json')
const dockerConfig = fixture('config-backend-api.json')
const ociIndex = fixture('index-infra-alpine.json')
const ociChild = fixture('manifest-oci-alpine-amd64.json')
const ociConfig = fixture('config-oci-alpine-amd64.json')

const D_DOCKER = sha256Hex(JSON.stringify(dockerManifest))
const D_INDEX = sha256Hex(JSON.stringify(ociIndex))
const D_CHILD_AMD64 = ociIndex.manifests[0].digest as string

/** A fake registry with two repositories. Every child of the index resolves to the amd64 child. */
function fakeClient() {
  const tags: Record<string, Record<string, string>> = {
    'backend/api': { 'v1.0.0': D_DOCKER, 'latest': D_DOCKER },
    'infra/alpine': { '3.20': D_INDEX },
  }
  const manifests: Record<string, ManifestResponse> = {
    [D_DOCKER]: { digest: D_DOCKER, mediaType: dockerManifest.mediaType, size: 1, body: dockerManifest },
    [D_INDEX]: { digest: D_INDEX, mediaType: ociIndex.mediaType, size: 1, body: ociIndex },
  }
  for (const m of ociIndex.manifests) manifests[m.digest] = { digest: m.digest, mediaType: ociChild.mediaType, size: 1, body: ociChild }
  const blobs: Record<string, unknown> = {
    [dockerManifest.config.digest]: dockerConfig,
    [ociChild.config.digest]: ociConfig,
  }
  const calls = { manifests: 0, blobs: 0, heads: 0 }
  const client: RegistryClient = {
    baseUrl: 'http://fake',
    ping: async () => ({ ok: true, apiVersion: 'registry/2.0' }),
    listRepositories: async () => Object.keys(tags),
    listTags: async name => Object.keys(tags[name] ?? {}),
    headManifest: async (name, ref) => {
      calls.heads++
      const d = tags[name]?.[ref] ?? (manifests[ref] ? ref : undefined)
      if (!d) throw new RegistryError('not-found', 'nope', { status: 404, method: 'HEAD', url: ref })
      return d
    },
    getManifest: async (name, ref) => {
      calls.manifests++
      const d = tags[name]?.[ref] ?? ref
      const m = manifests[d]
      if (!m) throw new RegistryError('not-found', 'nope', { status: 404, method: 'GET', url: ref })
      return m
    },
    getBlobJson: async <T>(_name: string, digest: string) => {
      calls.blobs++
      if (!(digest in blobs)) throw new RegistryError('not-found', 'nope', { status: 404, method: 'GET', url: digest })
      return blobs[digest] as T
    },
    deleteManifest: vi.fn(async () => {}),
  }
  return { client, calls }
}

afterEach(() => clearCache())

describe('resolveReference', () => {
  it('resolves a plain manifest into one platform image', async () => {
    const { client } = fakeClient()
    const r = await resolveReference(client, 'backend/api', 'latest', false)
    expect(r.kind).toBe('image')
    expect(r.digest).toBe(D_DOCKER)
    expect(r.platforms).toEqual(['linux/amd64'])
    expect(r.images[0]!.created).toBe('2026-10-07T15:15:58.939961315Z')
    expect(r.images[0]!.labels['org.opencontainers.image.version']).toBe('1.0.0')
    expect(r.images[0]!.layers.filter(l => l.digest)).toHaveLength(5)
    expect(r.images[0]!.dockerfile).toContain('RUN apk add --no-cache ca-certificates tzdata')
  })

  it('resolves only the primary platform of an index unless full', async () => {
    const { client, calls } = fakeClient()
    const row = await resolveReference(client, 'infra/alpine', D_INDEX, false)
    expect(row.kind).toBe('index')
    expect(row.platforms).toHaveLength(8)
    expect(row.images).toHaveLength(1)
    expect(row.images[0]!.platform).toBe('linux/amd64')
    expect(row.images[0]!.digest).toBe(D_CHILD_AMD64)
    expect(calls.manifests).toBe(2) // index + amd64 child

    const full = await resolveReference(client, 'infra/alpine', D_INDEX, true)
    expect(full.images).toHaveLength(8)
    expect(full.images.map(i => i.platform)).toContain('linux/arm64/v8')
    // index and amd64 child came from the cache; 7 other children fetched
    expect(calls.manifests).toBe(9)
  })

  it('caches manifests and config blobs by digest', async () => {
    const { client, calls } = fakeClient()
    await resolveReference(client, 'backend/api', D_DOCKER, false)
    await resolveReference(client, 'backend/api', D_DOCKER, false)
    expect(calls.manifests).toBe(1)
    expect(calls.blobs).toBe(1)
  })
})

describe('resolveTags', () => {
  it('builds the table, newest first, and caches it per repository', async () => {
    const { client, calls } = fakeClient()
    const t = await resolveTags(client, 'backend/api', 60)
    expect(t.tags.map(r => r.tag)).toEqual(['latest', 'v1.0.0'])
    expect(t.tags[0]!.digest).toBe(D_DOCKER)
    expect(t.uniqueDigests).toBe(1)
    expect(t.compressedSize).toBe(dockerManifest.layers.reduce((s: number, l: { size: number }) => s + l.size, 0))
    expect(t.tags[0]!.size).toBe(t.compressedSize + dockerManifest.config.size)
    const headsAfterFirst = calls.heads
    await resolveTags(client, 'backend/api', 60)
    expect(calls.heads).toBe(headsAfterFirst)
    await resolveTags(client, 'backend/api', 60, true)
    expect(calls.heads).toBe(headsAfterFirst + 2)
  })
})

describe('resolveTagDetail', () => {
  it('lists the other tags sharing the digest', async () => {
    const { client } = fakeClient()
    const d = await resolveTagDetail(client, 'backend/api', 'v1.0.0', 60)
    expect(d.sharedWith).toEqual(['latest'])
    expect(d.images).toHaveLength(1)
    expect(d.images[0]!.config.entrypoint).toEqual(['/bin/sh', '/app/api'])
  })
  it('propagates not-found for an unknown tag', async () => {
    const { client } = fakeClient()
    await expect(resolveTagDetail(client, 'backend/api', 'nope', 60)).rejects.toMatchObject({ kind: 'not-found' })
  })
})

describe('tagsPointingAt', () => {
  it('returns every tag of the repository with that digest', async () => {
    const { client } = fakeClient()
    expect((await tagsPointingAt(client, 'backend/api', D_DOCKER)).sort()).toEqual(['latest', 'v1.0.0'])
    expect(await tagsPointingAt(client, 'infra/alpine', D_DOCKER)).toEqual([])
  })
})
