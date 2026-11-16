import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * Tiny JSON-file store. Everything lives in NUXT_DATA_DIR (default ./data,
 * /data inside Docker) so a single volume keeps tokens + synced activities.
 */

export interface StravaTokens {
  access_token: string
  refresh_token: string
  expires_at: number
  athlete_id: number
  scope?: string
}

export interface BestEffort {
  name: string
  distance: number
  elapsed_time: number
  moving_time: number
  start_date_local: string
  pr_rank: number | null
}

export interface ActivityDetail {
  calories?: number
  device_name?: string
  best_efforts?: BestEffort[]
  fetched_at: number
}

export interface Activity {
  id: number
  name: string
  sport_type: string
  type: string
  start_date: string
  start_date_local: string
  distance: number
  moving_time: number
  elapsed_time: number
  total_elevation_gain: number
  elev_high?: number
  elev_low?: number
  average_speed: number
  max_speed: number
  average_heartrate?: number
  max_heartrate?: number
  average_cadence?: number
  average_watts?: number
  weighted_average_watts?: number
  max_watts?: number
  kilojoules?: number
  device_watts?: boolean
  suffer_score?: number
  kudos_count: number
  comment_count: number
  achievement_count: number
  pr_count: number
  athlete_count: number
  photo_count: number
  trainer: boolean
  commute: boolean
  manual: boolean
  private: boolean
  gear_id?: string | null
  workout_type?: number | null
  average_temp?: number
  start_latlng?: [number, number] | []
  polyline?: string
}

export interface SyncMeta {
  lastSync?: number
  lastSyncError?: string
  lastDetailSync?: number
  rateLimit?: { shortUsage: number; shortLimit: number; dailyUsage: number; dailyLimit: number; at: number }
}

let dirReady: Promise<void> | null = null
const cache = new Map<string, unknown>()

export function dataDir() {
  return resolve(useRuntimeConfig().dataDir || './data')
}

async function ensureDir() {
  if (!dirReady) dirReady = fs.mkdir(dataDir(), { recursive: true }).then(() => {})
  return dirReady
}

export async function readJson<T>(name: string, fallback: T): Promise<T> {
  if (cache.has(name)) return cache.get(name) as T
  await ensureDir()
  try {
    const raw = await fs.readFile(join(dataDir(), name), 'utf8')
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
  const file = join(dataDir(), name)
  const tmp = `${file}.${process.pid}.tmp`
  await fs.writeFile(tmp, JSON.stringify(value))
  await fs.rename(tmp, file) // atomic replace
  cache.set(name, value)
}

export async function removeJson(name: string) {
  cache.delete(name)
  await fs.rm(join(dataDir(), name), { force: true })
}

// Typed accessors -----------------------------------------------------------

export const getTokens = () => readJson<StravaTokens | null>('tokens.json', null)
export const saveTokens = (t: StravaTokens) => writeJson('tokens.json', t)

export const getActivities = () => readJson<Record<string, Activity>>('activities.json', {})
export const saveActivities = (a: Record<string, Activity>) => writeJson('activities.json', a)

export const getDetails = () => readJson<Record<string, ActivityDetail>>('details.json', {})
export const saveDetails = (d: Record<string, ActivityDetail>) => writeJson('details.json', d)

export const getAthlete = () => readJson<any | null>('athlete.json', null)
export const getAthleteStats = () => readJson<any | null>('athlete_stats.json', null)
export const getZones = () => readJson<any | null>('zones.json', null)

export const getMeta = () => readJson<SyncMeta>('meta.json', {})
export async function updateMeta(patch: Partial<SyncMeta>) {
  const meta = await getMeta()
  await writeJson('meta.json', { ...meta, ...patch })
}

export async function activityList(): Promise<Activity[]> {
  const all = await getActivities()
  return Object.values(all).sort((a, b) => b.start_date.localeCompare(a.start_date))
}
