<script setup lang="ts">
import type { HealthResponse, RepositorySummary, TagDetail, TagsResponse } from '../../shared/types/registry'

const api = useRegistry()
const ui = useUiState()
const { toast, copy, show: toastMessage } = useClipboard()

// ---------- registry health and configuration ----------
const health = ref<HealthResponse | null>(null)
async function loadHealth() {
  try {
    health.value = await api.health()
    ui.setDefaultTheme(health.value.theme)
  }
  catch (err) {
    health.value = {
      ok: false, title: 'registry', pullUrl: 'registry', deleteEnabled: false, showTagCount: false, theme: 'auto',
      catalogMinBranches: 1, catalogMaxBranches: 1, apiVersion: null, error: errorMessage(err),
    }
  }
}
const title = computed(() => health.value?.title ?? 'registry')
const pullUrl = computed(() => health.value?.pullUrl ?? title.value)
const deleteEnabled = computed(() => health.value?.deleteEnabled ?? false)
useHead({ title: computed(() => (ui.selectedImage.value ? `${ui.selectedImage.value} · ${title.value}` : `${title.value} · Registry Panel`)) })

// ---------- catalog ----------
const repositories = ref<RepositorySummary[]>([])
const catalogLoading = ref(false)
const catalogError = ref<string | null>(null)
async function loadCatalog(refresh = false) {
  catalogLoading.value = true
  catalogError.value = null
  try {
    repositories.value = (await api.repositories(refresh)).repositories
  }
  catch (err) {
    catalogError.value = errorMessage(err)
  }
  finally {
    catalogLoading.value = false
  }
}

// ---------- selected image: tag table ----------
const tagsData = ref<TagsResponse | null>(null)
const tagsLoading = ref(false)
const tagsError = ref<string | null>(null)
const checked = ref(new Set<string>())
let tagsRequest = 0

async function loadTags(name: string, refresh = false) {
  const id = ++tagsRequest
  tagsLoading.value = true
  tagsError.value = null
  try {
    const data = await api.tags(name, refresh)
    if (id !== tagsRequest) return
    tagsData.value = data
  }
  catch (err) {
    if (id !== tagsRequest) return
    tagsError.value = errorMessage(err)
    tagsData.value = null
  }
  finally {
    if (id === tagsRequest) tagsLoading.value = false
  }
}

watch(ui.selectedImage, (name, prev) => {
  if (name === prev) return
  checked.value = new Set()
  tagsData.value = null
  if (name) {
    loadTags(name)
    // make sure the sidebar shows the selected image
    const parts = name.split('/')
    const groups: string[] = []
    for (let i = 1; i < parts.length; i++) groups.push(parts.slice(0, i).join('/') + '/')
    ui.expandGroups(groups)
  }
}, { immediate: true })

// ---------- drawer ----------
const detail = ref<TagDetail | null>(null)
const detailLoading = ref(false)
const detailError = ref<string | null>(null)
let detailRequest = 0

watch([ui.selectedImage, ui.openTag], async ([name, tag]) => {
  const id = ++detailRequest
  detail.value = null
  detailError.value = null
  if (!name || !tag) return
  detailLoading.value = true
  try {
    const d = await api.tagDetail(name, tag)
    if (id === detailRequest) detail.value = d
  }
  catch (err) {
    if (id === detailRequest) detailError.value = errorMessage(err)
  }
  finally {
    if (id === detailRequest) detailLoading.value = false
  }
}, { immediate: true })

// ---------- selection and deletion ----------
function check(tag: string, on: boolean) {
  const next = new Set(checked.value)
  if (on) next.add(tag)
  else next.delete(tag)
  checked.value = next
}
function checkAll(tags: string[], on: boolean) {
  const next = new Set(checked.value)
  for (const t of tags) {
    if (on) next.add(t)
    else next.delete(t)
  }
  checked.value = next
}

const confirmTags = ref<string[] | null>(null)
const deleting = ref(false)
const deleteError = ref<string | null>(null)

function askDelete(tags: string[]) {
  if (!deleteEnabled.value || !tags.length) return
  deleteError.value = null
  confirmTags.value = tags
}

async function confirmDelete() {
  const name = ui.selectedImage.value
  const tags = confirmTags.value
  const rows = tagsData.value?.tags ?? []
  if (!name || !tags) return
  // DELETE once per unique digest, never per tag
  const digests = [...new Set(rows.filter(r => tags.includes(r.tag)).map(r => r.digest))]
  deleting.value = true
  deleteError.value = null
  const removed: string[] = []
  try {
    for (const digest of digests) {
      const res = await api.deleteManifest(name, digest)
      removed.push(...res.tags)
    }
    confirmTags.value = null
    checked.value = new Set()
    if (ui.openTag.value && removed.includes(ui.openTag.value)) await ui.openTagDrawer(null)
    toastMessage(`Deleted ${removed.length} ${removed.length === 1 ? 'tag' : 'tags'}`)
  }
  catch (err) {
    deleteError.value = errorMessage(err)
  }
  finally {
    deleting.value = false
    await loadTags(name, true)
  }
}

// ---------- keyboard ----------
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && !confirmTags.value && ui.openTag.value) ui.openTagDrawer(null)
}

onMounted(() => {
  loadHealth()
  loadCatalog()
  window.addEventListener('keydown', onKey)
})
onUnmounted(() => window.removeEventListener('keydown', onKey))

function refreshAll() {
  loadHealth()
  loadCatalog(true)
}
</script>

<template>
  <div class="app">
    <TopBar
      :health="health"
      :title="title"
      @home="ui.selectImage(null)"
      @toggle-theme="ui.toggleTheme()"
    />
    <div class="layout">
      <RepoTree
        :repositories="repositories"
        :loading="catalogLoading"
        :error="catalogError"
        :selected="ui.selectedImage.value"
        :expanded="ui.state.value.expanded"
        :show-tag-count="health?.showTagCount ?? false"
        :min-branches="health?.catalogMinBranches ?? 1"
        :max-branches="health?.catalogMaxBranches ?? 1"
        @select="ui.selectImage($event)"
        @toggle="ui.toggleGroup($event)"
        @refresh="loadCatalog(true)"
      />

      <section class="content">
        <template v-if="ui.selectedImage.value">
          <ImageHeader
            :name="ui.selectedImage.value"
            :title="title"
            :pull-url="pullUrl"
            :data="tagsData"
            @home="ui.selectImage(null)"
            @copy="copy($event)"
          />
          <TagTable
            :name="ui.selectedImage.value"
            :pull-url="pullUrl"
            :tags="tagsData?.tags ?? []"
            :loading="tagsLoading"
            :error="tagsError"
            :open-tag="ui.openTag.value"
            :checked="checked"
            :sort="ui.state.value.sort"
            :delete-enabled="deleteEnabled"
            @open="ui.openTagDrawer($event)"
            @copy="copy($event)"
            @remove="askDelete($event)"
            @check="check"
            @check-all="checkAll"
            @clear="checked = new Set()"
            @sort="ui.setSort($event)"
            @refresh="loadTags(ui.selectedImage.value, true)"
          />
        </template>
        <OverviewPanel
          v-else
          :health="health"
          :title="title"
          :repositories="repositories"
          :loading="catalogLoading"
          @refresh="refreshAll"
        />
      </section>

      <TagDrawer
        v-if="ui.selectedImage.value && ui.openTag.value"
        :name="ui.selectedImage.value"
        :tag="ui.openTag.value"
        :pull-url="pullUrl"
        :detail="detail"
        :loading="detailLoading"
        :error="detailError"
        :delete-enabled="deleteEnabled"
        @close="ui.openTagDrawer(null)"
        @copy="copy($event)"
        @remove="askDelete([$event])"
      />
    </div>

    <DeleteDialog
      v-if="confirmTags && ui.selectedImage.value"
      :name="ui.selectedImage.value"
      :tags="confirmTags"
      :rows="tagsData?.tags ?? []"
      :busy="deleting"
      :error="deleteError"
      @cancel="confirmTags = null"
      @confirm="confirmDelete"
    />

    <div
      v-if="toast"
      class="toast"
      role="status"
    >
      {{ toast }}
    </div>
  </div>
</template>
