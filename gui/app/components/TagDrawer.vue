<script setup lang="ts">
import type { TagDetail } from '../../shared/types/registry'
import { formatBytes, formatDate, pullCommand } from '../utils/format'

const props = defineProps<{
  name: string
  tag: string
  pullUrl: string
  detail: TagDetail | null
  loading: boolean
  error: string | null
  deleteEnabled: boolean
}>()
const emit = defineEmits<{ close: [], copy: [text: string], remove: [tag: string] }>()

const platformIndex = ref(0)
const showDockerfile = ref(false)
watch(() => props.detail, () => {
  platformIndex.value = 0
  showDockerfile.value = false
})

const image = computed(() => props.detail?.images[platformIndex.value] ?? props.detail?.images[0] ?? null)
const labels = computed(() => Object.entries(image.value?.labels ?? {}))
const pull = computed(() => pullCommand(props.pullUrl, props.name, props.tag))
</script>

<template>
  <aside
    class="drawer"
    aria-label="Tag details"
  >
    <div class="drawer-head">
      <div style="min-width:0">
        <div
          class="muted"
          style="font-size:12px"
        >
          {{ name }}
        </div>
        <h2 class="mono">
          {{ tag }}
        </h2>
      </div>
      <button
        type="button"
        class="btn icon"
        aria-label="Close details"
        style="width:32px;height:32px"
        @click="emit('close')"
      >
        <AppIcon name="x" />
      </button>
    </div>

    <div class="drawer-body">
      <div
        v-if="error"
        class="alert error"
        role="alert"
      >
        <AppIcon name="warn" /><span>{{ error }}</span>
      </div>
      <div
        v-else-if="loading || !detail"
        class="loading"
      >
        <AppIcon
          name="loader"
          class="spin"
        /> Loading manifest…
      </div>

      <template v-if="detail">
        <div class="kv">
          <div>
            <div class="k">
              Created
            </div>
            <div :title="detail.created ?? ''">
              {{ formatDate(image?.created ?? detail.created) }}
            </div>
          </div>
          <div>
            <div class="k">
              Size
            </div>
            <div class="mono">
              {{ formatBytes(image?.size ?? detail.size) }}
            </div>
          </div>
          <div class="wide">
            <div class="k">
              Digest
            </div>
            <div class="mono digest-full">
              {{ detail.digest }}
            </div>
          </div>
          <div
            v-if="detail.kind === 'index' && image"
            class="wide"
          >
            <div class="k">
              Platform manifest
            </div>
            <div class="mono digest-full">
              {{ image.digest }}
            </div>
          </div>
        </div>

        <div
          v-if="detail.sharedWith.length"
          class="alert"
        >
          <AppIcon name="warn" />
          <span>Same digest as <span
            class="mono"
            style="font-weight:500"
          >{{ detail.sharedWith.join(', ') }}</span>. Deleting one deletes {{ detail.sharedWith.length === 1 ? 'both' : 'all of them' }}.</span>
        </div>

        <div class="drawer-actions">
          <button
            type="button"
            class="btn primary"
            @click="emit('copy', pull)"
          >
            <AppIcon
              name="copy"
              :size="14"
            />Copy pull
          </button>
          <button
            type="button"
            class="btn"
            :aria-pressed="showDockerfile"
            @click="showDockerfile = !showDockerfile"
          >
            <AppIcon
              name="file"
              :size="14"
            />Dockerfile
          </button>
          <button
            v-if="deleteEnabled"
            type="button"
            class="btn icon danger"
            aria-label="Delete this tag"
            title="Delete this tag"
            @click="emit('remove', tag)"
          >
            <AppIcon
              name="trash"
              :size="15"
            />
          </button>
        </div>

        <div v-if="showDockerfile && image">
          <div class="section-head">
            <h3 class="section-title">
              Dockerfile (reconstructed)
            </h3>
            <button
              type="button"
              class="link"
              style="font-size:12px"
              @click="emit('copy', image.dockerfile)"
            >
              Copy
            </button>
          </div>
          <pre class="mono dockerfile">{{ image.dockerfile || '# no history in the image config' }}</pre>
        </div>

        <div>
          <div
            v-if="detail.images.length > 1"
            class="tabs"
            role="tablist"
          >
            <button
              v-for="(img, i) in detail.images"
              :key="img.platform"
              type="button"
              role="tab"
              class="mono"
              :class="{ active: i === platformIndex }"
              :aria-selected="i === platformIndex"
              @click="platformIndex = i"
            >
              {{ img.platform }}
            </button>
          </div>
          <div
            v-else-if="image"
            class="tabs"
          >
            <button
              type="button"
              class="mono active"
              disabled
            >
              {{ image.platform }}
            </button>
          </div>
          <div class="section-head">
            <h3 class="section-title">
              Layers
            </h3>
            <span
              v-if="image"
              class="muted"
              style="font-size:12px"
            >{{ image.layers.filter(l => l.digest).length }} · {{ formatBytes(image.size) }}</span>
          </div>
          <ol
            v-if="image"
            class="layers"
          >
            <li
              v-for="l in image.layers"
              :key="l.index"
              :title="l.digest ?? 'metadata only, no layer'"
            >
              <span class="mono n">{{ l.index }}</span>
              <span class="mono cmd">{{ l.command || '(no command)' }}</span>
              <span class="mono sz">{{ l.emptyLayer ? '0 B' : formatBytes(l.size) }}</span>
            </li>
          </ol>
        </div>

        <div v-if="image">
          <h3
            class="section-title"
            style="margin-bottom:8px"
          >
            Labels
          </h3>
          <dl
            v-if="labels.length"
            class="labels"
          >
            <div
              v-for="[k, v] in labels"
              :key="k"
            >
              <dt class="mono">
                {{ k }}
              </dt>
              <dd class="mono">
                {{ v }}
              </dd>
            </div>
          </dl>
          <p
            v-else
            class="muted"
            style="margin:0;font-size:12px"
          >
            No labels.
          </p>
        </div>

        <div v-if="image">
          <h3
            class="section-title"
            style="margin-bottom:8px"
          >
            Config
          </h3>
          <dl class="labels">
            <div v-if="image.config.entrypoint">
              <dt class="mono">
                Entrypoint
              </dt><dd class="mono">
                {{ image.config.entrypoint.join(' ') }}
              </dd>
            </div>
            <div v-if="image.config.cmd">
              <dt class="mono">
                Cmd
              </dt><dd class="mono">
                {{ image.config.cmd.join(' ') }}
              </dd>
            </div>
            <div v-if="image.config.workingDir">
              <dt class="mono">
                WorkingDir
              </dt><dd class="mono">
                {{ image.config.workingDir }}
              </dd>
            </div>
            <div v-if="image.config.user">
              <dt class="mono">
                User
              </dt><dd class="mono">
                {{ image.config.user }}
              </dd>
            </div>
            <div v-if="image.config.exposedPorts.length">
              <dt class="mono">
                ExposedPorts
              </dt><dd class="mono">
                {{ image.config.exposedPorts.join(', ') }}
              </dd>
            </div>
            <div v-if="image.config.env.length">
              <dt class="mono">
                Env
              </dt><dd class="mono">
                <div
                  v-for="e in image.config.env"
                  :key="e"
                >
                  {{ e }}
                </div>
              </dd>
            </div>
          </dl>
        </div>
      </template>
    </div>
  </aside>
</template>
