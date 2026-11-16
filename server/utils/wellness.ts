import type { HealthDay } from './store'

type Key = keyof HealthDay
const NUM_KEYS: Key[] = ['steps', 'rhr', 'hrv', 'sleep_s', 'sleep_score', 'stress_avg', 'bb_high', 'bb_low', 'vo2max', 'vo2max_cycling', 'kcal_total', 'kcal_active', 'floors', 'spo2', 'resp', 'deep_s', 'rem_s', 'light_s', 'awake_s']

const addDays = (s: string, n: number) => new Date(Date.parse(`${s}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const mondayOf = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`)
  return addDays(s, -((d.getUTCDay() + 6) % 7))
}

function avg(days: HealthDay[], k: Key) {
  const v = days.map(d => d[k]).filter((x): x is number => typeof x === 'number' && x > 0)
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null
}
function latest(days: HealthDay[], k: Key) {
  for (let i = days.length - 1; i >= 0; i--) {
    const v = days[i]![k]
    if (v != null && v !== 0) return { value: v, date: days[i]!.date }
  }
  return null
}

/** Health page data: daily series for the window, recent averages and weekly roll-ups. */
export function computeWellness(health: Record<string, HealthDay>, days: number, racePredictions?: { latest?: any; history?: any[] }) {
  const today = new Date().toISOString().slice(0, 10)
  const start = addDays(today, -(days - 1))
  const series: HealthDay[] = []
  for (let d = start; d <= today; d = addDays(d, 1)) series.push(health[d] ?? { date: d })

  // VO2 max only changes occasionally; carry the last known value forward for the chart.
  const allDates = Object.keys(health).sort()
  let lastVo2: number | undefined
  for (const d of allDates) {
    if (d >= start) break
    if (health[d]!.vo2max) lastVo2 = health[d]!.vo2max
  }

  const last7 = series.slice(-7)
  const last30 = series.slice(-30)
  const prev30 = series.slice(-60, -30)
  const averages: Record<string, { d7: number | null; d30: number | null; prev30: number | null }> = {}
  for (const k of NUM_KEYS) averages[k] = { d7: avg(last7, k), d30: avg(last30, k), prev30: avg(prev30, k) }

  const latestValues: Record<string, { value: any; date: string } | null> = {}
  for (const k of [...NUM_KEYS, 'hrv_status' as Key]) latestValues[k] = latest(series, k)
  if (!latestValues.vo2max && lastVo2) latestValues.vo2max = { value: lastVo2, date: start }

  // Weekly intensity minutes (vigorous counts double, like Garmin) and average sleep.
  const weeks = new Map<string, { im: number; sleep: number; sleepN: number; steps: number; stepsN: number }>()
  for (const d of series) {
    const w = mondayOf(d.date)
    const v = weeks.get(w) ?? { im: 0, sleep: 0, sleepN: 0, steps: 0, stepsN: 0 }
    v.im += (d.mod_min ?? 0) + 2 * (d.vig_min ?? 0)
    if (d.sleep_s) { v.sleep += d.sleep_s; v.sleepN++ }
    if (d.steps) { v.steps += d.steps; v.stepsN++ }
    weeks.set(w, v)
  }
  const weekly = [...weeks].map(([week, v]) => ({
    week,
    intensity: v.im,
    sleep: v.sleepN ? v.sleep / v.sleepN : null,
    steps: v.stepsN ? v.steps / v.stepsN : null,
  }))

  const withSteps = series.filter(d => d.steps)
  const stepGoalDays = withSteps.filter(d => d.step_goal && d.steps! >= d.step_goal).length

  // Bed / wake times (local, minutes after 18:00 so night crosses midnight cleanly)
  const sleepTimes = series
    .filter(d => d.sleep_start && d.sleep_end)
    .map((d) => {
      const s = new Date(d.sleep_start!)
      const e = new Date(d.sleep_end!)
      const bed = ((s.getUTCHours() * 60 + s.getUTCMinutes()) - 18 * 60 + 1440) % 1440
      const wake = ((e.getUTCHours() * 60 + e.getUTCMinutes()) - 18 * 60 + 1440) % 1440
      return { date: d.date, bed, wake }
    })

  const daysOut = series.map((d) => {
    if (d.vo2max) lastVo2 = d.vo2max
    return { ...d, vo2max_filled: lastVo2 }
  })

  return {
    days: daysOut,
    hasData: series.some(d => Object.keys(d).length > 2),
    averages,
    latest: latestValues,
    weekly,
    totals: {
      steps: withSteps.reduce((s, d) => s + d.steps!, 0),
      stepDays: withSteps.length,
      stepGoalDays,
      floors: series.reduce((s, d) => s + (d.floors ?? 0), 0),
      sleepNights: series.filter(d => d.sleep_s).length,
    },
    sleepTimes,
    racePredictions: racePredictions ?? null,
    firstDate: allDates[0] ?? null,
  }
}
