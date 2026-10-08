<script setup lang="ts">
import type { HealthResponse, RepositorySummary } from '../../shared/types/registry'
import { countNamespaces } from '../utils/tree'

const props = defineProps<{
  health: HealthResponse | null
  title: string
  repositories: RepositorySummary[]
  loading: boolean
}>()
const emit = defineEmits<{ refresh: [] }>()

const namespaces = computed(() => countNamespaces(props.repositories))
const tagTotal = computed(() => {
  if (!props.health?.showTagCount) return null
  return props.repositories.reduce((s, r) => s + (r.tagCount ?? 0), 0)
})
</script>

<template>
  <div class="page-head">
    <div>
      <h1>{{ title }}</h1>
      <div
        class="muted"
        style="margin-top:2px"
      >
        <template v-if="health?.ok">
          Registry API v2 · delete {{ health.deleteEnabled ? 'enabled' : 'disabled' }}
        </template>
        <template v-else-if="health">
          Registry unreachable
        </template>
        <template v-else>
          Checking registry…
        </template>
      </div>
    </div>
    <button
      class="btn"
      type="button"
      :disabled="loading"
      @click="emit('refresh')"
    >
      <AppIcon
        name="refresh"
        :size="14"
        :class="{ spin: loading }"
      />Refresh
    </button>
  </div>

  <div
    v-if="health && !health.ok"
    class="alert error"
    role="alert"
  >
    <AppIcon name="warn" />
    <span>{{ health.error ?? 'The registry did not answer.' }}</span>
  </div>

  <div class="stats">
    <div class="card stat">
      <div class="k">
        Images
      </div>
      <div class="v">
        {{ repositories.length }}
      </div>
      <div class="s">
        in {{ namespaces }} {{ namespaces === 1 ? 'namespace' : 'namespaces' }}
      </div>
    </div>
    <div class="card stat">
      <div class="k">
        Tags
      </div>
      <div class="v">
        {{ tagTotal ?? '—' }}
      </div>
      <div class="s">
        {{ tagTotal === null ? 'enable SHOW_TAG_COUNT' : `across ${repositories.length} images` }}
      </div>
    </div>
  </div>

  <div
    class="card"
    style="overflow:hidden"
  >
    <div class="card-head">
      <h2>Getting started</h2>
    </div>
    <div class="card-body">
      Select an image in the sidebar to see its tags. Tag details, shared digests and deletion are available from the table.
      Overview statistics and the "Recently created" feed arrive with the stats job (backlog, phase 2).
    </div>
  </div>
</template>
