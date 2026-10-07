import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  buildLayers,
  createdOf,
  detectKind,
  formatPlatform,
  ManifestParseError,
  MEDIA_TYPE,
  normalizeCommand,
  parseConfigBlob,
  parseIndex,
  parseManifest,
  pickPrimary,
  reconstructDockerfile,
} from './manifest'

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8'))

const dockerManifest = fixture('manifest-backend-api.json')
const dockerConfig = fixture('config-backend-api.json')
const ociManifest = fixture('manifest-oci-alpine-amd64.json')
const ociConfig = fixture('config-oci-alpine-amd64.json')
const ociIndex = fixture('index-infra-alpine.json')
const dockerList = fixture('manifest-list-docker.json')
const classicConfig = fixture('config-classic-docker.json')

describe('detectKind', () => {
  it('recognises manifests and indexes by media type', () => {
    expect(detectKind(dockerManifest)).toBe('image')
    expect(detectKind(ociManifest)).toBe('image')
    expect(detectKind(ociIndex)).toBe('index')
    expect(detectKind(dockerList)).toBe('index')
  })
  it('falls back to Content-Type, then to the shape', () => {
    expect(detectKind({ schemaVersion: 2, layers: [] }, MEDIA_TYPE.ociManifest)).toBe('image')
    expect(detectKind({ schemaVersion: 2, manifests: [] }, null)).toBe('index')
    expect(detectKind({ schemaVersion: 2, layers: [] }, null)).toBe('image')
    expect(() => detectKind({ schemaVersion: 1 }, 'application/vnd.docker.distribution.manifest.v1+json')).toThrow(ManifestParseError)
  })
})

describe('parseManifest: Docker v2 schema 2', () => {
  const m = parseManifest(dockerManifest)
  it('extracts config, layers and compressed size', () => {
    expect(m.kind).toBe('image')
    expect(m.mediaType).toBe(MEDIA_TYPE.dockerManifest)
    expect(m.config.digest).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(m.layers).toHaveLength(5)
    const expected = dockerManifest.layers.reduce((s: number, l: { size: number }) => s + l.size, 0) + dockerManifest.config.size
    expect(m.compressedSize).toBe(expected)
    expect(m.annotations).toEqual({})
  })
  it('rejects schema 1 and missing layers', () => {
    expect(() => parseManifest({ schemaVersion: 1 })).toThrow(/schemaVersion/)
    expect(() => parseManifest({ schemaVersion: 2, config: { digest: 'sha256:x' } })).toThrow(/layers/)
  })
})

describe('parseManifest: OCI image manifest', () => {
  const m = parseManifest(ociManifest)
  it('extracts layers and annotations', () => {
    expect(m.mediaType).toBe(MEDIA_TYPE.ociManifest)
    expect(m.layers).toHaveLength(1)
    expect(m.layers[0]!.mediaType).toBe('application/vnd.oci.image.layer.v1.tar+gzip')
    expect(m.compressedSize).toBe(3630321 + 612)
    expect(m.annotations['org.opencontainers.image.version']).toBe('3.20.10')
  })
  it('defaults the media type to OCI when the body has none', () => {
    const { mediaType: _omit, ...withoutType } = ociManifest
    expect(parseManifest(withoutType).mediaType).toBe(MEDIA_TYPE.ociManifest)
    expect(parseManifest(withoutType, MEDIA_TYPE.dockerManifest).mediaType).toBe(MEDIA_TYPE.dockerManifest)
  })
})

describe('parseIndex: OCI index (multi-arch with attestations)', () => {
  const idx = parseIndex(ociIndex)
  it('keeps runnable platforms and drops attestation manifests', () => {
    expect(idx.kind).toBe('index')
    expect(ociIndex.manifests).toHaveLength(16)
    expect(idx.manifests).toHaveLength(8)
    expect(idx.manifests.map(m => formatPlatform(m.platform))).toEqual([
      'linux/amd64', 'linux/arm/v6', 'linux/arm/v7', 'linux/arm64/v8', 'linux/386', 'linux/ppc64le', 'linux/riscv64', 'linux/s390x',
    ])
    expect(idx.manifests.every(m => m.mediaType === MEDIA_TYPE.ociManifest)).toBe(true)
    expect(idx.manifests[0]!.annotations?.['org.opencontainers.image.created']).toBe('2026-04-16T23:53:23Z')
  })
})

describe('parseIndex: Docker manifest list', () => {
  const idx = parseIndex(dockerList)
  it('extracts platforms including variant and os.version', () => {
    expect(idx.mediaType).toBe(MEDIA_TYPE.dockerList)
    expect(idx.manifests).toHaveLength(3)
    expect(idx.manifests.map(m => formatPlatform(m.platform))).toEqual(['linux/amd64', 'linux/arm64/v8', 'windows/amd64'])
    expect(idx.manifests[2]!.platform?.osVersion).toBe('10.0.20348.2113')
    expect(idx.manifests[1]!.size).toBe(528)
  })
  it('rejects an index without manifests', () => {
    expect(() => parseIndex({ schemaVersion: 2, mediaType: MEDIA_TYPE.dockerList })).toThrow(ManifestParseError)
  })
})

describe('parseConfigBlob', () => {
  it('reads created, platform, labels, config and history (BuildKit)', () => {
    const c = parseConfigBlob(dockerConfig)
    expect(c.created).toBe('2026-10-07T15:15:58.939961315Z')
    expect(c.architecture).toBe('amd64')
    expect(c.os).toBe('linux')
    expect(c.labels['org.opencontainers.image.version']).toBe('1.0.0')
    expect(c.config.entrypoint).toEqual(['/bin/sh', '/app/api'])
    expect(c.config.exposedPorts).toEqual(['8080/tcp'])
    expect(c.config.workingDir).toBe('/app')
    expect(c.config.env).toContain('APP_ENV=production')
    expect(c.history).toHaveLength(13)
    expect(c.history.filter(h => !h.emptyLayer)).toHaveLength(5)
  })
  it('reads a classic docker builder config', () => {
    const c = parseConfigBlob(classicConfig)
    expect(c.config.user).toBe('node')
    expect(c.config.cmd).toEqual(['node', 'server.js'])
    expect(c.config.exposedPorts).toEqual(['3000/tcp', '9229/tcp'])
    expect(c.labels).toEqual({ maintainer: 'team@example.com' })
  })
  it('tolerates a minimal config', () => {
    const c = parseConfigBlob({ architecture: 'arm64', os: 'linux' })
    expect(c.created).toBeNull()
    expect(c.history).toEqual([])
    expect(c.config.cmd).toBeNull()
    expect(c.labels).toEqual({})
  })
})

describe('normalizeCommand', () => {
  it('handles classic builder forms', () => {
    expect(normalizeCommand('/bin/sh -c #(nop)  CMD ["/bin/sh"]')).toBe('CMD ["/bin/sh"]')
    expect(normalizeCommand('/bin/sh -c #(nop) WORKDIR /srv')).toBe('WORKDIR /srv')
    expect(normalizeCommand('/bin/sh -c apk add --no-cache nodejs')).toBe('RUN apk add --no-cache nodejs')
  })
  it('handles BuildKit forms', () => {
    expect(normalizeCommand('RUN |3 VERSION=1.0.0 REVISION=a1b2c3d EXTRA= /bin/sh -c apk add --no-cache ca-certificates tzdata # buildkit'))
      .toBe('RUN apk add --no-cache ca-certificates tzdata')
    expect(normalizeCommand('RUN /bin/sh -c echo hi # buildkit')).toBe('RUN echo hi')
    expect(normalizeCommand('COPY seed.sh /app/api # buildkit')).toBe('COPY seed.sh /app/api')
    expect(normalizeCommand('ENV APP_ENV=production')).toBe('ENV APP_ENV=production')
    expect(normalizeCommand('ADD alpine-minirootfs-3.20.10-x86_64.tar.gz / # buildkit')).toBe('ADD alpine-minirootfs-3.20.10-x86_64.tar.gz /')
  })
})

describe('buildLayers', () => {
  it('aligns BuildKit history with manifest layers', () => {
    const layers = buildLayers(parseManifest(dockerManifest), parseConfigBlob(dockerConfig))
    expect(layers).toHaveLength(13)
    const withBlob = layers.filter(l => l.digest)
    expect(withBlob).toHaveLength(5)
    expect(withBlob.map(l => l.digest)).toEqual(dockerManifest.layers.map((l: { digest: string }) => l.digest))
    expect(layers[0]!.command).toBe('ADD alpine-minirootfs-3.20.10-x86_64.tar.gz /')
    expect(layers[1]).toMatchObject({ command: 'CMD ["/bin/sh"]', emptyLayer: true, size: 0, digest: null })
    const run = layers.find(l => l.command.startsWith('RUN apk add'))!
    expect(run.size).toBe(dockerManifest.layers[1].size)
    expect(layers.at(-1)!.command).toBe('ENTRYPOINT ["/bin/sh" "/app/api"]')
  })
  it('aligns classic history with manifest layers', () => {
    const manifest = parseManifest({
      schemaVersion: 2,
      mediaType: MEDIA_TYPE.dockerManifest,
      config: { mediaType: 'application/vnd.docker.container.image.v1+json', size: 10, digest: 'sha256:c' },
      layers: [
        { mediaType: 'application/vnd.docker.image.rootfs.diff.tar.gzip', size: 100, digest: 'sha256:1' },
        { mediaType: 'application/vnd.docker.image.rootfs.diff.tar.gzip', size: 200, digest: 'sha256:2' },
        { mediaType: 'application/vnd.docker.image.rootfs.diff.tar.gzip', size: 300, digest: 'sha256:3' },
      ],
    })
    const layers = buildLayers(manifest, parseConfigBlob(classicConfig))
    expect(layers.map(l => [l.command, l.size])).toEqual([
      ['ADD file:abc123 in /', 100],
      ['CMD ["/bin/sh"]', 0],
      ['RUN apk add --no-cache nodejs', 200],
      ['WORKDIR /srv', 0],
      ['COPY dir:def456 in /srv', 300],
      ['CMD ["node" "server.js"]', 0],
    ])
  })
  it('falls back to one entry per layer when there is no history', () => {
    const layers = buildLayers(parseManifest(ociManifest), parseConfigBlob({ created: '2024-01-01T00:00:00Z' }))
    expect(layers).toHaveLength(1)
    expect(layers[0]).toMatchObject({ digest: ociManifest.layers[0].digest, size: 3630321, command: '', created: '2024-01-01T00:00:00Z' })
  })
})

describe('reconstructDockerfile', () => {
  it('joins normalized history commands', () => {
    const df = reconstructDockerfile(parseConfigBlob(ociConfig))
    expect(df).toBe('ADD alpine-minirootfs-3.20.10-x86_64.tar.gz /\nCMD ["/bin/sh"]')
  })
})

describe('createdOf and pickPrimary', () => {
  it('prefers the config created, then the annotation', () => {
    expect(createdOf(parseConfigBlob(ociConfig), ociManifest.annotations)).toBe('2026-04-16T23:53:26.803599608Z')
    expect(createdOf(parseConfigBlob({}), ociManifest.annotations)).toBe('2026-04-16T23:53:23Z')
    expect(createdOf(null, {}, { 'org.opencontainers.image.created': '2020-01-01T00:00:00Z' })).toBe('2020-01-01T00:00:00Z')
    expect(createdOf(null)).toBeNull()
  })
  it('picks linux/amd64 when available', () => {
    expect(pickPrimary([{ platform: 'linux/arm64/v8' }, { platform: 'linux/amd64' }])!.platform).toBe('linux/amd64')
    expect(pickPrimary([{ platform: 'linux/arm64/v8' }])!.platform).toBe('linux/arm64/v8')
    expect(pickPrimary([])).toBeUndefined()
  })
})
