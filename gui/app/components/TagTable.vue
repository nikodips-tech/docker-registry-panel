<script setup lang="ts">
import type { TagRow } from '../../shared/types/registry'
import type { SortMode } from '../composables/useUiState'
import { compareTags, formatBytes, formatDate, pullCommand, relativeTime, shortDigest } from '../utils/format'

const props = defineProps<{
  name: string
  pullUrl: string
  tags: TagRow[]
  loading: boolean
  error: string | null
  openTag: string | null
  checked: Set<string>
  sort: SortMode
  deleteEnabled: boolean
}>()
const emit = defineEmits<{
  open: [tag: string]
  copy: [text: string]
  remove: [tags: string[]]
  check: [tag: string, on: boolean]
  checkAll: [tags: string[], on: boolean]
  clear: []
  sort: [mode: SortMode]
  refresh: []
}>()

const query = ref('')
watch(() => props.name, () => {
  query.value = ''
})

/** Tags grouped by digest, to flag shared digests. */
const byDigest = computed(() => {
  const m = new Map<string, string[]>()
  for (const t of props.tags) if (t.digest) m.set(t.digest, [...(m.get(t.digest) ?? []), t.tag])
  return m
})
/** The API returns rows newest first; the first one with a build date is "newest". */
const newest = computed(() => props.tags.find(t => t.created)?.tag ?? null)

const visible = computed(() => {
  const q = query.value.trim().toLowerCase()
  const list = q ? props.tags.filter(t => t.tag.toLowerCase().includes(q)) : [...props.tags]
  if (props.sort === 'name') list.sort((a, b) => compareTags(a.tag, b.tag))
  return list
})
const brokenCount = computed(() => props.tags.filter(t => t.error).length)
const allVisibleChecked = computed(() => {
  const selectable = visible.value.filter(t => t.digest)
  return selectable.length > 0 && selectable.every(t => props.checked.has(t.tag))
})

function others(t: TagRow): string[] {
  return (byDigest.value.get(t.digest) ?? []).filter(x => x !== t.tag)
}
</script>

<template>
  <div class="toolbar">
    <label class="filter">
      <AppIcon
        name="search"
        :size="14"
      />
      <input
        v-model="query"
        type="text"
        placeholder="Filter tags"
        aria-label="Filter tags"
      >
    </label>
    <div
      class="seg"
      role="group"
      aria-label="Sort tags"
    >
      <button
        type="button"
        :class="{ active: sort === 'date' }"
        :aria-pressed="sort === 'date'"
        @click="emit('sort', 'date')"
      >
        Newest
      </button>
      <button
        type="button"
        :class="{ active: sort === 'name' }"
        :aria-pressed="sort === 'name'"
        @click="emit('sort', 'name')"
      >
        Name
      </button>
    </div>
    <button
      type="button"
      class="btn icon"
      aria-label="Refresh tags"
      title="Refresh tags"
      :disabled="loading"
      @click="emit('refresh')"
    >
      <AppIcon
        name="refresh"
        :size="15"
        :class="{ spin: loading }"
      />
    </button>
    <div class="spacer" />
    <div
      v-if="checked.size"
      class="selbar"
    >
      <span>{{ checked.size }} selected</span>
      <button
        type="button"
        class="btn ghost"
        @click="emit('clear')"
      >
        Clear
      </button>
      <button
        v-if="deleteEnabled"
        type="button"
        class="btn danger"
        @click="emit('remove', [...checked])"
      >
        <AppIcon
          name="trash"
          :size="14"
        />Delete
      </button>
    </div>
    <span
      class="muted"
      style="font-size:13px"
    >{{ visible.length }} of {{ tags.length }} tags</span>
  </div>

  <div
    v-if="!error && brokenCount"
    class="alert"
  >
    <AppIcon name="warn" />
    <span>{{ brokenCount }} {{ brokenCount === 1 ? 'tag points' : 'tags point' }} at a manifest the registry cannot serve, so size and date are unknown and a pull would fail. This usually means a garbage collection removed the platform manifests of a multi-arch image. Hover the badge for details.</span>
  </div>

  <div
    v-if="error"
    class="alert error"
    role="alert"
  >
    <AppIcon name="warn" />
    <span>{{ error }} <button
      type="button"
      class="link"
      @click="emit('refresh')"
    >Retry</button></span>
  </div>

  <div
    class="card"
    style="overflow:hidden"
  >
    <div class="scroll-x">
      <div
        class="table"
        role="table"
        aria-label="Tags"
      >
        <div
          class="trow thead"
          role="row"
        >
          <label>
            <input
              type="checkbox"
              :checked="allVisibleChecked"
              :disabled="!visible.length"
              aria-label="Select all visible tags"
              @change="emit('checkAll', visible.filter(t => t.digest).map(t => t.tag), ($event.target as HTMLInputElement).checked)"
            >
          </label>
          <span>Tag</span><span>Digest</span><span class="right">Size</span><span>Platforms</span><span>Created</span><span />
        </div>

        <div
          v-if="loading && !tags.length"
          class="loading"
        >
          <AppIcon
            name="loader"
            class="spin"
          /> Resolving manifests…
        </div>
        <div
          v-else-if="!visible.length"
          class="table-empty"
        >
          {{ tags.length ? 'No tag matches the filter.' : 'This repository has no tags.' }}
        </div>

        <div
          v-for="t in visible"
          :key="t.tag"
          class="trow clickable"
          role="row"
          tabindex="0"
          :class="{ checked: checked.has(t.tag), open: !checked.has(t.tag) && openTag === t.tag }"
          :aria-label="`Show details for ${t.tag}`"
          @click="emit('open', t.tag)"
          @keydown.enter.self="emit('open', t.tag)"
        >
          <label @click.stop>
            <input
              type="checkbox"
              :checked="checked.has(t.tag)"
              :disabled="!t.digest"
              :aria-label="`Select tag ${t.tag}`"
              @change="emit('check', t.tag, ($event.target as HTMLInputElement).checked)"
            >
          </label>
          <div class="cell">
            <span
              class="mono tag-name ell"
              :title="t.tag"
            >{{ t.tag }}</span>
            <span
              v-if="t.tag === newest"
              class="tag-badge ok"
            >newest</span>
            <span
              v-if="t.error"
              class="tag-badge danger"
              :title="t.error"
            >manifest unavailable</span>
          </div>
          <div class="cell">
            <span
              class="mono ell"
              style="font-size:12px;color:var(--muted)"
              :title="t.digest"
            >{{ t.digest ? `${t.digest.split(':')[0]}:${shortDigest(t.digest)}` : '—' }}</span>
            <span
              v-if="others(t).length"
              class="tag-badge warn"
              :title="`Same digest as ${others(t).join(', ')}`"
            >= {{ others(t).join(', ') }}</span>
          </div>
          <span
            class="mono right"
            style="font-size:13px"
          >{{ t.error ? '—' : formatBytes(t.size) }}</span>
          <div class="archs">
            <span
              v-for="p in t.platforms"
              :key="p"
              class="mono arch"
            >{{ p }}</span>
          </div>
          <span
            class="muted"
            :title="t.error ?? formatDate(t.created)"
          >{{ t.error ? '—' : relativeTime(t.created) }}</span>
          <div
            class="actions"
            @click.stop
          >
            <button
              type="button"
              class="btn icon"
              :aria-label="`Copy pull command for ${t.tag}`"
              title="Copy pull command"
              @click="emit('copy', pullCommand(pullUrl, name, t.tag))"
            >
              <AppIcon
                name="copy"
                :size="15"
              />
            </button>
            <button
              v-if="!t.error || t.digest"
              type="button"
              class="btn icon"
              :aria-label="`Show details for ${t.tag}`"
              title="Show details"
              @click="emit('open', t.tag)"
            >
              <AppIcon
                name="layers"
                :size="15"
              />
            </button>
            <button
              v-if="deleteEnabled && t.digest"
              type="button"
              class="btn icon danger"
              :aria-label="`Delete ${t.tag}`"
              title="Delete"
              @click="emit('remove', [t.tag])"
            >
              <AppIcon
                name="trash"
                :size="15"
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
