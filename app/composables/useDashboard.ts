export type Units = 'metric' | 'imperial'
export type Theme = 'auto' | 'light' | 'dark'

function stored<T extends string>(key: string, fallback: T): T {
  if (import.meta.server) return fallback
  try { return (localStorage.getItem(key) as T) || fallback } catch { return fallback }
}
function persist(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* private mode */ }
}

/** Global filters shared by every page (sport, year, units, theme). */
export function useFilters() {
  const sport = useState<string>('f-sport', () => stored<string>('sa-sport', 'all'))
  const year = useState<string>('f-year', () => stored<string>('sa-year', 'all'))
  const units = useState<Units>('f-units', () => stored<Units>('sa-units', 'metric'))
  const theme = useState<Theme>('f-theme', () => stored<Theme>('sa-theme', 'auto'))
  const themeTick = useState('f-theme-tick', () => 0) // bump to force chart re-render

  if (import.meta.client) {
    watch(sport, v => persist('sa-sport', v))
    watch(year, v => persist('sa-year', v))
    watch(units, v => persist('sa-units', v))
  }
  const query = computed(() => ({ sport: sport.value, year: year.value }))
  return { sport, year, units, theme, themeTick, query }
}

export interface Status {
  passwordProtected: boolean
  activityCount: number
  healthDays: number
  sports: string[]
  years: string[]
  devices: string[]
  garmin: {
    available: boolean
    loggedIn: boolean
    connected?: boolean
    fullName?: string
    displayName?: string
    lastSync?: number
    lastError?: string
    historyDone?: boolean
    profile?: Record<string, any>
  }
  importDir: string | null
  sync: {
    running: boolean
    phase: string
    message: string
    done: number
    total: number
    lastSync?: number
    lastSyncError?: string
    lastImport?: number
    lastImportSummary?: string
  }
  syncIntervalMinutes: number
}

export function useStatus() {
  return useFetch<Status>('/api/status', { key: 'status', server: false })
}

/** Increments whenever a sync finishes so pages can refetch. */
export function useDataVersion() {
  return useState('data-version', () => 0)
}

/** Aggregated statistics for the current filters; refetches after each sync. */
export function useStats() {
  const { query } = useFilters()
  const version = useDataVersion()
  return useFetch<any>('/api/stats', {
    query,
    key: computed(() => `stats-${query.value.sport}-${query.value.year}-${version.value}`),
    server: false,
  })
}

/** Daily health data (Garmin Connect) for the last `days` days. */
export function useWellness(days: Ref<number> | number = 365) {
  const version = useDataVersion()
  const d = computed(() => unref(days))
  return useFetch<any>('/api/wellness', {
    query: computed(() => ({ days: d.value })),
    key: computed(() => `wellness-${d.value}-${version.value}`),
    server: false,
  })
}
