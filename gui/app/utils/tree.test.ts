import { describe, expect, it } from 'vitest'
import { buildTree, countNamespaces, flattenTree } from './tree'

const repos = ['alpine', 'backend/api', 'backend/worker', 'infra/alpine', 'registry', 'tools/ci/runner', 'tools/ci/cache'].map(name => ({ name }))

describe('buildTree', () => {
  it('groups by the first component with the defaults', () => {
    const tree = buildTree(repos)
    expect(tree.map(n => `${n.kind}:${n.name}`)).toEqual([
      'image:alpine', 'group:backend/', 'group:infra/', 'image:registry', 'group:tools/',
    ])
    const tools = tree.find(n => n.name === 'tools/')
    expect(tools?.kind === 'group' && tools.children.map(c => c.name)).toEqual(['tools/ci/cache', 'tools/ci/runner'])
    expect(tools?.kind === 'group' && tools.children[0]?.kind === 'image' && tools.children[0].label).toBe('ci/cache')
  })

  it('nests deeper with maxBranches = 2', () => {
    const tree = buildTree(repos, 1, 2)
    const tools = tree.find(n => n.name === 'tools/')
    expect(tools?.kind === 'group' && tools.children.map(c => `${c.kind}:${c.name}`)).toEqual(['group:tools/ci/'])
  })

  it('keeps small namespaces flat when minBranches is higher', () => {
    const tree = buildTree(repos, 2, 1)
    expect(tree.map(n => `${n.kind}:${n.name}`)).toEqual([
      'image:alpine', 'group:backend/', 'image:infra/alpine', 'image:registry', 'group:tools/',
    ])
  })
})

describe('flattenTree', () => {
  const tree = buildTree(repos)
  it('hides children of collapsed groups', () => {
    const rows = flattenTree(tree, { 'backend/': true })
    expect(rows.map(n => n.name)).toEqual(['alpine', 'backend/', 'backend/api', 'backend/worker', 'infra/', 'registry', 'tools/'])
  })
  it('filters images and forces matching groups open', () => {
    const rows = flattenTree(tree, {}, 'api')
    expect(rows.map(n => n.name)).toEqual(['backend/', 'backend/api'])
    expect(flattenTree(tree, {}, 'zzz')).toEqual([])
  })
})

describe('countNamespaces', () => {
  it('counts top-level prefixes only', () => {
    expect(countNamespaces(repos)).toBe(3)
    expect(countNamespaces([{ name: 'alpine' }])).toBe(0)
  })
})
