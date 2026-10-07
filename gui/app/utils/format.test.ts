import { describe, expect, it } from 'vitest'
import { compareTags, formatBytes, pullCommand, relativeTime, shortDigest } from './format'

describe('formatBytes', () => {
  it('formats with one decimal above bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(4088755)).toBe('3.9 MB')
    expect(formatBytes(1.9 * 1024 ** 3)).toBe('1.9 GB')
  })
})

describe('relativeTime', () => {
  const now = Date.parse('2026-10-07T12:00:00Z')
  it('buckets minutes, hours, days', () => {
    expect(relativeTime('2026-10-07T11:20:00Z', now)).toBe('40 min ago')
    expect(relativeTime('2026-10-07T10:30:00Z', now)).toBe('1 h ago')
    expect(relativeTime('2026-10-06T03:00:00Z', now)).toBe('yesterday')
    expect(relativeTime('2026-09-28T15:30:00Z', now)).toBe('8 d ago')
    expect(relativeTime('2026-01-01T00:00:00Z', now)).toMatch(/1 Jan 2026/)
    expect(relativeTime(null, now)).toBe('unknown')
  })
})

describe('tags and digests', () => {
  it('sorts versions naturally', () => {
    expect(['v1.10.0', 'v1.9.0', 'v1.2.0'].sort(compareTags)).toEqual(['v1.2.0', 'v1.9.0', 'v1.10.0'])
  })
  it('shortens digests and builds pull commands', () => {
    expect(shortDigest('sha256:c820b8f1ed40390c2f1c1546bc7ba0327d3e0b79123778de5f3bfc98ef734f3b')).toBe('c820b8f1ed40')
    expect(pullCommand('registry.example.com', 'backend/api', 'v2.6.0')).toBe('docker pull registry.example.com/backend/api:v2.6.0')
  })
})
