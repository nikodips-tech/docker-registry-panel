/**
 * Runs only against a real registry: TEST_REGISTRY_URL=http://localhost:5500 npx vitest run
 * Expects the repositories seeded by dev/registry/seed.sh.
 */
import { describe, expect, it } from 'vitest'
import { createRegistryClient, RegistryError } from './registryClient'

const url = process.env.TEST_REGISTRY_URL

describe.skipIf(!url)('registryClient against a live registry', () => {
  const client = createRegistryClient({ baseUrl: url ?? 'http://unused', pageSize: 2 })

  it('pings', async () => {
    const r = await client.ping()
    expect(r.ok).toBe(true)
    expect(r.apiVersion).toBe('registry/2.0')
  })

  it('lists the catalog across pages', async () => {
    const repos = await client.listRepositories()
    expect(repos).toContain('backend/api')
    expect(repos).toContain('infra/alpine')
    expect(repos.length).toBeGreaterThan(2) // more than one page with pageSize 2
  })

  it('lists tags and resolves digests consistently via HEAD and GET', async () => {
    const tags = await client.listTags('backend/api')
    expect(tags).toEqual(expect.arrayContaining(['v1.0.0', 'latest', 'v0.9.0']))
    const head = await client.headManifest('backend/api', 'latest')
    const got = await client.getManifest('backend/api', 'latest')
    expect(head).toBe(got.digest)
    expect(head).toBe(await client.headManifest('backend/api', 'v1.0.0')) // shared digest
    expect(got.mediaType).toMatch(/manifest/)
  })

  it('reads a multi-arch index and a config blob', async () => {
    const idx = await client.getManifest('infra/alpine', '3.20')
    expect(idx.mediaType).toBe('application/vnd.oci.image.index.v1+json')
    const manifests = (idx.body as { manifests: { digest: string }[] }).manifests
    const child = await client.getManifest('infra/alpine', manifests[0]!.digest)
    const configDigest = (child.body as { config: { digest: string } }).config.digest
    const config = await client.getBlobJson<{ architecture: string, created: string }>('infra/alpine', configDigest)
    expect(config.architecture).toBeTruthy()
    expect(config.created).toMatch(/^\d{4}-/)
  })

  it('returns a typed not-found error for an unknown repository', async () => {
    const err = await client.listTags('does/not/exist').catch(e => e)
    expect(err).toBeInstanceOf(RegistryError)
    expect(err.kind).toBe('not-found')
  })
})
