import type { Units } from '~/composables/useDashboard'

const KM = 1000
const MI = 1609.344
const FT = 0.3048

export const PACE_SPORTS = new Set(['Run', 'TrailRun', 'VirtualRun', 'Walk', 'Hike'])
export const SWIM_SPORTS = new Set(['Swim'])

export function nf(v: number, digits = 0) {
  return Number.isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits }) : '–'
}

export function distUnit(u: Units) { return u === 'imperial' ? 'mi' : 'km' }
export function elevUnit(u: Units) { return u === 'imperial' ? 'ft' : 'm' }
export function toDist(m: number, u: Units) { return m / (u === 'imperial' ? MI : KM) }
export function toElev(m: number, u: Units) { return u === 'imperial' ? m / FT : m }

export function fmtDist(m: number | null | undefined, u: Units, digits?: number) {
  if (m == null) return '–'
  const v = toDist(m, u)
  return `${nf(v, digits ?? (v >= 1000 ? 0 : v >= 100 ? 1 : 2))} ${distUnit(u)}`
}
export function fmtElev(m: number | null | undefined, u: Units) {
  if (m == null) return '–'
  return `${nf(toElev(m, u))} ${elevUnit(u)}`
}

/** 3725 -> "1h 02m"; for long totals "123h". */
export function fmtDuration(s: number | null | undefined, opts: { long?: boolean } = {}) {
  if (s == null || !Number.isFinite(s)) return '–'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  if (opts.long && h >= 100) return `${nf(h)}h`
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m) return `${m}m ${String(sec).padStart(2, '0')}s`
  return `${sec}s`
}

/** Race-clock style: 1:23:45 or 23:45 */
export function fmtClock(s: number | null | undefined) {
  if (s == null || !Number.isFinite(s)) return '–'
  const t = Math.round(s) // round first so 359.6s becomes 6:00, not 5:60
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const sec = t % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}

/** Speed for rides, pace for runs/walks/hikes, per-100 for swims. */
export function fmtSpeed(mps: number | null | undefined, u: Units, sport?: string) {
  if (!mps) return '–'
  if (sport && SWIM_SPORTS.has(sport)) {
    const per = u === 'imperial' ? 91.44 : 100
    return `${fmtClock(per / mps)} /100${u === 'imperial' ? 'yd' : 'm'}`
  }
  if (sport && PACE_SPORTS.has(sport)) return `${fmtClock((u === 'imperial' ? MI : KM) / mps)} /${distUnit(u)}`
  return `${nf(mps * 3.6 / (u === 'imperial' ? 1.609344 : 1), 1)} ${u === 'imperial' ? 'mph' : 'km/h'}`
}

/** Numeric value for charts: pace in minutes per unit or speed per hour. */
export function speedValue(mps: number, u: Units, pace: boolean) {
  if (!mps) return null
  if (pace) return (u === 'imperial' ? MI : KM) / mps / 60
  return mps * 3.6 / (u === 'imperial' ? 1.609344 : 1)
}

export function fmtDate(s: string | null | undefined, opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' }) {
  if (!s) return '–'
  // start_date_local is wall-clock time; format as UTC so it isn't shifted.
  return new Date(s.length <= 10 ? `${s}T00:00:00Z` : s).toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' })
}

export function relTime(ms?: number) {
  if (!ms) return 'never'
  const diff = (Date.now() - ms) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`
  return `${Math.floor(diff / 86400)} d ago`
}

export function sportLabel(s: string) {
  if (s === 'all') return 'All sports'
  if (s === 'AllRuns') return 'All runs'
  if (s === 'AllRides') return 'All rides'
  return s.replace(/([a-z])([A-Z])/g, '$1 $2').replace('E Bike', 'E-Bike').replace('E Mountain', 'E-Mountain')
}

export function isPaceSport(sport: string) {
  return PACE_SPORTS.has(sport) || sport === 'AllRuns'
}

/** Link to the activity on Garmin Connect (only known once synced from Connect or imported from the Garmin export). */
export const garminUrl = (gid?: number | null) => (gid ? `https://connect.garmin.com/modern/activity/${gid}` : undefined)
