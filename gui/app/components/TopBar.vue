<script setup lang="ts">
import type { HealthResponse } from '../../shared/types/registry'

defineProps<{
  health: HealthResponse | null
  title: string
}>()
const emit = defineEmits<{ home: [], toggleTheme: [] }>()
</script>

<template>
  <header class="topbar">
    <a
      class="brand"
      href="/"
      @click.prevent="emit('home')"
    ><span class="brand-mark"><AppIcon name="cube" /></span>Registry GUI</a>
    <span
      class="pill"
      :title="health?.ok ? 'Registry reachable' : (health?.error ?? 'Checking registry…')"
    >
      <span
        class="dot"
        :class="{ down: health && !health.ok }"
      />
      <span
        class="mono"
        style="font-size:13px"
      >{{ title }}</span>
    </span>
    <div class="spacer" />
    <button
      class="iconbtn"
      type="button"
      aria-label="Toggle dark mode"
      title="Toggle dark mode"
      @click="emit('toggleTheme')"
    >
      <AppIcon name="moon" />
    </button>
  </header>
</template>
