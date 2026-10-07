/**
 * Turns registry content into what the API returns, with caching:
 * raw manifests and config blobs are cached by digest (immutable), the resolved tag
 * table per repository is cached with a TTL.
 */
import type { PlatformImage, TagDetail, TagRow, TagsResponse } from '../../shared/types/registry'
import { getBlob, getImageCache, setBlob, setImageCache } from './cache'
import { pLimit } from './concurrency'
import {
  buildLayers,
  createdOf,
  detectKind,
  formatPlatform,
  parseConfigBlob,
  parseIndex,
  parseManifest,
  pickPrimary,
  reconstructDockerfile,
  type ParsedConfig,
  type ParsedManifest,
} from './manifest'
import type { RegistryClient } from './registryClient'
import { RegistryError } from './registryClient'

/** Raw manifest or index as cached: body plus the metadata the registry sent with it. */
interface CachedManifest {
  digest: string
  mediaType: string
  size: number
  body: unknown
}

const MANIFEST_CONCURRENCY = 6
const CHILD_CONCURRENCY = 4

async function fetchManifest(client: RegistryClient, name: string, reference: string): Promise<CachedManifest> {
  if (reference.includes(':')) {
    const cached = await getBlob<CachedManifest>(reference)
    if (cached) return cached
  }
  const m = await client.getManifest(name, reference)
  const entry: CachedManifest = { digest: m.digest, mediaType: m.mediaType, size: m.size, body: m.body }
  await setBlob(m.digest, entry)
  return entry
}

async function fetchConfig(client: RegistryClient, name: string, digest: string): Promise<ParsedConfig | null> {
  const cached = await getBlob<Record<string, unknown>>(digest)
  if (cached) return parseConfigBlob(cached)
  try {
    const body = await client.getBlobJson<Record<string, unknown>>(name, digest)
    await setBlob(digest, body)
    return parseConfigBlob(body)
  }
  catch (err) {
    // A missing or malformed config blob should not hide the tag: degrade gracefully.
    if (err instanceof RegistryError && err.kind === 'not-found') return null
    throw err
  }
}

function toPlatformImage(platform: string, digest: string, manifest: ParsedManifest, config: ParsedConfig | null, ...annotations: (Record<string, string> | undefined)[]): PlatformImage {
  const cfg = config ?? parseConfigBlob({})
  return {
    platform,
    digest,
    mediaType: manifest.mediaType,
    size: manifest.compressedSize,
    created: createdOf(config, manifest.annotations, ...annotations),
    layers: buildLayers(manifest, cfg),
    labels: cfg.labels,
    config: cfg.config,
    dockerfile: reconstructDockerfile(cfg),
  }
}

export interface ResolvedDigest {
  digest: string
  mediaType: string
  kind: 'image' | 'index'
  /** Platforms declared by the index (or the single image's platform). */
  platforms: string[]
  /** Fully resolved images. For the table only the primary platform is resolved. */
  images: PlatformImage[]
}

/**
 * Resolve a manifest reference. `full = false` resolves only the primary platform
 * of an index (enough for the table); `full = true` resolves every platform (drawer).
 */
export async function resolveReference(client: RegistryClient, name: string, reference: string, full: boolean): Promise<ResolvedDigest> {
  const top = await fetchManifest(client, name, reference)
  const kind = detectKind(top.body, top.mediaType)

  if (kind === 'image') {
    const manifest = parseManifest(top.body, top.mediaType)
    const config = await fetchConfig(client, name, manifest.config.digest)
    const platform = config?.os && config.architecture
      ? formatPlatform({ os: config.os, architecture: config.architecture, variant: config.variant ?? undefined })
      : 'unknown'
    const image = toPlatformImage(platform, top.digest, manifest, config)
    return { digest: top.digest, mediaType: top.mediaType, kind, platforms: [platform], images: [image] }
  }

  const index = parseIndex(top.body, top.mediaType)
  const entries = index.manifests.map(e => ({ entry: e, platform: formatPlatform(e.platform) }))
  const selected = full ? entries : [pickPrimary(entries)].filter((e): e is NonNullable<typeof e> => !!e)
  const run = pLimit(CHILD_CONCURRENCY)
  const images = await Promise.all(selected.map(({ entry, platform }) => run(async () => {
    const child = await fetchManifest(client, name, entry.digest)
    const manifest = parseManifest(child.body, child.mediaType)
    const config = await fetchConfig(client, name, manifest.config.digest)
    return toPlatformImage(platform, child.digest, manifest, config, entry.annotations, index.annotations)
  })))
  return { digest: top.digest, mediaType: top.mediaType, kind, platforms: entries.map(e => e.platform), images }
}

function toRow(tag: string, resolved: ResolvedDigest): TagRow {
  const primary = pickPrimary(resolved.images)
  return {
    tag,
    digest: resolved.digest,
    mediaType: resolved.mediaType,
    kind: resolved.kind,
    size: primary?.size ?? 0,
    platforms: resolved.platforms,
    created: primary?.created ?? null,
  }
}

function compareRows(a: TagRow, b: TagRow): number {
  if (a.created !== b.created) {
    if (!a.created) return 1
    if (!b.created) return -1
    return a.created < b.created ? 1 : -1
  }
  return a.tag.localeCompare(b.tag, undefined, { numeric: true })
}

/** Unique-blob compressed size across a set of images (layers and config blobs counted once). */
function uniqueBlobSize(images: PlatformImage[]): number {
  const seen = new Map<string, number>()
  for (const img of images) {
    for (const l of img.layers) if (l.digest) seen.set(l.digest, l.size)
  }
  return [...seen.values()].reduce((s, n) => s + n, 0)
}

/** The tag table for a repository: one row per tag, newest first. */
export async function resolveTags(client: RegistryClient, name: string, ttlSeconds: number, force = false): Promise<TagsResponse> {
  if (!force) {
    const cached = await getImageCache<TagsResponse>(name)
    if (cached) return cached
  }
  const tags = await client.listTags(name)
  const run = pLimit(MANIFEST_CONCURRENCY)
  const resolved = await Promise.all(tags.map(tag => run(async () => {
    const digest = await client.headManifest(name, tag)
    const r = await resolveReference(client, name, digest, false)
    return { tag, r }
  })))
  const rows = resolved.map(({ tag, r }) => toRow(tag, r)).sort(compareRows)
  const response: TagsResponse = {
    name,
    tags: rows,
    compressedSize: uniqueBlobSize(resolved.flatMap(x => x.r.images)),
    uniqueDigests: new Set(rows.map(r => r.digest)).size,
    fetchedAt: Date.now(),
  }
  await setImageCache(name, response, ttlSeconds)
  return response
}

/** Everything the drawer needs for one tag. */
export async function resolveTagDetail(client: RegistryClient, name: string, tag: string, ttlSeconds: number): Promise<TagDetail> {
  const digest = await client.headManifest(name, tag)
  const [resolved, table] = await Promise.all([
    resolveReference(client, name, digest, true),
    resolveTags(client, name, ttlSeconds),
  ])
  const row = toRow(tag, resolved)
  const sharedWith = table.tags.filter(t => t.digest === digest && t.tag !== tag).map(t => t.tag)
  return { ...row, images: resolved.images, sharedWith }
}

/** Tags of a repository currently pointing at a digest (fresh HEADs, not the cache). */
export async function tagsPointingAt(client: RegistryClient, name: string, digest: string): Promise<string[]> {
  const tags = await client.listTags(name)
  const run = pLimit(MANIFEST_CONCURRENCY)
  const pairs = await Promise.all(tags.map(tag => run(async () => ({ tag, digest: await client.headManifest(name, tag) }))))
  return pairs.filter(p => p.digest === digest).map(p => p.tag)
}
