import type { Activity, ActivityDetail } from './store'

/** All dates use start_date_local: local wall time encoded as ISO with a fake "Z". */
const ymd = (a: Activity) => a.start_date_local.slice(0, 10)
const year = (a: Activity) => Number(a.start_date_local.slice(0, 4))
const month = (a: Activity) => a.start_date_local.slice(0, 7)
const hour = (a: Activity) => Number(a.start_date_local.slice(11, 13))
const dayMs = 86_400_000

function utcDate(s: string) {
  return new Date(`${s.slice(0, 10)}T00:00:00Z`)
}
/** 0 = Monday ... 6 = Sunday */
function weekday(s: string) {
  return (utcDate(s).getUTCDay() + 6) % 7
}
function mondayOf(s: string) {
  const d = utcDate(s)
  return new Date(d.getTime() - weekday(s) * dayMs).toISOString().slice(0, 10)
}
function dayOfYear(s: string) {
  const d = utcDate(s)
  return Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / dayMs)
}
function addDays(s: string, n: number) {
  return new Date(utcDate(s).getTime() + n * dayMs).toISOString().slice(0, 10)
}

interface Agg {
  count: number
  distance: number
  moving_time: number
  elapsed_time: number
  elevation: number
  calories: number
  kilojoules: number
  load: number
  hrTime: number // moving_time weighted HR sum
  hrSeconds: number
}
const emptyAgg = (): Agg => ({ count: 0, distance: 0, moving_time: 0, elapsed_time: 0, elevation: 0, calories: 0, kilojoules: 0, load: 0, hrTime: 0, hrSeconds: 0 })
function add(agg: Agg, a: Activity) {
  agg.count++
  agg.distance += a.distance
  agg.moving_time += a.moving_time
  agg.elapsed_time += a.elapsed_time
  agg.elevation += a.total_elevation_gain
  agg.calories += a.calories || 0
  agg.kilojoules += a.kilojoules || 0
  agg.load += a.training_load || 0
  if (a.average_heartrate) {
    agg.hrTime += a.average_heartrate * a.moving_time
    agg.hrSeconds += a.moving_time
  }
}
const finish = (agg: Agg) => ({
  count: agg.count,
  distance: agg.distance,
  moving_time: agg.moving_time,
  elapsed_time: agg.elapsed_time,
  elevation: agg.elevation,
  calories: agg.calories,
  kilojoules: agg.kilojoules,
  load: agg.load,
  avg_speed: agg.moving_time ? agg.distance / agg.moving_time : 0,
  avg_hr: agg.hrSeconds ? agg.hrTime / agg.hrSeconds : null,
})

function groupBy<K extends string | number>(list: Activity[], key: (a: Activity) => K) {
  const map = new Map<K, Agg>()
  for (const a of list) {
    const k = key(a)
    if (!map.has(k)) map.set(k, emptyAgg())
    add(map.get(k)!, a)
  }
  return map
}

const pick = (a: Activity | undefined) =>
  a && {
    id: a.id,
    garmin_id: a.garmin_id,
    name: a.name,
    sport_type: a.sport_type,
    date: a.start_date_local,
    distance: a.distance,
    moving_time: a.moving_time,
    elevation: a.total_elevation_gain,
    average_speed: a.average_speed,
  }

function maxBy(list: Activity[], f: (a: Activity) => number | undefined | null) {
  let best: Activity | undefined
  let bestV = -Infinity
  for (const a of list) {
    const v = f(a)
    if (v != null && Number.isFinite(v) && v > bestV) {
      bestV = v
      best = a
    }
  }
  return best ? { ...pick(best)!, value: bestV } : null
}

export function eddington(daily: number[], unit: number) {
  const vals = daily.map(d => d / unit).sort((a, b) => b - a)
  let e = 0
  while (e < vals.length && vals[e]! >= e + 1) e++
  // how many more days needed for E+1
  const target = e + 1
  const have = vals.filter(v => v >= target).length
  return { value: e, next: target, daysForNext: Math.max(0, target - have) }
}

function streaks(days: string[]) {
  const set = new Set(days)
  const sorted = [...set].sort()
  let longest = 0
  let longestStart = ''
  let longestEnd = ''
  let run = 0
  let runStart = ''
  let prev = ''
  for (const d of sorted) {
    if (prev && addDays(prev, 1) === d) run++
    else {
      run = 1
      runStart = d
    }
    if (run > longest) {
      longest = run
      longestStart = runStart
      longestEnd = d
    }
    prev = d
  }
  // current: ending today or yesterday
  const today = new Date().toISOString().slice(0, 10)
  let cursor = set.has(today) ? today : addDays(today, -1)
  let current = 0
  while (set.has(cursor)) {
    current++
    cursor = addDays(cursor, -1)
  }

  // weekly streak (consecutive weeks with ≥1 activity)
  const weeks = [...new Set(sorted.map(mondayOf))].sort()
  let wLongest = 0
  let wRun = 0
  let wPrev = ''
  for (const w of weeks) {
    wRun = wPrev && addDays(wPrev, 7) === w ? wRun + 1 : 1
    wLongest = Math.max(wLongest, wRun)
    wPrev = w
  }
  const thisWeek = mondayOf(today)
  let wc = weeks.includes(thisWeek) ? thisWeek : addDays(thisWeek, -7)
  const wset = new Set(weeks)
  let wCurrent = 0
  while (wset.has(wc)) {
    wCurrent++
    wc = addDays(wc, -7)
  }

  return {
    longestDays: longest,
    longestDaysFrom: longestStart,
    longestDaysTo: longestEnd,
    currentDays: current,
    longestWeeks: wLongest,
    currentWeeks: wCurrent,
    activeDays: set.size,
  }
}

const HIST_METRIC = [0, 2, 5, 10, 15, 21.1, 30, 42.2, 60, 100, 150, 200].map(k => k * 1000)
const HIST_IMPERIAL = [0, 1, 3, 5, 10, 13.1, 20, 26.2, 40, 62, 100, 125].map(m => m * 1609.344)
function histogram(values: number[], edges: number[]) {
  const counts = new Array(edges.length).fill(0)
  for (const v of values) {
    let i = edges.length - 1
    while (i > 0 && v < edges[i]!) i--
    counts[i]++
  }
  return { edges, counts }
}

export const BEST_EFFORT_ORDER = ['400m', '1/2 mile', '1K', '1 mile', '2 mile', '5K', '10K', '15K', '10 mile', '20K', 'Half-Marathon', '30K', 'Marathon', '50K']

export interface StatsFilter {
  sport?: string
  year?: string
}

export function filterActivities(all: Activity[], f: StatsFilter) {
  return all.filter(a => {
    if (f.sport && f.sport !== 'all') {
      if (f.sport === 'AllRuns') {
        if (!['Run', 'TrailRun', 'VirtualRun'].includes(a.sport_type)) return false
      } else if (f.sport === 'AllRides') {
        if (!['Ride', 'VirtualRide', 'GravelRide', 'MountainBikeRide', 'EBikeRide', 'EMountainBikeRide', 'Velomobile'].includes(a.sport_type)) return false
      } else if (a.sport_type !== f.sport) return false
    }
    if (f.year && f.year !== 'all' && String(year(a)) !== f.year) return false
    return true
  })
}

export function computeStats(all: Activity[], details: Record<string, ActivityDetail>, filter: StatsFilter) {
  const sportOnly = filterActivities(all, { sport: filter.sport })
  const list = filterActivities(all, filter)
  const totals = emptyAgg()
  list.forEach(a => add(totals, a))

  // --- Breakdowns -----------------------------------------------------------------
  const bySport = [...groupBy(filterActivities(all, { year: filter.year }), a => a.sport_type)]
    .map(([sport, agg]) => ({ sport, ...finish(agg) }))
    .sort((a, b) => b.moving_time - a.moving_time)

  const byYear = [...groupBy(sportOnly, year)].map(([y, agg]) => ({ year: y, ...finish(agg) })).sort((a, b) => a.year - b.year)

  // monthly: continuous series between first and last month
  const monthMap = groupBy(list, month)
  const months = [...monthMap.keys()].sort()
  const monthly: any[] = []
  if (months.length) {
    let [y, m] = months[0]!.split('-').map(Number) as [number, number]
    const last = months.at(-1)!
    for (;;) {
      const key = `${y}-${String(m).padStart(2, '0')}`
      monthly.push({ month: key, ...finish(monthMap.get(key) ?? emptyAgg()) })
      if (key === last) break
      m++
      if (m > 12) { m = 1; y++ }
    }
  }

  // per-sport monthly series aligned with `monthly` (for stacked charts)
  const monthIndex = new Map(monthly.map((m, i) => [m.month as string, i]))
  const monthlyBySport: Record<string, { distance: number[]; time: number[] }> = {}
  for (const a of list) {
    const s = (monthlyBySport[a.sport_type] ??= { distance: new Array(monthly.length).fill(0), time: new Array(monthly.length).fill(0) })
    const i = monthIndex.get(month(a))!
    s.distance[i]! += a.distance
    s.time[i]! += a.moving_time
  }

  // weekly: last 52 weeks for "all", or every week of the selected year
  const weekMap = groupBy(list, a => mondayOf(a.start_date_local))
  const weekly: any[] = []
  const todayStr = new Date().toISOString().slice(0, 10)
  let wStart: string
  let wEnd: string
  if (filter.year && filter.year !== 'all') {
    wStart = mondayOf(`${filter.year}-01-01`)
    wEnd = Number(filter.year) === new Date().getUTCFullYear() ? mondayOf(todayStr) : mondayOf(`${filter.year}-12-31`)
  } else {
    wEnd = mondayOf(todayStr)
    wStart = addDays(wEnd, -51 * 7)
  }
  for (let w = wStart; w <= wEnd; w = addDays(w, 7)) weekly.push({ week: w, ...finish(weekMap.get(w) ?? emptyAgg()) })

  const dow = Array.from({ length: 7 }, () => emptyAgg())
  const hod = Array.from({ length: 24 }, () => emptyAgg())
  const punchcard = Array.from({ length: 7 }, () => new Array(24).fill(0))
  for (const a of list) {
    const d = weekday(a.start_date_local)
    const h = hour(a)
    add(dow[d]!, a)
    add(hod[h]!, a)
    punchcard[d]![h]++
  }

  // daily totals (calendar heatmap + eddington + streaks)
  const daily = new Map<string, { distance: number; time: number; count: number }>()
  for (const a of list) {
    const k = ymd(a)
    const v = daily.get(k) ?? { distance: 0, time: 0, count: 0 }
    v.distance += a.distance
    v.time += a.moving_time
    v.count++
    daily.set(k, v)
  }
  let calStart: string
  let calEnd: string
  if (filter.year && filter.year !== 'all') {
    calStart = `${filter.year}-01-01`
    calEnd = `${filter.year}-12-31`
  } else {
    calEnd = todayStr
    calStart = addDays(todayStr, -364)
  }
  const calendar: { date: string; distance: number; time: number; count: number }[] = []
  for (let d = calStart; d <= calEnd; d = addDays(d, 1)) calendar.push({ date: d, ...(daily.get(d) ?? { distance: 0, time: 0, count: 0 }) })

  // Year-over-year cumulative distance (ignores the year filter)
  const yoy: Record<string, number[]> = {}
  for (const a of [...sportOnly].sort((x, y) => x.start_date_local.localeCompare(y.start_date_local))) {
    const y = String(year(a))
    yoy[y] ??= new Array(366).fill(0)
    yoy[y]![dayOfYear(a.start_date_local)]! += a.distance
  }
  for (const y of Object.keys(yoy)) {
    const arr = yoy[y]!
    for (let i = 1; i < 366; i++) arr[i]! += arr[i - 1]!
    // cut the current year at today so the line stops
    if (Number(y) === new Date().getUTCFullYear()) arr.splice(dayOfYear(todayStr) + 1)
  }

  // --- Records -------------------------------------------------------------------
  const withDist = list.filter(a => a.distance > 0)
  const minDist = (a: Activity) => a.distance >= 1000 && a.moving_time > 0
  const runs = list.filter(a => RUN_SPORTS.includes(a.sport_type))
  const records = {
    longestDistance: maxBy(list, a => a.distance),
    longestTime: maxBy(list, a => a.moving_time),
    mostElevation: maxBy(list, a => a.total_elevation_gain),
    fastestAvgSpeed: maxBy(list.filter(minDist), a => a.average_speed),
    topSpeed: maxBy(list.filter(a => !a.trainer), a => a.max_speed),
    steepest: maxBy(list.filter(a => a.distance >= 3000), a => a.total_elevation_gain / a.distance * 1000),
    highestAvgHr: maxBy(list, a => a.average_heartrate),
    highestMaxHr: maxBy(list, a => a.max_heartrate),
    highestLoad: maxBy(list, a => a.training_load),
    highestAerobicTe: maxBy(list, a => a.aerobic_te),
    highestAnaerobicTe: maxBy(list, a => a.anaerobic_te),
    mostCalories: maxBy(list, a => a.calories),
    highestCadence: maxBy(runs.filter(a => a.moving_time >= 600), a => a.average_cadence),
    longestStride: maxBy(runs.filter(a => a.moving_time >= 600), a => a.stride_length),
    highestAvgWatts: maxBy(list.filter(a => a.device_watts), a => a.weighted_average_watts ?? a.average_watts),
    highestMaxWatts: maxBy(list.filter(a => a.device_watts), a => a.max_watts),
  }

  // Best efforts (computed from the distance stream of every run)
  const effortMap = new Map<string, any[]>()
  for (const a of list) {
    for (const e of details[a.id]?.best_efforts ?? []) {
      if (!effortMap.has(e.name)) effortMap.set(e.name, [])
      effortMap.get(e.name)!.push({ ...e, activity_id: a.id, garmin_id: a.garmin_id, activity_name: a.name })
    }
  }
  const bestEfforts = [...effortMap]
    .map(([name, efforts]) => {
      const sorted = efforts.sort((x, y) => x.moving_time - y.moving_time)
      const perYear = new Map<number, any>()
      for (const e of efforts) {
        const y = Number(e.start_date_local.slice(0, 4))
        if (!perYear.has(y) || perYear.get(y).moving_time > e.moving_time) perYear.set(y, e)
      }
      return {
        name,
        distance: sorted[0]!.distance,
        count: efforts.length,
        top: sorted.slice(0, 5),
        perYear: [...perYear].sort((a, b) => a[0] - b[0]).map(([y, e]) => ({ year: y, moving_time: e.moving_time, activity_id: e.activity_id })),
      }
    })
    .sort((a, b) => {
      const ia = BEST_EFFORT_ORDER.indexOf(a.name)
      const ib = BEST_EFFORT_ORDER.indexOf(b.name)
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.distance - b.distance
    })

  // Power curve: best average power for each duration
  const powerCurve: Record<string, { watts: number; id: number; garmin_id?: number; name: string; date: string }> = {}
  for (const a of list) {
    for (const [w, watts] of Object.entries(details[a.id]?.best_power ?? {})) {
      if (!powerCurve[w] || powerCurve[w]!.watts < watts) powerCurve[w] = { watts, id: a.id, garmin_id: a.garmin_id, name: a.name, date: a.start_date_local }
    }
  }

  // --- Heart-rate zones -------------------------------------------------------------
  const zoneTotals = [0, 0, 0, 0, 0]
  const zoneWeekly = new Map<string, number[]>()
  let zoneBounds: number[] | undefined
  let zoneBoundsDate = ''
  for (const a of list) {
    const z = details[a.id]?.hr_zones
    if (!z?.times?.length) continue
    const five = toFiveZones(z.times)
    const wk = mondayOf(a.start_date_local)
    const arr = zoneWeekly.get(wk) ?? [0, 0, 0, 0, 0]
    five.forEach((v, i) => { zoneTotals[i]! += v; arr[i]! += v })
    zoneWeekly.set(wk, arr)
    if (z.bounds?.length && a.start_date_local > zoneBoundsDate) {
      zoneBounds = z.bounds
      zoneBoundsDate = a.start_date_local
    }
  }
  const hrZones = {
    totals: zoneTotals,
    weekly: weekly.map(w => ({ week: w.week as string, times: zoneWeekly.get(w.week) ?? [0, 0, 0, 0, 0] })),
    bounds: zoneBounds,
  }

  // --- Training load: fitness (CTL, 42 d), fatigue (ATL, 7 d), form (TSB) -------------
  const trainingLoad = loadSeries(all, filter, maxHrOf(all))

  // --- Running dynamics, monthly ---------------------------------------------------------
  type Dyn = Record<'cad' | 'stride' | 'vo' | 'gct' | 'vr' | 'gap', [number, number]>
  const dynMap = new Map<string, Dyn>()
  const dynFields: [keyof Dyn, (a: Activity) => number | undefined][] = [
    ['cad', a => a.average_cadence], ['stride', a => a.stride_length], ['vo', a => a.vertical_oscillation],
    ['gct', a => a.ground_contact_time], ['vr', a => a.vertical_ratio], ['gap', a => a.avg_gap_speed],
  ]
  for (const a of runs) {
    const k = month(a)
    const v = dynMap.get(k) ?? { cad: [0, 0], stride: [0, 0], vo: [0, 0], gct: [0, 0], vr: [0, 0], gap: [0, 0] }
    for (const [key, f] of dynFields) {
      const x = f(a)
      if (x) { v[key][0] += x * a.moving_time; v[key][1] += a.moving_time }
    }
    dynMap.set(k, v)
  }
  const avgOrNull = ([sum, t]: [number, number]) => (t ? sum / t : null)
  const runningDynamics = [...dynMap].sort((a, b) => a[0].localeCompare(b[0])).map(([m, v]) => ({
    month: m,
    cadence: avgOrNull(v.cad),
    stride: avgOrNull(v.stride),
    vo: avgOrNull(v.vo),
    gct: avgOrNull(v.gct),
    vr: avgOrNull(v.vr),
    gap: avgOrNull(v.gap),
  }))

  // --- Training effect distribution --------------------------------------------------------
  const teBuckets = (f: (a: Activity) => number | undefined) => {
    const b = [0, 0, 0, 0, 0, 0] // none, minor, maintaining, improving, highly improving, overreaching
    for (const a of list) {
      const v = f(a)
      if (v == null) continue
      b[v >= 5 ? 5 : v >= 4 ? 4 : v >= 3 ? 3 : v >= 2 ? 2 : v >= 1 ? 1 : 0]!++
    }
    return b
  }
  const trainingEffect = { aerobic: teBuckets(a => a.aerobic_te), anaerobic: teBuckets(a => a.anaerobic_te) }

  // --- Misc --------------------------------------------------------------------------
  const hrValues = list.filter(a => a.average_heartrate).map(a => Math.round(a.average_heartrate!))
  const hrHist: Record<number, number> = {}
  for (const v of hrValues) {
    const b = Math.floor(v / 5) * 5
    hrHist[b] = (hrHist[b] ?? 0) + 1
  }

  const daysWithDist = [...daily.values()].map(d => d.distance)
  const firstActivity = list.reduce<Activity | undefined>((m, a) => (!m || a.start_date < m.start_date ? a : m), undefined)
  const spanDays = firstActivity ? Math.max(1, Math.round((Date.now() - new Date(firstActivity.start_date).getTime()) / dayMs)) : 0
  const periodDays = filter.year && filter.year !== 'all'
    ? (Number(filter.year) === new Date().getUTCFullYear() ? dayOfYear(todayStr) + 1 : 365)
    : spanDays

  // Scatter: distance vs speed/HR for trend analysis (latest 1500 to keep payload small)
  const scatter = withDist.slice(0, 1500).map(a => ({
    id: a.id,
    d: a.start_date_local.slice(0, 10),
    dist: a.distance,
    spd: a.average_speed,
    hr: a.average_heartrate ?? null,
    elev: a.total_elevation_gain,
    cad: a.average_cadence ?? null,
    w: a.average_watts ?? null,
  }))

  const devices = new Map<string, { count: number; first: string; last: string; time: number; distance: number }>()
  for (const a of list) {
    if (!a.device_name) continue
    const d = devices.get(a.device_name) ?? { count: 0, first: a.start_date_local, last: a.start_date_local, time: 0, distance: 0 }
    d.count++
    d.time += a.moving_time
    d.distance += a.distance
    if (a.start_date_local < d.first) d.first = a.start_date_local
    if (a.start_date_local > d.last) d.last = a.start_date_local
    devices.set(a.device_name, d)
  }

  const flags = {
    trainer: list.filter(a => a.trainer).length,
    races: list.filter(a => a.race).length,
    withHr: list.filter(a => a.average_heartrate).length,
    withPower: list.filter(a => a.device_watts).length,
    withGps: list.filter(a => a.polyline).length,
    withDynamics: list.filter(a => a.ground_contact_time).length,
    withLoad: list.filter(a => a.training_load).length,
    fromGarmin: list.filter(a => a.garmin_id).length,
  }

  const avgOf = (xs: Activity[], f: (a: Activity) => number | undefined) => {
    const v = xs.map(f).filter((x): x is number => x != null)
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null
  }

  return {
    filter,
    totals: {
      ...finish(totals),
      avg_distance: totals.count ? totals.distance / totals.count : 0,
      avg_time: totals.count ? totals.moving_time / totals.count : 0,
      avg_elevation: totals.count ? totals.elevation / totals.count : 0,
      avg_cadence: avgOf(list, a => a.average_cadence),
      avg_watts: avgOf(list, a => a.average_watts),
      avg_temp: avgOf(list, a => a.avg_temp),
      avg_aerobic_te: avgOf(list, a => a.aerobic_te),
      avg_respiration: avgOf(list, a => a.avg_respiration),
      max_hr: list.reduce((m, a) => Math.max(m, a.max_heartrate ?? 0), 0) || null,
      first: pick(firstActivity),
      periodDays,
      perWeek: periodDays ? totals.count / (periodDays / 7) : 0,
      distPerWeek: periodDays ? totals.distance / (periodDays / 7) : 0,
      timePerWeek: periodDays ? totals.moving_time / (periodDays / 7) : 0,
      paused_time: Math.max(0, totals.elapsed_time - totals.moving_time),
      everests: totals.elevation / 8848.86,
      earthLaps: totals.distance / 40_075_000,
      moonTrips: totals.distance / 384_400_000,
    },
    flags,
    bySport,
    byYear,
    monthly,
    monthlyBySport,
    weekly,
    dayOfWeek: dow.map(finish),
    hourOfDay: hod.map(finish),
    punchcard,
    calendar,
    yoy,
    records,
    bestEfforts,
    powerCurve,
    hrZones,
    trainingLoad,
    runningDynamics,
    trainingEffect,
    streaks: streaks([...daily.keys()]),
    eddington: {
      km: eddington(daysWithDist, 1000),
      mi: eddington(daysWithDist, 1609.344),
    },
    histogram: {
      metric: histogram(withDist.map(a => a.distance), HIST_METRIC),
      imperial: histogram(withDist.map(a => a.distance), HIST_IMPERIAL),
    },
    hrHistogram: Object.entries(hrHist).map(([bpm, count]) => ({ bpm: Number(bpm), count })).sort((a, b) => a.bpm - b.bpm),
    devices: [...devices].map(([name, d]) => ({ name, ...d })).sort((a, b) => b.count - a.count),
    scatter,
  }
}

const RUN_SPORTS = ['Run', 'TrailRun', 'VirtualRun']

/** Garmin's time_in_hr_zone often includes a "zone 0" (below zone 1); fold extras into zone 1. */
function toFiveZones(times: number[]) {
  if (times.length <= 5) return [...times, 0, 0, 0, 0, 0].slice(0, 5)
  const extra = times.length - 5
  const five = times.slice(extra)
  five[0]! += times.slice(0, extra).reduce((s, v) => s + v, 0)
  return five
}

function maxHrOf(all: Activity[]) {
  const vals = all.map(a => a.max_heartrate ?? 0).filter(v => v > 100).sort((a, b) => b - a)
  // 2nd-highest value guards against a one-off sensor spike
  return vals[1] ?? vals[0] ?? 190
}

/** Load of one activity: Garmin's training load (EPOC) when present, otherwise a heart-rate TRIMP estimate. */
export function activityLoad(a: Activity, maxHr: number) {
  if (a.training_load) return a.training_load
  if (!a.average_heartrate || !a.moving_time) return 0
  const rest = 60
  const hrr = Math.max(0, Math.min(1, (a.average_heartrate - rest) / Math.max(1, maxHr - rest)))
  return (a.moving_time / 60) * hrr * 0.64 * Math.exp(1.92 * hrr)
}

/** Daily load with fitness (42-day EWMA), fatigue (7-day EWMA) and form, across all sports. */
function loadSeries(all: Activity[], filter: StatsFilter, maxHr: number) {
  const byDay = new Map<string, number>()
  for (const a of all) byDay.set(ymd(a), (byDay.get(ymd(a)) ?? 0) + activityLoad(a, maxHr))
  if (!byDay.size) return []
  const todayStr = new Date().toISOString().slice(0, 10)
  let winStart: string
  let winEnd: string
  if (filter.year && filter.year !== 'all') {
    winStart = `${filter.year}-01-01`
    winEnd = Number(filter.year) === new Date().getUTCFullYear() ? todayStr : `${filter.year}-12-31`
  } else {
    winEnd = todayStr
    winStart = addDays(todayStr, -364)
  }
  const first = [...byDay.keys()].sort()[0]!
  const kA = 1 - Math.exp(-1 / 7)
  const kC = 1 - Math.exp(-1 / 42)
  let atl = 0
  let ctl = 0
  const out: { date: string; load: number; atl: number; ctl: number; tsb: number }[] = []
  for (let d = first < winStart ? first : winStart; d <= winEnd; d = addDays(d, 1)) {
    const load = byDay.get(d) ?? 0
    const tsb = ctl - atl // form is yesterday's fitness minus fatigue
    atl += (load - atl) * kA
    ctl += (load - ctl) * kC
    if (d >= winStart) out.push({ date: d, load: Math.round(load), atl: Math.round(atl * 10) / 10, ctl: Math.round(ctl * 10) / 10, tsb: Math.round(tsb * 10) / 10 })
  }
  return out
}
