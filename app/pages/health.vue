<script setup lang="ts">
const range = ref(90)
try { range.value = Number(localStorage.getItem('sa-health-range')) || 90 } catch {}
watch(range, (v) => { try { localStorage.setItem('sa-health-range', String(v)) } catch {} })
const { data: w, pending } = useWellness(range)
const { data: status } = useStatus()

const days = computed<any[]>(() => w.value?.days ?? [])
const avg = (k: string) => w.value?.averages?.[k]
const latest = (k: string) => w.value?.latest?.[k]

function delta(k: string, digits = 0, unit = '') {
  const a = avg(k)
  if (!a?.d30 || !a?.prev30) return ''
  const d = a.d30 - a.prev30
  return `${d >= 0 ? '+' : ''}${nf(d, digits)}${unit} vs previous 30 days`
}

function rolling(values: (number | null | undefined)[], n = 7) {
  return values.map((_, i) => {
    const win = values.slice(Math.max(0, i - n + 1), i + 1).filter((v): v is number => typeof v === 'number' && v > 0)
    return win.length >= Math.min(3, n) ? win.reduce((s, v) => s + v, 0) / win.length : null
  })
}

const dayTicks = (labels: string[]) => ({
  grid: { display: false },
  ticks: {
    maxRotation: 0, autoSkip: labels.length <= 45, autoSkipPadding: 12,
    callback(this: any, v: any) {
      const l: string = this.getLabelForValue(v)
      if (labels.length <= 45) return fmtDate(l, { month: 'short', day: 'numeric' })
      return l.endsWith('-01') ? fmtDate(l, labels.length > 400 ? { month: 'short', year: '2-digit' } : { month: 'short' }) : ''
    },
  },
})
const tipTitle = (i: any) => fmtDate(i[0].label, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

/** Daily points (light) + 7-day average line (one series, one axis). */
function dailyWithAvg(key: string, label: string, unit: string, slot: number, digits = 0) {
  const D = days.value
  if (!D.some(d => d[key])) return null
  return () => {
    const labels = D.map(d => d.date)
    const vals = D.map(d => d[key] || null)
    return {
      type: 'line' as const,
      data: {
        labels,
        datasets: [
          { label: '7-day average', data: rolling(vals), borderColor: series(slot), backgroundColor: series(slot), spanGaps: true, order: 0 },
          { label, data: vals, borderColor: 'transparent', backgroundColor: `${cssVar(`--s${slot}`)}66`, pointRadius: D.length > 200 ? 1.5 : 2.5, showLine: false, order: 1 },
        ],
      },
      options: {
        plugins: { legend: { position: 'bottom' as const }, tooltip: { callbacks: { title: tipTitle, label: (c: any) => (c.raw == null ? '' : ` ${c.dataset.label}: ${nf(c.raw, digits)} ${unit}`) } } },
        scales: { x: dayTicks(labels), y: { title: { display: true, text: unit } } },
      },
    }
  }
}

const rhrChart = computed(() => dailyWithAvg('rhr', 'Resting HR', 'bpm', 8))
const hrvChart = computed(() => dailyWithAvg('hrv', 'Nightly HRV', 'ms', 3))
const stressChart = computed(() => dailyWithAvg('stress_avg', 'Avg stress', 'score', 4))

const sleepChart = computed(() => {
  const D = days.value
  if (!D.some(d => d.sleep_s)) return null
  return () => {
    const labels = D.map(d => d.date)
    const h = (k: string) => D.map(d => (d[k] ? d[k] / 3600 : null))
    const stages = [
      { k: 'deep_s', label: 'Deep', color: series(7) },
      { k: 'light_s', label: 'Light', color: series(1) },
      { k: 'rem_s', label: 'REM', color: series(5) },
      { k: 'awake_s', label: 'Awake', color: cssVar('--other') },
    ]
    return {
      type: 'bar' as const,
      data: { labels, datasets: stages.map(s => ({ label: s.label, data: h(s.k), backgroundColor: s.color, borderRadius: 0, borderColor: cssVar('--surface'), borderWidth: { top: D.length > 120 ? 0 : 1 } })) },
      options: {
        plugins: {
          legend: { position: 'bottom' as const },
          tooltip: { callbacks: { title: tipTitle, label: (c: any) => (c.raw ? ` ${c.dataset.label}: ${fmtDuration(c.raw * 3600)}` : ''), footer: (i: any) => { const d = D[i[0].dataIndex]; return d.sleep_s ? `Total ${fmtDuration(d.sleep_s)}${d.sleep_score ? ` · score ${d.sleep_score}` : ''}` : '' } } },
        },
        scales: { x: { ...dayTicks(labels), stacked: true }, y: { stacked: true, beginAtZero: true, title: { display: true, text: 'hours' } } },
      },
    }
  }
})
const sleepScoreChart = computed(() => dailyWithAvg('sleep_score', 'Sleep score', 'score', 7))

const stepsChart = computed(() => {
  const D = days.value
  if (!D.some(d => d.steps)) return null
  return () => {
    const labels = D.map(d => d.date)
    return {
      type: 'bar' as const,
      data: {
        labels,
        datasets: [
          { type: 'line' as const, label: 'Goal', data: D.map(d => d.step_goal ?? null), borderColor: cssVar('--text-2'), borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0, spanGaps: true, order: 0 },
          { type: 'bar' as const, label: 'Steps', data: D.map(d => d.steps ?? null), backgroundColor: D.map(d => (d.step_goal && d.steps >= d.step_goal ? series(1) : cssVar('--other'))), borderRadius: 2, order: 1 },
        ],
      },
      options: {
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: tipTitle, label: (c: any) => ` ${c.dataset.label}: ${nf(c.raw ?? 0)}` } } },
        scales: { x: dayTicks(labels), y: { beginAtZero: true, title: { display: true, text: 'steps' } } },
      },
    }
  }
})

const bbChart = computed(() => {
  const D = days.value
  if (!D.some(d => d.bb_high)) return null
  return () => {
    const labels = D.map(d => d.date)
    return {
      type: 'bar' as const,
      data: { labels, datasets: [{ label: 'Body Battery range', data: D.map(d => (d.bb_high ? [d.bb_low ?? 0, d.bb_high] as [number, number] : null)), backgroundColor: series(6), borderRadius: 3, maxBarThickness: 10 }] },
      options: {
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: tipTitle, label: (c: any) => (c.raw ? ` low ${c.raw[0]} → high ${c.raw[1]}` : '') } } },
        scales: { x: dayTicks(labels), y: { min: 0, max: 100, title: { display: true, text: 'Body Battery' } } },
      },
    }
  }
})

const vo2Chart = computed(() => {
  const D = days.value
  if (!D.some(d => d.vo2max_filled)) return null
  return () => {
    const labels = D.map(d => d.date)
    return {
      type: 'line' as const,
      data: { labels, datasets: [{ label: 'VO2 max', data: D.map(d => d.vo2max_filled ?? null), borderColor: series(2), backgroundColor: series(2), stepped: true, spanGaps: true }] },
      options: {
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: tipTitle, label: (c: any) => ` VO2 max ${nf(c.raw, 1)}` } } },
        scales: { x: dayTicks(labels), y: { title: { display: true, text: 'ml/kg/min' } } },
      },
    }
  }
})

const imChart = computed(() => {
  const W = w.value?.weekly ?? []
  if (!W.some((x: any) => x.intensity)) return null
  return () => ({
    type: 'bar' as const,
    data: {
      labels: W.map((x: any) => x.week),
      datasets: [
        { type: 'line' as const, label: 'WHO goal (150)', data: W.map(() => 150), borderColor: cssVar('--text-2'), borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0, order: 0 },
        { type: 'bar' as const, label: 'Intensity minutes', data: W.map((x: any) => x.intensity), backgroundColor: W.map((x: any) => (x.intensity >= 150 ? series(1) : cssVar('--other'))), borderRadius: 4, order: 1 },
      ],
    },
    options: {
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: (i: any) => `Week of ${fmtDate(i[0].label)}`, label: (c: any) => ` ${c.dataset.label}: ${nf(c.raw)} min` } } },
      scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 14, callback(this: any, v: any) { return fmtDate(this.getLabelForValue(v), { month: 'short', day: 'numeric' }) } } }, y: { beginAtZero: true, title: { display: true, text: 'minutes' } } },
    },
  })
})

// Average bed / wake time (minutes after 18:00, so nights crossing midnight average correctly)
function clockFrom18(m: number) {
  const t = (Math.round(m) + 18 * 60) % 1440
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}
const sleepTiming = computed(() => {
  const st = (w.value?.sleepTimes ?? []).slice(-30)
  if (!st.length) return null
  return { bed: clockFrom18(st.reduce((s: number, x: any) => s + x.bed, 0) / st.length), wake: clockFrom18(st.reduce((s: number, x: any) => s + x.wake, 0) / st.length) }
})

const hrvStatusLabel = (s?: string) => (s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') : '')

// Race predictions (Garmin, from VO2 max and training history)
const RACES = [['time5K', '5K', 5000], ['time10K', '10K', 10000], ['timeHalfMarathon', 'Half marathon', 21097.5], ['timeMarathon', 'Marathon', 42195]] as const
const races = computed(() => {
  const rp = w.value?.racePredictions
  const latestRp = Array.isArray(rp?.latest) ? rp.latest[0] : rp?.latest
  if (!latestRp) return []
  const hist = Array.isArray(rp?.history) ? rp.history : []
  const first = hist[0]
  return RACES.filter(([k]) => latestRp[k]).map(([k, label, dist]) => ({ label, dist, time: latestRp[k], change: first?.[k] ? latestRp[k] - first[k] : null }))
})
const { units } = useFilters()
</script>

<template>
  <div>
    <div class="row" style="margin-bottom: 14px">
      <h1>Health</h1>
      <span class="pill">Garmin Connect daily data</span>
      <span class="spacer" />
      <div class="seg">
        <button v-for="r in [30, 90, 365, 730]" :key="r" :class="{ on: range === r }" @click="range = r">{{ r < 365 ? `${r} d` : `${r / 365} y` }}</button>
      </div>
    </div>

    <div v-if="pending && !w" class="empty">Loading…</div>
    <div v-else-if="w && !w.hasData" class="empty card">
      No health data yet. Health data (sleep, HRV, resting heart rate, steps, stress, Body Battery, VO2 max) comes from Garmin Connect.
      <template v-if="!status?.garmin.loggedIn"> Log in to Garmin Connect in <NuxtLink to="/setup">Settings</NuxtLink>.</template>
      <template v-else> It is downloaded in the background, about {{ 45 }} days per sync. Check back after the next sync.</template>
    </div>

    <template v-else-if="w">
      <div class="tiles">
        <StatTile accent label="Resting HR" :value="avg('rhr')?.d7 ? `${nf(avg('rhr').d7)} bpm` : '–'" :sub="delta('rhr', 1, ' bpm') || '7-day average'" />
        <StatTile accent label="HRV" :value="latest('hrv') ? `${nf(latest('hrv').value)} ms` : '–'" :sub="latest('hrv_status') ? `${hrvStatusLabel(latest('hrv_status').value)} · 7-day avg ${nf(avg('hrv')?.d7)} ms` : 'last night'" />
        <StatTile accent label="Sleep" :value="avg('sleep_s')?.d7 ? fmtDuration(avg('sleep_s').d7) : '–'" :sub="avg('sleep_score')?.d7 ? `score ${nf(avg('sleep_score').d7)} · 7-day avg` : '7-day average'" />
        <StatTile accent label="VO2 max" :value="latest('vo2max') ? nf(latest('vo2max').value, 0) : '–'" :sub="latest('vo2max') ? `as of ${fmtDate(latest('vo2max').date)}` : ''" />
        <StatTile label="Steps" :value="avg('steps')?.d30 ? nf(avg('steps').d30) : '–'" :sub="w.totals.stepDays ? `per day (30 d) · goal hit ${nf(w.totals.stepGoalDays / w.totals.stepDays * 100)}% of days` : ''" />
        <StatTile label="Body Battery peak" :value="avg('bb_high')?.d7 ? nf(avg('bb_high').d7) : '–'" :sub="avg('bb_low')?.d7 ? `low ${nf(avg('bb_low').d7)} · 7-day avg` : ''" />
        <StatTile label="Stress" :value="avg('stress_avg')?.d7 ? nf(avg('stress_avg').d7) : '–'" :sub="delta('stress_avg') || '7-day average (0–100)'" />
        <StatTile label="Bedtime" :value="sleepTiming ? sleepTiming.bed : '–'" :sub="sleepTiming ? `wake ${sleepTiming.wake} · avg of last 30 nights` : ''" />
      </div>

      <div class="grid g-2 section">
        <div class="card">
          <div class="card-head"><h2>Resting heart rate</h2><span class="hint">lower usually means fitter / better recovered</span></div>
          <ChartBox v-if="rhrChart" :config="rhrChart" :height="240" />
          <div v-else class="muted">No data.</div>
        </div>
        <div class="card">
          <div class="card-head"><h2>Heart-rate variability</h2><span class="hint">overnight average</span></div>
          <ChartBox v-if="hrvChart" :config="hrvChart" :height="240" />
          <div v-else class="muted">No HRV data (needs HRV Status on the watch).</div>
        </div>
        <div class="card span-2">
          <div class="card-head"><h2>Sleep</h2><span class="hint">stages per night</span></div>
          <ChartBox v-if="sleepChart" :config="sleepChart" :height="260" />
          <div v-else class="muted">No sleep data.</div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Sleep score</h3></div>
          <ChartBox v-if="sleepScoreChart" :config="sleepScoreChart" :height="200" />
          <div v-else class="muted">No sleep scores.</div>
        </div>
        <div class="card">
          <div class="card-head"><h3>VO2 max</h3><span class="hint">Garmin estimate</span></div>
          <ChartBox v-if="vo2Chart" :config="vo2Chart" :height="200" />
          <div v-else class="muted">No VO2 max estimate yet.</div>
        </div>
        <div class="card span-2">
          <div class="card-head">
            <h2>Steps</h2>
            <span class="hint"><span class="swatch" :style="{ background: series(1) }" />goal reached <span class="swatch" :style="{ background: cssVar('--other'), marginLeft: '10px' }" />below goal · dashed = goal</span>
          </div>
          <ChartBox v-if="stepsChart" :config="stepsChart" :height="220" />
          <div v-else class="muted">No step data.</div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Body Battery</h3><span class="hint">daily low → high</span></div>
          <ChartBox v-if="bbChart" :config="bbChart" :height="220" />
          <div v-else class="muted">No Body Battery data.</div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Stress</h3><span class="hint">daily average</span></div>
          <ChartBox v-if="stressChart" :config="stressChart" :height="220" />
          <div v-else class="muted">No stress data.</div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Intensity minutes</h3><span class="hint">per week · vigorous counts double</span></div>
          <ChartBox v-if="imChart" :config="imChart" :height="220" />
          <div v-else class="muted">No intensity minutes.</div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Race predictions</h3><span class="hint">Garmin race predictor</span></div>
          <div v-if="!races.length" class="muted">No race predictions yet.</div>
          <table v-else class="data">
            <thead><tr><th>Race</th><th class="r">Predicted</th><th class="r">Pace</th><th class="r">Change (1 y)</th></tr></thead>
            <tbody>
              <tr v-for="r in races" :key="r.label">
                <td><strong>{{ r.label }}</strong></td>
                <td class="r">{{ fmtClock(r.time) }}</td>
                <td class="r">{{ fmtSpeed(r.dist / r.time, units, 'Run') }}</td>
                <td class="r">
                  <span v-if="r.change != null" :style="{ color: r.change <= 0 ? 'var(--good)' : 'var(--critical)' }">{{ r.change <= 0 ? '−' : '+' }}{{ fmtClock(Math.abs(r.change)) }}</span>
                  <span v-else class="muted">–</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <p class="muted" style="font-size: 12.5px">
        {{ nf(w.totals.steps) }} steps and {{ nf(w.totals.floors) }} floors in this period · {{ w.totals.sleepNights }} nights tracked<template v-if="w.firstDate"> · health data since {{ fmtDate(w.firstDate) }}</template>
      </p>
    </template>
  </div>
</template>
