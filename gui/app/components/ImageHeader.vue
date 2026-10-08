<script setup lang="ts">
import type { TagsResponse } from '../../shared/types/registry'
import { formatBytes, formatDate, pullCommand, relativeTime } from '../utils/format'

const props = defineProps<{
  name: string
  title: string
  pullUrl: string
  data: TagsResponse | null
}>()
const emit = defineEmits<{ home: [], copy: [text: string] }>()

const namespace = computed(() => (props.name.includes('/') ? props.name.slice(0, props.name.lastIndexOf('/')) : 'library'))
const newest = computed(() => props.data?.tags.find(t => t.created) ?? props.data?.tags[0] ?? null)
const pull = computed(() => (newest.value ? pullCommand(props.pullUrl, props.name, newest.value.tag) : null))
</script>

<template>
  <div class="img-head">
    <div style="min-width:0">
      <nav
        class="crumb"
        aria-label="Breadcrumb"
      >
        <button
          type="button"
          class="link"
          @click="emit('home')"
        >
          {{ title }}
        </button>
        <span>/</span>
        <span>{{ namespace }}</span>
      </nav>
      <h1 class="mono">
        {{ name }}
      </h1>
      <div
        v-if="data"
        class="chips"
      >
        <span class="chip">{{ data.tags.length }} {{ data.tags.length === 1 ? 'tag' : 'tags' }}</span>
        <span class="chip">{{ data.uniqueDigests }} {{ data.uniqueDigests === 1 ? 'digest' : 'digests' }}</span>
        <span class="chip">{{ formatBytes(data.compressedSize) }} compressed</span>
        <span
          v-if="newest?.created"
          class="chip ok"
          :title="formatDate(newest.created)"
        >created {{ relativeTime(newest.created) }}</span>
      </div>
    </div>
    <div
      v-if="pull"
      class="pull"
    >
      <span
        class="muted"
        style="font-size:12px"
      >Pull the newest tag</span>
      <div class="pull-box mono">
        <span class="muted">$</span>
        <span class="cmd">{{ pull }}</span>
        <button
          type="button"
          class="btn icon"
          aria-label="Copy pull command"
          title="Copy pull command"
          @click="emit('copy', pull)"
        >
          <AppIcon
            name="copy"
            :size="15"
          />
        </button>
      </div>
    </div>
  </div>
</template>
