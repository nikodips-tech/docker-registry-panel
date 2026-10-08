/** Formatting helpers for the UI. Dates are build dates ("Created"), never push dates. */

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let n = bytes
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return i === 0 ? `${n} B` : `${n.toFixed(1)} ${units[i]}`
}

export function formatDate(iso: string | null): string {
  if (!iso) return 'unknown'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d)
}

/** "40 min ago", "1 h ago", "yesterday", "9 d ago", then the date. */
export function relativeTime(iso: string | null, now: number = Date.now()): string {
  if (!iso) return 'unknown'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return iso
  const diff = Math.max(0, now - t)
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.floor(h / 24)
  if (d === 1) return 'yesterday'
  if (d < 60) return `${d} d ago`
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(t))
}

export function shortDigest(digest: string): string {
  const hex = digest.split(':')[1] ?? digest
  return hex.slice(0, 12)
}

export function pullCommand(pullUrl: string, name: string, tag: string): string {
  return `docker pull ${pullUrl}/${name}:${tag}`
}

/** Natural ("v1.10.0" after "v1.9.0") comparison for tag names. */
export function compareTags(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}
