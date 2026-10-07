/**
 * Types shared between the Nitro API (server/) and the SPA (app/).
 * They describe what the GUI shows, not the raw registry formats
 * (those live in server/utils/manifest.ts).
 */

export interface HealthResponse {
  ok: boolean
  /** Hostname shown in the top bar. */
  title: string
  /** Prefix for `docker pull`. */
  pullUrl: string
  /** Whether delete buttons are enabled (DELETE_IMAGES). */
  deleteEnabled: boolean
  showTagCount: boolean
  /** Default theme from THEME: 'auto', 'light' or 'dark'. */
  theme: 'auto' | 'light' | 'dark'
  catalogMinBranches: number
  catalogMaxBranches: number
  apiVersion: string | null
  /** Error message when the registry is unreachable. */
  error?: string
}

export interface RepositorySummary {
  name: string
  /** Present only when SHOW_TAG_COUNT=true. */
  tagCount?: number
}

export interface RepositoriesResponse {
  repositories: RepositorySummary[]
  /** Unix ms when the catalog was fetched. */
  fetchedAt: number
}

/** One layer as shown in the drawer: a history step, optionally backed by a blob. */
export interface LayerInfo {
  /** 1-based position in the history. */
  index: number
  /** Blob digest, null for metadata-only steps (ENV, CMD, ...). */
  digest: string | null
  /** Compressed size in bytes (0 for empty layers). */
  size: number
  /** Normalized Dockerfile-like instruction. */
  command: string
  emptyLayer: boolean
  created: string | null
}

export interface ImageConfigSummary {
  env: string[]
  cmd: string[] | null
  entrypoint: string[] | null
  exposedPorts: string[]
  workingDir: string | null
  user: string | null
}

/** A single-platform image: a manifest plus its config blob. */
export interface PlatformImage {
  /** e.g. "linux/amd64", "linux/arm64/v8". */
  platform: string
  digest: string
  mediaType: string
  /** Compressed size: sum of layer sizes plus the config blob. */
  size: number
  created: string | null
  layers: LayerInfo[]
  labels: Record<string, string>
  config: ImageConfigSummary
  /** Dockerfile reconstructed from the history. */
  dockerfile: string
}

/** One row of the tag table. */
export interface TagRow {
  tag: string
  /** Digest of what the tag points at (manifest or index). */
  digest: string
  mediaType: string
  kind: 'image' | 'index'
  /** Compressed size of the primary platform image. */
  size: number
  platforms: string[]
  /** Build date (config blob `created`), never a push date. */
  created: string | null
  /** Set when the manifest could not be read; size, platforms and created are then empty. */
  error?: string
}

export interface TagsResponse {
  name: string
  tags: TagRow[]
  /** Sum of unique layer and config blobs across all tags. */
  compressedSize: number
  uniqueDigests: number
  fetchedAt: number
}

/** Everything the drawer shows for one tag. */
export interface TagDetail extends TagRow {
  /** All platform images (one for a plain manifest). */
  images: PlatformImage[]
  /** Other tags of the same repository pointing at the same digest. */
  sharedWith: string[]
}

export interface DeleteResponse {
  deleted: true
  digest: string
  /** Tags that pointed at the digest before deletion. */
  tags: string[]
}

export interface ApiErrorBody {
  statusCode: number
  statusMessage: string
  message: string
  data?: { kind?: string, registryErrors?: { code: string, message: string }[] }
}
