import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * Tiny JSON-file store. Everything lives in NUXT_DATA_DIR (default ./data,
 * /data inside Docker) so a single volume keeps activities, health data and Garmin tokens.
 *
 * Layout:
 *   activities.json   Activity summaries, keyed by id (= start time, unix seconds)
 *   details.json      Heavier per-activity data (best efforts, power curve, HR zones)
 *   health.json       Daily wellness data from Garmin Connect, keyed by YYYY-MM-DD
 *   garmin_meta.json  Activity names / Garmin ids, keyed by start time (from Connect or the export)
 *   meta.json         Sync bookkeeping
 *   fit/              Original FIT files (kept so they can be re-processed after an update)
 *   inbox/            Files waiting to be imported (uploads, Garmin downloads)
 *   garmin/           Garmin Connect tokens + sync state (written by the Python helper)
 */

export interface BestEffort {
  name: string
  distance: number
  elapsed_time: number
  moving_time: number
  start_date_local: string
}

export interface ActivityDetail {
  best_efforts?: BestEffort[]
  /** best average power over N seconds, e.g. { "5": 812, "60": 420 } */
  best_power?: Record<string, number>
  /** seconds spent in each HR zone, plus the zone upper bounds (bpm) the watch used */
  hr_zones?: { times: number[]; bounds?: number[] }
  laps?: number
}

export interface Activity {
  /** start time in unix seconds; unique per activity */
  id: number
  garmin_id?: number
  name: string
  sport_type: string
  /** raw FIT sport / sub-sport, e.g. "running" / "trail" */
  fit_sport?: string
  fit_sub_sport?: string
  start_date: string // ISO UTC
  start_date_local: string // local wall time encoded as ISO with a fake "Z"
  distance: number
  moving_time: number
  elapsed_time: number
  total_elevation_gain: number
  total_descent?: number
  elev_high?: number
  elev_low?: number
  average_speed: number
  max_speed: number
  average_heartrate?: number
  max_heartrate?: number
  min_heartrate?: number
  average_cadence?: number
  max_cadence?: number
  average_watts?: number
  weighted_average_watts?: number
  max_watts?: number
  kilojoules?: number
  device_watts?: boolean
  calories?: number
  training_load?: number
  aerobic_te?: number
  anaerobic_te?: number
  // running dynamics
  stride_length?: number // m
  vertical_oscillation?: number // mm
  ground_contact_time?: number // ms
  vertical_ratio?: number // %
  gct_balance?: number // % left
  avg_respiration?: number // breaths/min
  avg_temp?: number
  max_temp?: number
  min_temp?: number
  avg_gap_speed?: number // grade adjusted speed, m/s
  rpe?: number
  feel?: number
  trainer: boolean
  race: boolean
  device_name?: string
  start_latlng?: [number, number] | []
  polyline?: string
  source: 'fit' | 'garmin'
  imported_at: number
}

export interface HealthDay {
  date: string
  steps?: number
  step_goal?: number
  distance?: number
  kcal_total?: number
  kcal_active?: number
  rhr?: number
  hr_min?: number
  hr_max?: number
  stress_avg?: number
  stress_max?: number
  bb_high?: number
  bb_low?: number
  bb_charged?: number
  bb_drained?: number
  floors?: number
  mod_min?: number
  vig_min?: number
  sleep_s?: number
  deep_s?: number
  light_s?: number
  rem_s?: number
  awake_s?: number
  sleep_score?: number
  sleep_start?: number
  sleep_end?: number
  spo2?: number
  resp?: number
  hrv?: number
  hrv_weekly?: number
  hrv_status?: string
  vo2max?: number
  vo2max_cycling?: number
  /** true once the day is over and won't change any more */
  final?: boolean
  fetched_at?: number
}

export interface GarminMeta {
  id: number
  name?: string
  type?: string
  race?: boolean
  /** local start time from Connect (ISO with fake Z), used when the FIT file has no time zone */
  local?: string
}

export interface SyncMeta {
  lastSync?: number
  lastSyncError?: string
  lastImport?: number
  lastImportSummary?: string
  garmin?: {
    connected?: boolean
    fullName?: string
    displayName?: string
    lastSync?: number
    lastError?: string
    historyDone?: boolean
    healthDays?: number
    profile?: Record<string, any>
  }
  racePredictions?: { latest?: any; history?: any[] }
}

let dirReady: Promise<void> | null = null
const cache = new Map<string, unknown>()

export function dataDir() {
  return resolve(useRuntimeConfig().dataDir || './data')
}
export const dataPath = (...p: string[]) => join(dataDir(), ...p)

async function ensureDir() {
  if (!dirReady) {
    dirReady = Promise.all(['', 'fit', 'inbox', 'garmin'].map(d => fs.mkdir(dataPath(d), { recursive: true }))).then(() => {})
  }
  return dirReady
}
export const ensureDataDirs = ensureDir

export async function readJson<T>(name: string, fallback: T): Promise<T> {
  if (cache.has(name)) return cache.get(name) as T
  await ensureDir()
  try {
    const raw = await fs.readFile(dataPath(name), 'utf8')
    const value = JSON.parse(raw) as T
    cache.set(name, value)
    return value
  } catch (err: any) {
    if (err?.code !== 'ENOENT') console.error(`[store] failed to read ${name}:`, err)
    return fallback
  }
}

export async function writeJson(name: string, value: unknown) {
  await ensureDir()
  const file = dataPath(name)
  const tmp = `${file}.${process.pid}.tmp`
  await fs.writeFile(tmp, JSON.stringify(value))
  await fs.rename(tmp, file) // atomic replace
  cache.set(name, value)
}

export async function removeJson(name: string) {
  cache.delete(name)
  await fs.rm(dataPath(name), { force: true })
}

// Typed accessors -----------------------------------------------------------

export const getActivities = () => readJson<Record<string, Activity>>('activities.json', {})
export const saveActivities = (a: Record<string, Activity>) => writeJson('activities.json', a)

export const getDetails = () => readJson<Record<string, ActivityDetail>>('details.json', {})
export const saveDetails = (d: Record<string, ActivityDetail>) => writeJson('details.json', d)

export const getHealth = () => readJson<Record<string, HealthDay>>('health.json', {})
export const saveHealth = (h: Record<string, HealthDay>) => writeJson('health.json', h)

export const getGarminMeta = () => readJson<Record<string, GarminMeta>>('garmin_meta.json', {})
export const saveGarminMeta = (m: Record<string, GarminMeta>) => writeJson('garmin_meta.json', m)

export const getMeta = () => readJson<SyncMeta>('meta.json', {})
export async function updateMeta(patch: Partial<SyncMeta>) {
  const meta = await getMeta()
  await writeJson('meta.json', { ...meta, ...patch })
}
export async function updateGarminMeta(patch: Partial<NonNullable<SyncMeta['garmin']>>) {
  const meta = await getMeta()
  await writeJson('meta.json', { ...meta, garmin: { ...meta.garmin, ...patch } })
}

export async function activityList(): Promise<Activity[]> {
  const all = await getActivities()
  return Object.values(all).sort((a, b) => b.start_date.localeCompare(a.start_date))
}

/** Look up a value keyed by unix seconds, tolerating a small clock difference. */
export function findNear<T>(map: Record<string, T>, t: number, tolerance = 90): [number, T] | undefined {
  if (map[t] !== undefined) return [t, map[t]!]
  for (let d = 1; d <= tolerance; d++) {
    if (map[t - d] !== undefined) return [t - d, map[t - d]!]
    if (map[t + d] !== undefined) return [t + d, map[t + d]!]
  }
  return undefined
}
