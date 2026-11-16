import { Decoder, Stream } from '@garmin/fitsdk'
import type { Activity, ActivityDetail, BestEffort } from './store'

/**
 * FIT file -> Activity + ActivityDetail.
 * Works with files straight from the watch (GARMIN/Activity/*.fit), from Garmin Connect
 * ("Export original"), from the Garmin account data export, and from Strava's bulk export (.fit.gz).
 */

const FIT_EPOCH = 631065600 // 1989-12-31T00:00:00Z in unix seconds
const SEMI = 180 / 2 ** 31

export interface ParsedActivity {
  activity: Activity
  detail: ActivityDetail
}

export class NotAnActivityError extends Error {}

const toUnix = (v: any): number | undefined => {
  if (v == null) return undefined
  if (v instanceof Date) return Math.round(v.getTime() / 1000)
  if (typeof v === 'number') return v + FIT_EPOCH
  return undefined
}
const num = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const pos = (v: any) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined)
const round = (v: number | undefined, d = 0) => (v == null ? undefined : Math.round(v * 10 ** d) / 10 ** d)

export function parseFit(buf: Buffer | Uint8Array): ParsedActivity[] {
  const stream = Stream.fromByteArray(buf instanceof Buffer ? new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) : buf)
  if (!Decoder.isFIT(stream)) throw new NotAnActivityError('not a FIT file')
  const decoder = new Decoder(stream)
  const { messages, errors } = decoder.read({
    applyScaleAndOffset: true,
    expandSubFields: true,
    expandComponents: true,
    convertTypesToStrings: true,
    convertDateTimesToDates: true,
    includeUnknownData: false,
    mergeHeartRates: true,
  })
  const m = messages as Record<string, any[]>
  const fileId = m.fileIdMesgs?.[0]
  const sessions = (m.sessionMesgs ?? []).filter(s => s.startTime)
  if (fileId?.type && fileId.type !== 'activity') throw new NotAnActivityError(`FIT file type "${fileId.type}"`)
  if (!sessions.length) {
    if (errors?.length) throw new Error(`could not decode FIT file: ${errors[0]?.message ?? errors[0]}`)
    throw new NotAnActivityError('FIT file has no session')
  }

  // Local time offset = activity.localTimestamp - activity.timestamp
  const act = m.activityMesgs?.[0]
  let offset = 0
  const localTs = act?.localTimestamp
  const utcTs = toUnix(act?.timestamp)
  if (localTs != null && utcTs) {
    const local = localTs instanceof Date ? localTs.getTime() / 1000 : localTs + FIT_EPOCH
    offset = Math.round((local - utcTs) / 900) * 900 // snap to 15-minute time zones
    if (Math.abs(offset) > 14 * 3600) offset = 0
  }

  const deviceName = deviceLabel(fileId, m.deviceInfoMesgs)
  const records = (m.recordMesgs ?? []).filter(r => r.timestamp)
  const zoneBounds = (m.timeInZoneMesgs ?? []).find(z => z.referenceMesg === 'session')?.hrZoneHighBoundary

  return sessions.map((s) => {
    const start = toUnix(s.startTime)!
    const end = start + Math.ceil(num(s.totalElapsedTime) ?? 0)
    const recs = sessions.length > 1 ? records.filter(r => { const t = toUnix(r.timestamp)!; return t >= start && t <= end + 1 }) : records
    return buildActivity(s, recs, { start, offset, deviceName, zoneBounds, laps: (m.lapMesgs ?? []).length })
  })
}

function buildActivity(s: any, recs: any[], ctx: { start: number; offset: number; deviceName?: string; zoneBounds?: number[]; laps: number }): ParsedActivity {
  const { sport_type, trainer } = mapSport(String(s.sport ?? 'generic'), String(s.subSport ?? 'generic'))
  const distance = pos(s.totalDistance) ?? 0
  const timer = pos(s.totalTimerTime) ?? 0
  const moving = pos(s.totalMovingTime) ?? timer
  const elapsed = pos(s.totalElapsedTime) ?? timer
  const isRunLike = ['running', 'walking', 'hiking'].includes(s.sport)

  let cadence = num(s.avgCadence)
  if (cadence != null && isRunLike) cadence = (cadence + (num(s.avgFractionalCadence) ?? 0)) * 2 // strides -> steps per minute
  let maxCadence = num(s.maxCadence)
  if (maxCadence != null && isRunLike) maxCadence = (maxCadence + (num(s.maxFractionalCadence) ?? 0)) * 2

  const startDate = new Date(ctx.start * 1000).toISOString().replace('.000Z', 'Z')
  const startLocal = new Date((ctx.start + ctx.offset) * 1000).toISOString().replace('.000Z', 'Z')

  // GPS track
  const pts: [number, number][] = []
  for (const r of recs) {
    const lat = num(r.positionLat)
    const lng = num(r.positionLong)
    if (lat == null || lng == null || (lat === 0 && lng === 0)) continue
    pts.push([lat * SEMI, lng * SEMI])
  }
  let startLatLng: [number, number] | [] = []
  if (num(s.startPositionLat) != null && num(s.startPositionLong) != null) startLatLng = [round(s.startPositionLat * SEMI, 5)!, round(s.startPositionLong * SEMI, 5)!]
  else if (pts.length) startLatLng = [round(pts[0]![0], 5)!, round(pts[0]![1], 5)!]
  const polyline = pts.length >= 2 ? encodePolyline(simplify(pts, 0.00004, 600)) : undefined

  const hour = new Date((ctx.start + ctx.offset) * 1000).getUTCHours()

  const activity: Activity = {
    id: ctx.start,
    name: `${dayPart(hour)} ${prettySport(sport_type)}`,
    sport_type,
    fit_sport: s.sport,
    fit_sub_sport: s.subSport,
    start_date: startDate,
    start_date_local: startLocal,
    distance,
    moving_time: Math.round(moving),
    elapsed_time: Math.round(elapsed),
    total_elevation_gain: pos(s.totalAscent) ?? 0,
    total_descent: pos(s.totalDescent),
    elev_high: num(s.enhancedMaxAltitude) ?? num(s.maxAltitude),
    elev_low: num(s.enhancedMinAltitude) ?? num(s.minAltitude),
    average_speed: distance && moving ? distance / moving : (pos(s.enhancedAvgSpeed) ?? pos(s.avgSpeed) ?? 0),
    max_speed: pos(s.enhancedMaxSpeed) ?? pos(s.maxSpeed) ?? 0,
    average_heartrate: pos(s.avgHeartRate),
    max_heartrate: pos(s.maxHeartRate),
    min_heartrate: pos(s.minHeartRate),
    average_cadence: round(pos(cadence), 1),
    max_cadence: round(pos(maxCadence), 1),
    average_watts: pos(s.avgPower),
    weighted_average_watts: pos(s.normalizedPower),
    max_watts: pos(s.maxPower),
    kilojoules: pos(s.totalWork) ? s.totalWork / 1000 : undefined,
    device_watts: pos(s.avgPower) != null,
    calories: pos(s.totalCalories),
    training_load: round(pos(s.trainingLoadPeak), 1),
    aerobic_te: round(pos(s.totalTrainingEffect), 1),
    anaerobic_te: round(num(s.totalAnaerobicTrainingEffect), 1),
    stride_length: pos(s.avgStepLength) ? round(s.avgStepLength / 1000, 3) : undefined,
    vertical_oscillation: round(pos(s.avgVerticalOscillation), 1),
    ground_contact_time: round(pos(s.avgStanceTime), 1),
    vertical_ratio: round(pos(s.avgVerticalRatio), 2),
    gct_balance: round(pos(s.avgStanceTimeBalance), 1),
    avg_respiration: round(pos(s.enhancedAvgRespirationRate) ?? pos(s.avgRespirationRate), 1),
    avg_temp: num(s.avgTemperature),
    max_temp: num(s.maxTemperature),
    min_temp: num(s.minTemperature),
    avg_gap_speed: pos(s.avgGradeAdjustedSpeed),
    rpe: pos(s.workoutRpe) ? s.workoutRpe / 10 : undefined,
    feel: num(s.workoutFeel),
    trainer: trainer || (!pts.length && distance > 0 && ['running', 'cycling'].includes(s.sport)),
    race: false,
    device_name: ctx.deviceName,
    start_latlng: startLatLng,
    polyline,
    source: 'fit',
    imported_at: Date.now(),
  }
  // Drop undefined keys to keep the JSON small.
  for (const k of Object.keys(activity) as (keyof Activity)[]) if (activity[k] === undefined) delete activity[k]

  const detail: ActivityDetail = { laps: ctx.laps || undefined }
  if (['Run', 'TrailRun', 'VirtualRun'].includes(sport_type) && distance >= 400) {
    const efforts = bestEfforts(recs, startLocal, ctx.offset)
    if (efforts.length) detail.best_efforts = efforts
  }
  const power = bestPower(recs)
  if (power) detail.best_power = power
  const times = Array.isArray(s.timeInHrZone) ? s.timeInHrZone.map((v: any) => Math.round(Number(v) || 0)) : undefined
  if (times?.some((v: number) => v > 0)) detail.hr_zones = { times, bounds: Array.isArray(ctx.zoneBounds) ? ctx.zoneBounds : undefined }
  return { activity, detail }
}

// --- Sports -----------------------------------------------------------------------------

/** Map FIT sport/sub-sport to Strava-style sport names (the dashboard's colors and labels use these). */
export function mapSport(sport: string, sub: string): { sport_type: string; trainer: boolean } {
  const indoor = ['treadmill', 'indoorCycling', 'spin', 'indoorRunning', 'indoorWalking', 'indoorRowing', 'virtualActivity', 'indoorSkiing'].includes(sub)
  const r = (sport_type: string, trainer = indoor) => ({ sport_type, trainer })
  switch (sport) {
    case 'running':
      if (sub === 'trail') return r('TrailRun')
      if (sub === 'virtualActivity') return r('VirtualRun')
      return r('Run')
    case 'cycling':
      if (sub === 'virtualActivity') return r('VirtualRide')
      if (sub === 'mountain' || sub === 'downhill' || sub === 'enduro') return r('MountainBikeRide')
      if (sub === 'gravelCycling' || sub === 'cyclocross') return r('GravelRide')
      if (sub === 'eBikeMountain') return r('EMountainBikeRide')
      return r('Ride')
    case 'eBiking': return r(sub === 'eBikeMountain' ? 'EMountainBikeRide' : 'EBikeRide')
    case 'swimming': return r('Swim')
    case 'walking': return r('Walk')
    case 'hiking': return r('Hike')
    case 'mountaineering': return r('Hike')
    case 'training':
      if (sub === 'strengthTraining') return r('WeightTraining')
      if (sub === 'yoga') return r('Yoga')
      if (sub === 'pilates') return r('Pilates')
      if (sub === 'hiit' || sub === 'amrap' || sub === 'emom' || sub === 'tabata') return r('HighIntensityIntervalTraining')
      if (sub === 'breathing') return r('Breathwork')
      return r('Workout')
    case 'hiit': return r('HighIntensityIntervalTraining')
    case 'fitnessEquipment':
      if (sub === 'treadmill' || sub === 'indoorRunning') return r('Run', true)
      if (sub === 'elliptical') return r('Elliptical', true)
      if (sub === 'stairClimbing') return r('StairStepper', true)
      if (sub === 'indoorRowing') return r('Rowing', true)
      if (sub === 'indoorCycling' || sub === 'spin') return r('Ride', true)
      if (sub === 'strengthTraining') return r('WeightTraining')
      return r('Workout', true)
    case 'rowing': return r('Rowing')
    case 'alpineSkiing': return r(sub === 'backcountry' ? 'BackcountrySki' : 'AlpineSki')
    case 'crossCountrySkiing': return r('NordicSki')
    case 'snowboarding': return r('Snowboard')
    case 'snowshoeing': return r('Snowshoe')
    case 'standUpPaddleboarding': return r('StandUpPaddling')
    case 'paddling': case 'kayaking': case 'canoeing': return r('Kayaking')
    case 'inlineSkating': return r('InlineSkate')
    case 'iceSkating': return r('IceSkate')
    case 'rockClimbing': case 'floorClimbing': return r('RockClimbing')
    case 'generic': return r('Workout')
    default: return r(sport.charAt(0).toUpperCase() + sport.slice(1))
  }
}

function prettySport(s: string) {
  if (s === 'WeightTraining') return 'Strength'
  if (s === 'HighIntensityIntervalTraining') return 'HIIT'
  return s.replace(/([a-z])([A-Z])/g, '$1 $2')
}
function dayPart(h: number) {
  if (h < 5) return 'Night'
  if (h < 11) return 'Morning'
  if (h < 14) return 'Lunch'
  if (h < 18) return 'Afternoon'
  if (h < 22) return 'Evening'
  return 'Night'
}

/** "fr255" -> "Forerunner 255", "fenix7" -> "fēnix 7", "edge530" -> "Edge 530" */
export function deviceLabel(fileId: any, deviceInfos?: any[]): string | undefined {
  if (!fileId) return undefined
  if (fileId.productName) return String(fileId.productName)
  const product = fileId.garminProduct ?? fileId.product
  const manufacturer = String(fileId.manufacturer ?? '')
  if (typeof product === 'string') {
    let mm = /^fr(\d+)(.*)$/i.exec(product)
    if (mm) return `Forerunner ${mm[1]}${mm[2] ? ` ${splitCamel(mm[2])}` : ''}`
    mm = /^fenix(\d*)(.*)$/i.exec(product)
    if (mm) return `fēnix ${mm[1] ?? ''}${mm[2] ? ` ${splitCamel(mm[2])}` : ''}`.trim()
    mm = /^edge(\d+)(.*)$/i.exec(product)
    if (mm) return `Edge ${mm[1]}${mm[2] ? ` ${splitCamel(mm[2])}` : ''}`
    mm = /^(venu|vivoactive|epix|enduro|instinct|marq)(.*)$/i.exec(product)
    if (mm) return `${mm[1]![0]!.toUpperCase()}${mm[1]!.slice(1)} ${splitCamel(mm[2] ?? '')}`.trim()
    if (product === 'connect' || product === 'connectiq') return 'Garmin Connect'
    return splitCamel(product)
  }
  const creator = deviceInfos?.find(d => d.deviceIndex === 'creator' || d.deviceIndex === 0)
  if (creator?.productName) return String(creator.productName)
  return manufacturer ? `${splitCamel(manufacturer)} device` : undefined
}
const splitCamel = (s: string) => s.replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/^./, c => c.toUpperCase())

// --- Best efforts / power curve --------------------------------------------------------------

export const EFFORTS: [string, number][] = [
  ['400m', 400], ['1/2 mile', 804.672], ['1K', 1000], ['1 mile', 1609.344], ['2 mile', 3218.688], ['5K', 5000], ['10K', 10000],
  ['15K', 15000], ['10 mile', 16093.44], ['20K', 20000], ['Half-Marathon', 21097.5], ['30K', 30000], ['Marathon', 42195], ['50K', 50000],
]

function bestEfforts(recs: any[], startLocal: string, offset: number): BestEffort[] {
  const t: number[] = []
  const d: number[] = []
  for (const r of recs) {
    const dist = num(r.distance)
    if (dist == null) continue
    if (d.length && dist < d[d.length - 1]!) continue // ignore distance going backwards
    t.push(toUnix(r.timestamp)!)
    d.push(dist)
  }
  if (d.length < 2) return []
  const total = d[d.length - 1]! - d[0]!
  const out: BestEffort[] = []
  for (const [name, target] of EFFORTS) {
    if (total < target) break
    let best = Infinity
    let bestStart = t[0]!
    let i = 0
    for (let j = 1; j < d.length; j++) {
      if (d[j]! - d[0]! < target) continue
      while (i + 1 < j && d[j]! - d[i + 1]! >= target) i++
      // interpolate the exact start point between i and i+1
      const over = d[j]! - d[i]! - target
      const seg = d[i + 1]! - d[i]!
      const startT = seg > 0 ? t[i]! + (t[i + 1]! - t[i]!) * Math.min(1, over / seg) : t[i]!
      const dt = t[j]! - startT
      if (dt > 0 && dt < best) {
        best = dt
        bestStart = startT
      }
    }
    if (Number.isFinite(best)) {
      const secs = Math.round(best)
      out.push({
        name,
        distance: target,
        elapsed_time: secs,
        moving_time: secs,
        start_date_local: new Date((Math.round(bestStart) + offset) * 1000).toISOString().replace('.000Z', 'Z') || startLocal,
      })
    }
  }
  return out
}

const POWER_WINDOWS = [5, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600]

function bestPower(recs: any[]): Record<string, number> | undefined {
  const withPower = recs.filter(r => num(r.power) != null)
  if (withPower.length < 30) return undefined
  const t0 = toUnix(withPower[0].timestamp)!
  const t1 = toUnix(withPower[withPower.length - 1].timestamp)!
  const len = Math.min(t1 - t0 + 1, 12 * 3600)
  const p = new Float64Array(len)
  let last = 0
  let lastT = t0
  for (const r of withPower) {
    const ti = toUnix(r.timestamp)! - t0
    if (ti >= len) break
    // fill gaps of up to 5 s (smart recording) with the previous value, longer ones with 0
    for (let k = lastT - t0 + 1; k < ti; k++) p[k] = ti - (lastT - t0) <= 5 ? last : 0
    p[ti] = r.power
    last = r.power
    lastT = toUnix(r.timestamp)!
  }
  const prefix = new Float64Array(len + 1)
  for (let i = 0; i < len; i++) prefix[i + 1] = prefix[i]! + p[i]!
  const out: Record<string, number> = {}
  for (const w of POWER_WINDOWS) {
    if (w > len) break
    let best = 0
    for (let i = 0; i + w <= len; i++) best = Math.max(best, prefix[i + w]! - prefix[i]!)
    if (best > 0) out[w] = Math.round(best / w)
  }
  return Object.keys(out).length ? out : undefined
}

// --- Polyline helpers --------------------------------------------------------------------------

/** Ramer–Douglas–Peucker, iterative; then thin to at most `max` points. */
function simplify(pts: [number, number][], tol: number, max: number): [number, number][] {
  if (pts.length <= 2) return pts
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const stack: [number, number][] = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const [ax, ay] = pts[a]!
    const [bx, by] = pts[b]!
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy
    let maxD = 0
    let idx = -1
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i]!
      let tt = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0
      tt = Math.max(0, Math.min(1, tt))
      const ex = ax + tt * dx - px
      const ey = ay + tt * dy - py
      const dd = ex * ex + ey * ey
      if (dd > maxD) { maxD = dd; idx = i }
    }
    if (idx > 0 && maxD > tol * tol) {
      keep[idx] = 1
      stack.push([a, idx], [idx, b])
    }
  }
  let out = pts.filter((_, i) => keep[i])
  if (out.length > max) {
    const step = out.length / max
    out = Array.from({ length: max }, (_, i) => out[Math.floor(i * step)]!).concat([out[out.length - 1]!])
  }
  return out
}

export function encodePolyline(pts: [number, number][]) {
  let lastLat = 0
  let lastLng = 0
  let s = ''
  const enc = (v: number) => {
    v = v < 0 ? ~(v << 1) : v << 1
    let r = ''
    while (v >= 0x20) {
      r += String.fromCharCode((0x20 | (v & 0x1f)) + 63)
      v >>= 5
    }
    return r + String.fromCharCode(v + 63)
  }
  for (const [lat, lng] of pts) {
    const a = Math.round(lat * 1e5)
    const b = Math.round(lng * 1e5)
    s += enc(a - lastLat) + enc(b - lastLng)
    lastLat = a
    lastLng = b
  }
  return s
}
