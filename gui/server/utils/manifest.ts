/**
 * Parsing of registry content, written from the specifications:
 * - OCI Image Manifest / Image Index / Image Configuration (opencontainers/image-spec)
 * - Docker Image Manifest V2 Schema 2 and Manifest List (distribution/distribution docs)
 *
 * Nothing here talks to the network: it turns JSON bodies into the shapes in shared/types.
 */
import type { ImageConfigSummary, LayerInfo } from '../../shared/types/registry'

export const MEDIA_TYPE = {
  ociIndex: 'application/vnd.oci.image.index.v1+json',
  ociManifest: 'application/vnd.oci.image.manifest.v1+json',
  dockerList: 'application/vnd.docker.distribution.manifest.list.v2+json',
  dockerManifest: 'application/vnd.docker.distribution.manifest.v2+json',
} as const

export interface Descriptor {
  mediaType: string
  digest: string
  size: number
  annotations?: Record<string, string>
}

export interface Platform {
  os: string
  architecture: string
  variant?: string
  osVersion?: string
}

export interface ParsedManifest {
  kind: 'image'
  mediaType: string
  config: Descriptor
  layers: Descriptor[]
  annotations: Record<string, string>
  /** Sum of layer sizes plus the config blob size. */
  compressedSize: number
}

export interface IndexEntry extends Descriptor {
  platform: Platform | null
}

export interface ParsedIndex {
  kind: 'index'
  mediaType: string
  /** Runnable images only: attestation manifests and `unknown/unknown` entries are dropped. */
  manifests: IndexEntry[]
  annotations: Record<string, string>
}

export interface HistoryEntry {
  created: string | null
  createdBy: string
  emptyLayer: boolean
  comment: string | null
}

export interface ParsedConfig {
  created: string | null
  architecture: string | null
  os: string | null
  variant: string | null
  labels: Record<string, string>
  config: ImageConfigSummary
  history: HistoryEntry[]
}

export class ManifestParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ManifestParseError'
  }
}

type Json = Record<string, unknown>

function isObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

function stringRecord(v: unknown): Record<string, string> {
  if (!isObject(v)) return {}
  const out: Record<string, string> = {}
  for (const [k, val] of Object.entries(v)) if (typeof val === 'string') out[k] = val
  return out
}

function stringArray(v: unknown): string[] | null {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null
}

function descriptor(v: unknown, what: string): Descriptor {
  if (!isObject(v)) throw new ManifestParseError(`${what}: expected a descriptor object`)
  const digest = str(v.digest)
  if (!digest) throw new ManifestParseError(`${what}: missing digest`)
  const size = typeof v.size === 'number' ? v.size : 0
  const d: Descriptor = { mediaType: str(v.mediaType) ?? 'application/octet-stream', digest, size }
  const ann = stringRecord(v.annotations)
  if (Object.keys(ann).length) d.annotations = ann
  return d
}

export function isIndexMediaType(mediaType: string | null | undefined): boolean {
  return mediaType === MEDIA_TYPE.ociIndex || mediaType === MEDIA_TYPE.dockerList
}

export function isImageManifestMediaType(mediaType: string | null | undefined): boolean {
  return mediaType === MEDIA_TYPE.ociManifest || mediaType === MEDIA_TYPE.dockerManifest
}

/**
 * Decide whether a body is a manifest or an index.
 * Uses the body's mediaType, the Content-Type, then the shape (`manifests` vs `layers`).
 */
export function detectKind(body: unknown, contentType?: string | null): 'image' | 'index' {
  const mt = (isObject(body) ? str(body.mediaType) : null) ?? contentType ?? null
  if (isIndexMediaType(mt)) return 'index'
  if (isImageManifestMediaType(mt)) return 'image'
  if (isObject(body) && Array.isArray(body.manifests)) return 'index'
  if (isObject(body) && Array.isArray(body.layers)) return 'image'
  throw new ManifestParseError(`Unsupported manifest media type: ${mt ?? 'unknown'}`)
}

/** Parse a Docker v2 schema 2 manifest or an OCI image manifest. */
export function parseManifest(body: unknown, contentType?: string | null): ParsedManifest {
  if (!isObject(body)) throw new ManifestParseError('Manifest is not an object')
  if (body.schemaVersion !== 2) throw new ManifestParseError(`Unsupported schemaVersion ${String(body.schemaVersion)} (only schema 2 is supported)`)
  const mediaType = str(body.mediaType) ?? contentType ?? MEDIA_TYPE.ociManifest
  const config = descriptor(body.config, 'config')
  if (!Array.isArray(body.layers)) throw new ManifestParseError('Manifest has no layers array')
  const layers = body.layers.map((l, i) => descriptor(l, `layers[${i}]`))
  const annotations = stringRecord(body.annotations)
  const compressedSize = layers.reduce((sum, l) => sum + l.size, 0) + config.size
  return { kind: 'image', mediaType, config, layers, annotations, compressedSize }
}

function isAttestation(entry: Json, platform: Platform | null): boolean {
  const ann = stringRecord(entry.annotations)
  if (ann['vnd.docker.reference.type'] === 'attestation-manifest') return true
  return platform?.os === 'unknown' && platform.architecture === 'unknown'
}

function platformOf(v: unknown): Platform | null {
  if (!isObject(v)) return null
  const os = str(v.os)
  const architecture = str(v.architecture)
  if (!os || !architecture) return null
  const p: Platform = { os, architecture }
  const variant = str(v.variant)
  if (variant) p.variant = variant
  const osVersion = str(v['os.version'])
  if (osVersion) p.osVersion = osVersion
  return p
}

/** Parse a Docker manifest list or an OCI image index. */
export function parseIndex(body: unknown, contentType?: string | null): ParsedIndex {
  if (!isObject(body)) throw new ManifestParseError('Index is not an object')
  if (body.schemaVersion !== 2) throw new ManifestParseError(`Unsupported schemaVersion ${String(body.schemaVersion)}`)
  const mediaType = str(body.mediaType) ?? contentType ?? MEDIA_TYPE.ociIndex
  if (!Array.isArray(body.manifests)) throw new ManifestParseError('Index has no manifests array')
  const manifests: IndexEntry[] = []
  body.manifests.forEach((m, i) => {
    if (!isObject(m)) throw new ManifestParseError(`manifests[${i}]: expected an object`)
    const platform = platformOf(m.platform)
    if (isAttestation(m, platform)) return
    manifests.push({ ...descriptor(m, `manifests[${i}]`), platform })
  })
  return { kind: 'index', mediaType, manifests, annotations: stringRecord(body.annotations) }
}

/** "linux/arm64/v8", "windows/amd64" — the form used by `docker pull --platform`. */
export function formatPlatform(p: Platform | null): string {
  if (!p) return 'unknown'
  return [p.os, p.architecture, p.variant].filter(Boolean).join('/')
}

/** Parse an image configuration blob (OCI image config / Docker container config). */
export function parseConfigBlob(body: unknown): ParsedConfig {
  if (!isObject(body)) throw new ManifestParseError('Config blob is not an object')
  const cfg = isObject(body.config) ? body.config : {}
  const history: HistoryEntry[] = Array.isArray(body.history)
    ? body.history.filter(isObject).map(h => ({
        created: str(h.created),
        createdBy: str(h.created_by) ?? '',
        emptyLayer: h.empty_layer === true,
        comment: str(h.comment),
      }))
    : []
  return {
    created: str(body.created),
    architecture: str(body.architecture),
    os: str(body.os),
    variant: str(body.variant),
    labels: stringRecord(cfg.Labels),
    config: {
      env: stringArray(cfg.Env) ?? [],
      cmd: stringArray(cfg.Cmd),
      entrypoint: stringArray(cfg.Entrypoint),
      exposedPorts: isObject(cfg.ExposedPorts) ? Object.keys(cfg.ExposedPorts) : [],
      workingDir: str(cfg.WorkingDir) || null,
      user: str(cfg.User) || null,
    },
    history,
  }
}

/**
 * Turn a `history[].created_by` value into a Dockerfile-like instruction.
 * Handles the classic docker builder (`/bin/sh -c #(nop)  CMD [...]`, `/bin/sh -c cmd`)
 * and BuildKit (`RUN |2 A=1 B=2 /bin/sh -c cmd # buildkit`, `COPY ... # buildkit`).
 */
export function normalizeCommand(createdBy: string): string {
  let s = createdBy.trim()
  s = s.replace(/\s*#\s*buildkit$/, '')
  // classic builder: metadata instructions
  const nop = s.match(/^\/bin\/sh -c #\(nop\)\s+(.*)$/s)
  if (nop) return nop[1]!.trim()
  // classic builder: RUN
  const classicRun = s.match(/^\/bin\/sh -c (.*)$/s)
  if (classicRun) return 'RUN ' + classicRun[1]!.trim()
  // BuildKit: RUN with build args prefix "|N k=v ..." then the shell form
  const bkRun = s.match(/^RUN (?:\|\d+(?:\s+\S+?=\S*)*\s+)?\/bin\/sh -c (.*)$/s)
  if (bkRun) return 'RUN ' + bkRun[1]!.trim()
  // BuildKit renders EXPOSE as a Go map: EXPOSE map[8080/tcp:{} 9090/tcp:{}]
  const expose = s.match(/^EXPOSE map\[(.*)\]$/)
  if (expose) return 'EXPOSE ' + expose[1]!.replace(/:\{\}/g, '')
  return s
}

/**
 * Align the config history with the manifest layers: every non-empty history entry
 * consumes the next layer descriptor. Metadata-only steps get size 0 and no digest.
 * When the config has no history, one entry per layer is produced.
 */
export function buildLayers(manifest: ParsedManifest, config: ParsedConfig): LayerInfo[] {
  if (config.history.length === 0) {
    return manifest.layers.map((l, i) => ({
      index: i + 1,
      digest: l.digest,
      size: l.size,
      command: '',
      emptyLayer: false,
      created: config.created,
    }))
  }
  let next = 0
  return config.history.map((h, i) => {
    const layer = h.emptyLayer ? undefined : manifest.layers[next++]
    return {
      index: i + 1,
      digest: layer?.digest ?? null,
      size: layer?.size ?? 0,
      command: normalizeCommand(h.createdBy),
      emptyLayer: h.emptyLayer,
      created: h.created,
    }
  })
}

/** Dockerfile reconstructed from the history. Base-image steps are kept as they appear. */
export function reconstructDockerfile(config: ParsedConfig): string {
  return config.history
    .map(h => normalizeCommand(h.createdBy))
    .filter(line => line.length > 0)
    .join('\n')
}

/** Build date: config `created`, else the OCI `image.created` annotation (manifest, then index). */
export function createdOf(config: ParsedConfig | null, ...annotationSources: (Record<string, string> | undefined)[]): string | null {
  if (config?.created) return config.created
  for (const ann of annotationSources) {
    const v = ann?.['org.opencontainers.image.created']
    if (v) return v
  }
  return null
}

/** Primary platform for the table row: linux/amd64 if present, else the first entry. */
export function pickPrimary<T extends { platform: string }>(images: T[]): T | undefined {
  return images.find(i => i.platform === 'linux/amd64') ?? images[0]
}
