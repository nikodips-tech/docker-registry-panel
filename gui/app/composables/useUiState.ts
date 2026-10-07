/**
 * Persistent UI state (docs/03, "Stato in URL e persistenza"):
 * - URL query: selected image and open tag (shareable, back button works)
 * - localStorage: expanded namespaces, theme chosen by the user, preferred sort
 * The THEME environment variable (served by /api/registry/health) is the default
 * until the user toggles the theme.
 */

export type Theme = 'auto' | 'light' | 'dark'
export type SortMode = 'date' | 'name'

interface Persisted {
  expanded: Record<string, boolean>
  /** null = never chosen, follow the server default */
  theme: Theme | null
  sort: SortMode
}

const LS_KEY = 'registry-gui'

function load(): Persisted {
  const base: Persisted = { expanded: {}, theme: null, sort: 'date' }
  if (!import.meta.client) return base
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return base
    const saved = JSON.parse(raw) as Partial<Persisted>
    return {
      expanded: saved.expanded && typeof saved.expanded === 'object' ? saved.expanded : {},
      theme: saved.theme === 'light' || saved.theme === 'dark' || saved.theme === 'auto' ? saved.theme : null,
      sort: saved.sort === 'name' ? 'name' : 'date',
    }
  }
  catch {
    return base
  }
}

function save(state: Persisted): void {
  if (!import.meta.client) return
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state))
  }
  catch {
    // storage unavailable: state simply lives in memory
  }
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement
  if (theme === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}

export function useUiState() {
  const state = useState<Persisted>('ui-state', load)
  const defaultTheme = useState<Theme>('ui-default-theme', () => 'auto')
  const effectiveTheme = computed<Theme>(() => state.value.theme ?? defaultTheme.value)

  if (import.meta.client) {
    watch(state, save, { deep: true })
    watch(effectiveTheme, applyTheme, { immediate: true })
  }

  const route = useRoute()
  const router = useRouter()

  const selectedImage = computed<string | null>(() => {
    const v = route.query.image
    return typeof v === 'string' && v ? v : null
  })
  const openTag = computed<string | null>(() => {
    const v = route.query.tag
    return typeof v === 'string' && v ? v : null
  })

  function navigate(image: string | null, tag: string | null = null): Promise<unknown> {
    const query: Record<string, string> = {}
    if (image) query.image = image
    if (image && tag) query.tag = tag
    return router.push({ query })
  }

  function isDarkNow(): boolean {
    if (effectiveTheme.value === 'dark') return true
    if (effectiveTheme.value === 'light') return false
    return import.meta.client ? window.matchMedia('(prefers-color-scheme: dark)').matches : false
  }

  return {
    state,
    effectiveTheme,
    selectedImage,
    openTag,
    selectImage: (image: string | null) => navigate(image, null),
    openTagDrawer: (tag: string | null) => navigate(selectedImage.value, tag),
    openImageTag: (image: string, tag: string) => navigate(image, tag),
    toggleGroup(name: string) {
      state.value.expanded[name] = !state.value.expanded[name]
    },
    expandGroups(names: string[]) {
      for (const n of names) state.value.expanded[n] = true
    },
    isExpanded: (name: string) => !!state.value.expanded[name],
    setDefaultTheme(theme: Theme) {
      defaultTheme.value = theme
    },
    toggleTheme() {
      state.value.theme = isDarkNow() ? 'light' : 'dark'
    },
    setSort(sort: SortMode) {
      state.value.sort = sort
    },
  }
}
