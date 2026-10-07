<script setup lang="ts">
import type { TagRow } from '../../shared/types/registry'

const props = defineProps<{
  name: string
  tags: string[]
  rows: TagRow[]
  busy: boolean
  error: string | null
}>()
const emit = defineEmits<{ cancel: [], confirm: [] }>()

/** Tags that will disappear although not selected, because they share a digest with a selected one. */
const collateral = computed(() => {
  const digests = new Set(props.rows.filter(r => props.tags.includes(r.tag)).map(r => r.digest))
  return props.rows.filter(r => digests.has(r.digest) && !props.tags.includes(r.tag)).map(r => r.tag)
})
const digestCount = computed(() => new Set(props.rows.filter(r => props.tags.includes(r.tag)).map(r => r.digest)).size)

const cancelButton = ref<HTMLButtonElement | null>(null)
onMounted(() => cancelButton.value?.focus())

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && !props.busy) emit('cancel')
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div
    class="backdrop"
    @click.self="!busy && emit('cancel')"
  >
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="del-title"
    >
      <h2 id="del-title">
        Delete {{ tags.length }} {{ tags.length === 1 ? 'tag' : 'tags' }} from {{ name }}?
      </h2>
      <div class="tags">
        <span
          v-for="t in tags"
          :key="t"
          class="mono"
        >{{ t }}</span>
      </div>
      <div
        v-if="collateral.length"
        class="alert"
      >
        <AppIcon name="warn" />
        <span>Also removed because of a shared digest: <span
          class="mono"
          style="font-weight:500"
        >{{ collateral.join(', ') }}</span></span>
      </div>
      <div class="alert">
        <AppIcon name="warn" />
        <span>The registry deletes by digest. Every tag that points at the same digest is removed too. Run garbage collection afterwards to free disk space.</span>
      </div>
      <div
        v-if="error"
        class="alert error"
        role="alert"
      >
        <AppIcon name="warn" /><span>{{ error }}</span>
      </div>
      <div class="foot">
        <button
          ref="cancelButton"
          type="button"
          class="btn"
          :disabled="busy"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <button
          type="button"
          class="btn danger"
          :disabled="busy"
          @click="emit('confirm')"
        >
          <AppIcon
            v-if="busy"
            name="loader"
            :size="14"
            class="spin"
          />
          {{ busy ? 'Deleting…' : `Delete ${digestCount === 1 ? 'manifest' : `${digestCount} manifests`}` }}
        </button>
      </div>
    </div>
  </div>
</template>
