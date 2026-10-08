<script setup lang="ts">
import type { RepositorySummary } from '../../shared/types/registry'
import { buildTree, countNamespaces, flattenTree } from '../utils/tree'

const props = defineProps<{
  repositories: RepositorySummary[]
  loading: boolean
  error: string | null
  selected: string | null
  expanded: Record<string, boolean>
  showTagCount: boolean
  minBranches: number
  maxBranches: number
}>()
const emit = defineEmits<{ select: [name: string], toggle: [name: string], refresh: [] }>()

const filter = ref('')
const tree = computed(() => buildTree(props.repositories, props.minBranches, props.maxBranches))
const rows = computed(() => flattenTree(tree.value, props.expanded, filter.value))
const namespaces = computed(() => countNamespaces(props.repositories))
</script>

<template>
  <aside class="sidebar">
    <div class="side-head">
      <div class="side-title">
        <h2>Repositories</h2>
        <span v-if="!loading">{{ repositories.length }} images · {{ namespaces }} namespaces</span>
        <span v-else>loading…</span>
      </div>
      <label class="filter">
        <AppIcon
          name="filter"
          :size="14"
        />
        <input
          v-model="filter"
          type="text"
          placeholder="Filter repositories"
          aria-label="Filter repositories"
        >
      </label>
    </div>
    <nav
      class="tree"
      aria-label="Repository tree"
    >
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
        v-else-if="loading && !repositories.length"
        class="empty"
      >
        Loading catalog…
      </div>
      <div
        v-else-if="!rows.length"
        class="empty"
      >
        {{ repositories.length ? 'No repository matches the filter.' : 'The registry has no repositories.' }}
      </div>
      <template
        v-for="node in rows"
        :key="node.kind + node.name"
      >
        <button
          v-if="node.kind === 'group'"
          type="button"
          class="group"
          :aria-expanded="!!filter || !!expanded[node.name]"
          :style="{ paddingLeft: `${8 + node.depth * 22}px` }"
          @click="emit('toggle', node.name)"
        >
          <span class="chev"><AppIcon
            name="chevR"
            :size="14"
          /></span>
          <span class="folder"><AppIcon name="folder" /></span>
          <span class="label">{{ node.label }}</span>
          <span class="count">{{ node.imageCount }} images</span>
        </button>
        <button
          v-else
          type="button"
          class="item"
          :class="{ current: selected === node.name }"
          :aria-current="selected === node.name ? 'page' : undefined"
          :style="{ paddingLeft: `${8 + node.depth * 22}px` }"
          :title="node.name"
          @click="emit('select', node.name)"
        >
          <span class="cube"><AppIcon name="cubeS" /></span>
          <span class="label">{{ node.label }}</span>
          <span
            v-if="showTagCount && node.tagCount !== undefined"
            class="badge"
          >{{ node.tagCount }} {{ node.tagCount === 1 ? 'tag' : 'tags' }}</span>
        </button>
      </template>
    </nav>
  </aside>
</template>
