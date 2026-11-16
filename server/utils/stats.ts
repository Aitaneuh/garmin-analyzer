import type { Activity, ActivityDetail } from './store'

/** All dates use start_date_local, which Strava encodes as local wall time with a fake "Z". */
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
  kudos: number
  kilojoules: number
  suffer: number
  hrTime: number // moving_time weighted HR sum
  hrSeconds: number
}
const emptyAgg = (): Agg => ({ count: 0, distance: 0, moving_time: 0, elapsed_time: 0, elevation: 0, kudos: 0, kilojoules: 0, suffer: 0, hrTime: 0, hrSeconds: 0 })
function add(agg: Agg, a: Activity) {
  agg.count++
  agg.distance += a.distance
  agg.moving_time += a.moving_time
  agg.elapsed_time += a.elapsed_time
  agg.elevation += a.total_elevation_gain
  agg.kudos += a.kudos_count
  agg.kilojoules += a.kilojoules || 0
  agg.suffer += a.suffer_score || 0
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
  kudos: agg.kudos,
  kilojoules: agg.kilojoules,
  suffer: agg.suffer,
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

export function computeStats(all: Activity[], details: Record<string, ActivityDetail>, athlete: any, filter: StatsFilter) {
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
  const records = {
    longestDistance: maxBy(list, a => a.distance),
    longestTime: maxBy(list, a => a.moving_time),
    mostElevation: maxBy(list, a => a.total_elevation_gain),
    fastestAvgSpeed: maxBy(list.filter(minDist), a => a.average_speed),
    topSpeed: maxBy(list.filter(a => !a.trainer && !a.manual), a => a.max_speed),
    highestAvgHr: maxBy(list, a => a.average_heartrate),
    highestMaxHr: maxBy(list, a => a.max_heartrate),
    mostKudos: maxBy(list, a => a.kudos_count),
    highestSuffer: maxBy(list, a => a.suffer_score),
    highestAvgWatts: maxBy(list.filter(a => a.device_watts), a => a.weighted_average_watts ?? a.average_watts),
    highestMaxWatts: maxBy(list.filter(a => a.device_watts), a => a.max_watts),
    mostKilojoules: maxBy(list, a => a.kilojoules),
    mostCalories: maxBy(list, a => details[a.id]?.calories),
    mostAchievements: maxBy(list, a => a.achievement_count),
    biggestGroup: maxBy(list, a => a.athlete_count),
    steepest: maxBy(list.filter(a => a.distance >= 3000), a => a.total_elevation_gain / a.distance * 1000),
  }

  // Best efforts from detailed runs
  const effortMap = new Map<string, any[]>()
  for (const a of list) {
    for (const e of details[a.id]?.best_efforts ?? []) {
      if (!effortMap.has(e.name)) effortMap.set(e.name, [])
      effortMap.get(e.name)!.push({ ...e, activity_id: a.id, activity_name: a.name })
    }
  }
  const bestEfforts = [...effortMap]
    .map(([name, efforts]) => {
      const sorted = efforts.sort((x, y) => x.moving_time - y.moving_time)
      // progression: best time per year
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

  // --- Gear ---------------------------------------------------------------------------
  const gearUsage = groupBy(list.filter(a => a.gear_id), a => a.gear_id!)
  const gearList = [...(athlete?.bikes ?? []).map((g: any) => ({ ...g, kind: 'bike' })), ...(athlete?.shoes ?? []).map((g: any) => ({ ...g, kind: 'shoe' }))]
  const gear = gearList
    .map((g: any) => {
      const u = gearUsage.get(g.id)
      return {
        id: g.id,
        name: g.nickname || g.name,
        kind: g.kind,
        primary: g.primary,
        retired: g.retired,
        total_distance: g.distance ?? g.converted_distance,
        ...(u ? finish(u) : finish(emptyAgg())),
      }
    })
    .sort((a: any, b: any) => b.total_distance - a.total_distance)

  // --- Misc --------------------------------------------------------------------------
  const hrValues = list.filter(a => a.average_heartrate).map(a => Math.round(a.average_heartrate!))
  const hrHist: Record<number, number> = {}
  for (const v of hrValues) {
    const b = Math.floor(v / 5) * 5
    hrHist[b] = (hrHist[b] ?? 0) + 1
  }

  const daysWithDist = [...daily.values()].map(d => d.distance)
  const caloriesTotal = list.reduce((s, a) => s + (details[a.id]?.calories ?? 0), 0)
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

  const devices = new Map<string, number>()
  for (const a of list) {
    const d = details[a.id]?.device_name
    if (d) devices.set(d, (devices.get(d) ?? 0) + 1)
  }

  const flags = {
    commute: list.filter(a => a.commute).length,
    trainer: list.filter(a => a.trainer).length,
    manual: list.filter(a => a.manual).length,
    private: list.filter(a => a.private).length,
    races: list.filter(a => a.workout_type === 1 || a.workout_type === 11).length,
    withHr: list.filter(a => a.average_heartrate).length,
    withPower: list.filter(a => a.device_watts).length,
    withPhotos: list.filter(a => a.photo_count > 0).length,
    group: list.filter(a => a.athlete_count > 1).length,
    prs: list.reduce((s, a) => s + a.pr_count, 0),
    achievements: list.reduce((s, a) => s + a.achievement_count, 0),
    comments: list.reduce((s, a) => s + a.comment_count, 0),
    photos: list.reduce((s, a) => s + a.photo_count, 0),
  }

  const cadence = list.filter(a => a.average_cadence)
  const watts = list.filter(a => a.average_watts)
  const temps = list.filter(a => a.average_temp != null)

  return {
    filter,
    totals: {
      ...finish(totals),
      calories: caloriesTotal,
      avg_distance: totals.count ? totals.distance / totals.count : 0,
      avg_time: totals.count ? totals.moving_time / totals.count : 0,
      avg_elevation: totals.count ? totals.elevation / totals.count : 0,
      avg_cadence: cadence.length ? cadence.reduce((s, a) => s + a.average_cadence!, 0) / cadence.length : null,
      avg_watts: watts.length ? watts.reduce((s, a) => s + a.average_watts!, 0) / watts.length : null,
      avg_temp: temps.length ? temps.reduce((s, a) => s + a.average_temp!, 0) / temps.length : null,
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
    gear,
    devices: [...devices].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    scatter,
    detailsCoverage: { withDetail: list.filter(a => details[a.id]).length, total: list.length },
  }
}
