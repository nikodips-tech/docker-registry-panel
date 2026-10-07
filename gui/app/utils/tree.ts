import type { RepositorySummary } from '../../shared/types/registry'

export interface TreeImage {
  kind: 'image'
  name: string
  /** Name shown in the sidebar (without the group prefix). */
  label: string
  tagCount?: number
  depth: number
}

export interface TreeGroup {
  kind: 'group'
  /** Prefix including the trailing slash, e.g. "backend/". */
  name: string
  label: string
  depth: number
  children: TreeNode[]
  /** Total images under this group. */
  imageCount: number
}

export type TreeNode = TreeImage | TreeGroup

/**
 * Group repository names by their "/" components.
 * - `maxBranches`: how many leading components can become nested groups (1 = top-level namespaces only).
 * - `minBranches`: minimum number of images a prefix must contain to become a group;
 *   below that, images are listed flat with their full name.
 */
export function buildTree(repositories: RepositorySummary[], minBranches = 1, maxBranches = 1): TreeNode[] {
  const sorted = [...repositories].sort((a, b) => a.name.localeCompare(b.name))
  return build(sorted, '', 0, Math.max(1, minBranches), Math.max(0, maxBranches))
}

function build(repos: RepositorySummary[], prefix: string, depth: number, minBranches: number, maxBranches: number): TreeNode[] {
  const nodes: TreeNode[] = []
  const groups = new Map<string, RepositorySummary[]>()
  const leaves: RepositorySummary[] = []

  for (const r of repos) {
    const rest = r.name.slice(prefix.length)
    const slash = rest.indexOf('/')
    if (depth < maxBranches && slash > 0) {
      const key = rest.slice(0, slash)
      const list = groups.get(key) ?? []
      list.push(r)
      groups.set(key, list)
    }
    else {
      leaves.push(r)
    }
  }

  for (const [key, list] of groups) {
    if (list.length < minBranches) {
      leaves.push(...list)
      continue
    }
    const name = `${prefix}${key}/`
    nodes.push({ kind: 'group', name, label: `${key}/`, depth, imageCount: list.length, children: build(list, name, depth + 1, minBranches, maxBranches) })
  }
  for (const r of leaves) {
    nodes.push({ kind: 'image', name: r.name, label: r.name.slice(prefix.length), tagCount: r.tagCount, depth })
  }
  return nodes.sort((a, b) => a.name.localeCompare(b.name))
}

/** Flatten the tree for rendering, skipping children of collapsed groups. */
export function flattenTree(nodes: TreeNode[], expanded: Record<string, boolean>, filter = ''): TreeNode[] {
  const q = filter.trim().toLowerCase()
  const out: TreeNode[] = []
  const walk = (list: TreeNode[]) => {
    for (const n of list) {
      if (n.kind === 'image') {
        if (!q || n.name.toLowerCase().includes(q)) out.push(n)
        continue
      }
      const matching = q ? countMatching(n, q) : n.imageCount
      if (matching === 0) continue
      out.push(n)
      // a filter forces groups open so that matches are visible
      if (q || expanded[n.name]) walk(n.children)
    }
  }
  walk(nodes)
  return out
}

function countMatching(group: TreeGroup, q: string): number {
  let n = 0
  for (const c of group.children) {
    if (c.kind === 'image') n += c.name.toLowerCase().includes(q) ? 1 : 0
    else n += countMatching(c, q)
  }
  return n
}

/** Top-level namespace count ("4 namespaces" in the sidebar header). */
export function countNamespaces(repositories: RepositorySummary[]): number {
  const set = new Set<string>()
  for (const r of repositories) {
    const i = r.name.indexOf('/')
    if (i > 0) set.add(r.name.slice(0, i))
  }
  return set.size
}
