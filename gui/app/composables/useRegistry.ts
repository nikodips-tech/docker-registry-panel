import type { DeleteResponse, HealthResponse, RepositoriesResponse, TagDetail, TagsResponse } from '../../shared/types/registry'

/** Typed wrappers around the Nitro API (docs/03, "Endpoint Nitro"). */
export function useRegistry() {
  return {
    health: () => $fetch<HealthResponse>('/api/registry/health'),
    repositories: (refresh = false) =>
      $fetch<RepositoriesResponse>('/api/repositories', { query: refresh ? { refresh: 1 } : undefined }),
    tags: (name: string, refresh = false) =>
      $fetch<TagsResponse>(`/api/repositories/${name}/tags`, { query: refresh ? { refresh: 1 } : undefined }),
    tagDetail: (name: string, tag: string) =>
      $fetch<TagDetail>(`/api/repositories/${name}/tags/${encodeURIComponent(tag)}`),
    deleteManifest: (name: string, digest: string) =>
      $fetch<DeleteResponse>(`/api/repositories/${name}/manifests/${digest}`, { method: 'DELETE' }),
  }
}

/** Human-readable message from a $fetch error (uses the API's JSON body when present). */
export function errorMessage(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const e = err as { data?: { message?: string, statusMessage?: string }, statusCode?: number, message?: string }
    if (e.data?.message) return e.data.message
    if (e.data?.statusMessage) return e.data.statusMessage
    if (e.message) return e.message
  }
  return String(err)
}
