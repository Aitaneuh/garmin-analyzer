<script setup lang="ts">
const { units, sport, year } = useFilters()
const { data: s, pending } = useStats()

const load = computed(() => s.value?.trainingLoad ?? [])
const last = computed(() => load.value.at(-1))
const weekAgo = computed(() => load.value.at(-8))
const monthTicks = (labels: string[]) => ({
  grid: { display: false },
  ticks: {
    maxRotation: 0, autoSkip: false,
    callback(this: any, v: any) {
      const l: string = this.getLabelForValue(v)
      return l.endsWith('-01') ? fmtDate(l, { month: 'short' }) : ''
    },
  },
})

const formZones = [
  { min: 15, label: 'Fresh', hint: 'tapered, ready to race' },
  { min: 5, label: 'Rested', hint: 'recovered' },
  { min: -10, label: 'Neutral', hint: 'maintaining' },
  { min: -30, label: 'Productive', hint: 'building fitness' },
  { min: -Infinity, label: 'Overreaching', hint: 'high fatigue: plan rest' },
]
const form = computed(() => (last.value ? formZones.find(z => last.value!.tsb >= z.min) : null))

// Fitness / fatigue (same unit: load per day) + daily load bars on the same axis.
const loadChart = computed(() => {
  const L = load.value
  if (!L.length) return null
  return () => {
    const labels = L.map((d: any) => d.date)
    return {
      type: 'bar' as const,
      data: {
        labels,
        datasets: [
          { type: 'line' as const, label: 'Fitness (42 d)', data: L.map((d: any) => d.ctl), borderColor: series(1), backgroundColor: series(1), order: 0 },
          { type: 'line' as const, label: 'Fatigue (7 d)', data: L.map((d: any) => d.atl), borderColor: series(2), backgroundColor: series(2), order: 1 },
          { type: 'bar' as const, label: 'Daily load', data: L.map((d: any) => d.load || null), backgroundColor: cssVar('--other'), borderRadius: 2, maxBarThickness: 4, order: 2 },
        ],
      },
      options: {
        plugins: {
          legend: { position: 'bottom' as const },
          tooltip: { callbacks: { title: (i: any) => fmtDate(i[0].label, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }), label: (c: any) => ` ${c.dataset.label}: ${nf(c.raw ?? 0, 0)}` } },
        },
        scales: { x: monthTicks(labels), y: { beginAtZero: true, title: { display: true, text: 'load / day' } } },
      },
    }
  }
})

const formChart = computed(() => {
  const L = load.value
  if (!L.length) return null
  return () => {
    const labels = L.map((d: any) => d.date)
    return {
      type: 'line' as const,
      data: { labels, datasets: [{ label: 'Form', data: L.map((d: any) => d.tsb), borderColor: series(7), backgroundColor: series(7), fill: { target: 'origin', above: `${cssVar('--s7')}22`, below: `${cssVar('--s7')}22` } }] },
      options: {
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: (i: any) => fmtDate(i[0].label), label: (c: any) => ` Form: ${nf(c.raw, 0)} (${formZones.find(z => c.raw >= z.min)?.label})` } } },
        scales: { x: monthTicks(labels), y: { title: { display: true, text: 'fitness − fatigue' } } },
      },
    }
  }
})

// Weekly time in HR zones (sequential ramp: zone 1 light -> zone 5 dark)
const zoneChart = computed(() => {
  const w = s.value?.hrZones?.weekly
  if (!w?.some((x: any) => x.times.some((v: number) => v > 0))) return null
  return () => ({
    type: 'bar' as const,
    data: {
      labels: w.map((x: any) => x.week),
      datasets: [0, 1, 2, 3, 4].map(z => ({
        label: `Zone ${z + 1}`,
        data: w.map((x: any) => x.times[z] / 3600),
        backgroundColor: seq(z + 1),
        borderColor: cssVar('--surface'),
        borderWidth: { top: 1 },
        borderRadius: 0,
      })),
    },
    options: {
      plugins: {
        legend: { position: 'bottom' as const },
        tooltip: { callbacks: { title: (i: any) => `Week of ${fmtDate(i[0].label)}`, label: (c: any) => ` ${c.dataset.label}: ${fmtDuration(c.raw * 3600)}` } },
      },
      scales: {
        x: {
          stacked: true, grid: { display: false },
          ticks: {
            maxRotation: 0, autoSkip: false,
            // label only the first week of each month
            callback(this: any, v: any) {
              const l: string = this.getLabelForValue(v)
              const prev: string | undefined = v > 0 ? this.getLabelForValue(v - 1) : undefined
              return !prev || prev.slice(0, 7) !== l.slice(0, 7) ? fmtDate(l, { month: 'short' }) : ''
            },
          },
        },
        y: { stacked: true, beginAtZero: true, title: { display: true, text: 'hours' } },
      },
    },
  })
})

const zoneTotal = computed(() => (s.value?.hrZones?.totals ?? []).reduce((a: number, b: number) => a + b, 0))
const easyShare = computed(() => {
  const t = s.value?.hrZones?.totals
  return t && zoneTotal.value ? (t[0] + t[1]) / zoneTotal.value : null
})

const TE_LABELS = ['None', 'Minor', 'Maintaining', 'Improving', 'Highly improving', 'Overreaching']
const teChart = computed(() => {
  const te = s.value?.trainingEffect
  if (!te || ![...te.aerobic, ...te.anaerobic].some((v: number) => v > 0)) return null
  return () => ({
    type: 'bar' as const,
    data: {
      labels: TE_LABELS,
      datasets: [
        { label: 'Aerobic', data: te.aerobic, backgroundColor: series(1), borderRadius: 4, maxBarThickness: 22 },
        { label: 'Anaerobic', data: te.anaerobic, backgroundColor: series(3), borderRadius: 4, maxBarThickness: 22 },
      ],
    },
    options: {
      plugins: { legend: { position: 'bottom' as const }, tooltip: { callbacks: { label: (c: any) => ` ${c.dataset.label}: ${c.raw} activities` } } },
      scales: { x: { grid: { display: false } }, y: { beginAtZero: true, title: { display: true, text: 'activities' } } },
    },
  })
})

// Running dynamics: one small chart per metric (different units -> never a shared axis)
const dyn = computed(() => s.value?.runningDynamics ?? [])
const dynDefs = computed(() => [
  { key: 'cadence', label: 'Cadence', unit: 'spm', fmt: (v: number) => nf(v, 0), conv: (v: number) => v, slot: 1 },
  { key: 'stride', label: 'Stride length', unit: units.value === 'metric' ? 'm' : 'ft', fmt: (v: number) => nf(v, 2), conv: (v: number) => (units.value === 'metric' ? v : v / 0.3048), slot: 3 },
  { key: 'gct', label: 'Ground contact time', unit: 'ms', fmt: (v: number) => nf(v, 0), conv: (v: number) => v, slot: 2, lowerBetter: true },
  { key: 'vo', label: 'Vertical oscillation', unit: 'cm', fmt: (v: number) => nf(v, 1), conv: (v: number) => v / 10, slot: 7, lowerBetter: true },
  { key: 'vr', label: 'Vertical ratio', unit: '%', fmt: (v: number) => nf(v, 1), conv: (v: number) => v, slot: 5, lowerBetter: true },
].filter(d => dyn.value.some((m: any) => m[d.key] != null)))

function dynChart(d: any) {
  const rows = dyn.value.filter((m: any) => m[d.key] != null)
  return () => ({
    type: 'line' as const,
    data: { labels: rows.map((m: any) => m.month), datasets: [{ label: d.label, data: rows.map((m: any) => d.conv(m[d.key])), borderColor: series(d.slot), backgroundColor: series(d.slot), pointRadius: rows.length < 30 ? 3 : 0 }] },
    options: {
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: (i: any) => fmtDate(`${i[0].label}-01`, { month: 'long', year: 'numeric' }), label: (c: any) => ` ${d.fmt(c.raw)} ${d.unit}` } } },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 14, callback(this: any, v: any) { return fmtDate(`${this.getLabelForValue(v)}-01`, { month: 'short', year: '2-digit' }) } } },
        y: { grace: '5%', title: { display: true, text: d.unit }, ticks: { maxTicksLimit: 5, callback: (v: any) => d.fmt(Number(v)) } },
      },
    },
  })
}
const dynLatest = (d: any) => {
  const rows = dyn.value.filter((m: any) => m[d.key] != null)
  return rows.length ? d.conv(rows.at(-1)[d.key]) : null
}

// Power curve
const POWER_LABELS: Record<string, string> = { 5: '5 s', 15: '15 s', 30: '30 s', 60: '1 min', 120: '2 min', 300: '5 min', 600: '10 min', 1200: '20 min', 1800: '30 min', 3600: '60 min' }
const power = computed(() => Object.entries(s.value?.powerCurve ?? {}).map(([w, v]: any) => ({ secs: Number(w), ...v })).sort((a, b) => a.secs - b.secs))
const powerChart = computed(() => {
  const p = power.value
  if (p.length < 2) return null
  return () => ({
    type: 'line' as const,
    data: { labels: p.map(x => POWER_LABELS[x.secs] ?? `${x.secs} s`), datasets: [{ label: 'Best power', data: p.map(x => x.watts), borderColor: series(4), backgroundColor: series(4), pointRadius: 4 }] },
    options: {
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c: any) => ` ${c.raw} W · ${p[c.dataIndex].name} (${fmtDate(p[c.dataIndex].date)})` } } },
      scales: { x: { grid: { display: false } }, y: { beginAtZero: true, title: { display: true, text: 'watts' } } },
    },
  })
})
</script>

<template>
  <div>
    <div class="row" style="margin-bottom: 14px">
      <h1>Training</h1>
      <span class="pill">{{ sportLabel(sport) }} · {{ year === 'all' ? 'last 365 days' : year }}</span>
    </div>
    <div v-if="pending && !s" class="empty">Loading…</div>
    <template v-else-if="s">
      <div class="tiles">
        <StatTile accent label="Fitness" :value="last ? nf(last.ctl) : '–'" :sub="last && weekAgo ? `${last.ctl >= weekAgo.ctl ? '+' : ''}${nf(last.ctl - weekAgo.ctl, 1)} vs last week` : '42-day average load'" />
        <StatTile accent label="Fatigue" :value="last ? nf(last.atl) : '–'" sub="7-day average load" />
        <StatTile accent label="Form" :value="last ? nf(last.tsb) : '–'" :sub="form ? `${form.label}: ${form.hint}` : ''" />
        <StatTile label="Easy share (Z1–Z2)" :value="easyShare != null ? `${nf(easyShare * 100)}%` : '–'" sub="80/20 rule: ~80% easy" />
        <StatTile label="Avg aerobic TE" :value="s.totals.avg_aerobic_te ? nf(s.totals.avg_aerobic_te, 1) : '–'" :sub="`${nf(s.flags.withLoad)} activities with Garmin load`" />
        <StatTile label="Total load" :value="nf(s.totals.load)" :sub="`${nf(s.totals.load / Math.max(1, s.totals.periodDays / 7))} per week`" />
      </div>
      <p class="muted" style="margin: 8px 2px 0; font-size: 12.5px">
        Load = Garmin's training load (EPOC) per activity, or a heart-rate estimate when missing. Fitness/fatigue use all sports, whatever the sport filter.
      </p>

      <div class="card section">
        <div class="card-head"><h2>Fitness &amp; fatigue</h2><span class="hint">exponentially weighted daily load</span></div>
        <ChartBox v-if="loadChart" :config="loadChart" :height="300" />
        <div v-else class="muted">No activities with heart rate or training load yet.</div>
      </div>
      <div class="card section">
        <div class="card-head"><h3>Form</h3><span class="hint">above 0 = fresher than usual, below = carrying fatigue</span></div>
        <ChartBox v-if="formChart" :config="formChart" :height="180" />
      </div>

      <div class="grid g-2 section">
        <div class="card span-2">
          <div class="card-head"><h2>Time in heart-rate zones</h2><span class="hint">per week · zones from your watch</span></div>
          <ChartBox v-if="zoneChart" :config="zoneChart" :height="260" />
          <div v-else class="muted">No HR zone data for this filter.</div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Zone distribution</h3></div>
          <div v-if="zoneTotal" class="zones">
            <div v-for="(t, i) in s.hrZones.totals" :key="i" class="zone-row">
              <span class="zl">Z{{ Number(i) + 1 }}</span>
              <div class="bar-bg"><div class="bar" :style="{ width: `${t / zoneTotal * 100}%`, background: seq(Number(i) + 1) }" /></div>
              <span class="zv">{{ nf(t / zoneTotal * 100) }}% · {{ fmtDuration(t, { long: true }) }}</span>
            </div>
          </div>
          <div v-else class="muted">–</div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Training effect</h3><span class="hint">Garmin TE per activity</span></div>
          <ChartBox v-if="teChart" :config="teChart" :height="220" />
          <div v-else class="muted">No training effect data.</div>
        </div>
      </div>

      <template v-if="dynDefs.length">
        <div class="section row"><h2>Running dynamics</h2><span class="muted" style="font-size: 12.5px">monthly averages of your runs (wrist-based or HRM-Pro / Running Dynamics Pod)</span></div>
        <div class="grid g-3">
          <div v-for="d in dynDefs" :key="d.key" class="card">
            <div class="card-head"><h3>{{ d.label }}</h3><span class="hint">{{ dynLatest(d) != null ? `${d.fmt(dynLatest(d))} ${d.unit}` : '' }}{{ d.lowerBetter ? ' · lower is better' : '' }}</span></div>
            <ChartBox :config="dynChart(d)" :height="170" />
          </div>
        </div>
      </template>

      <div v-if="power.length" class="grid g-2 section">
        <div class="card">
          <div class="card-head"><h2>Power curve</h2><span class="hint">best average power per duration</span></div>
          <ChartBox v-if="powerChart" :config="powerChart" :height="240" />
        </div>
        <div class="card table-wrap">
          <table class="data">
            <thead><tr><th>Duration</th><th class="r">Watts</th><th>Activity</th><th class="r">Date</th></tr></thead>
            <tbody>
              <tr v-for="p in power" :key="p.secs">
                <td>{{ POWER_LABELS[p.secs] ?? `${p.secs} s` }}</td>
                <td class="r"><strong>{{ p.watts }}</strong></td>
                <td><ActLink :gid="p.garmin_id">{{ p.name }}</ActLink></td>
                <td class="r">{{ fmtDate(p.date) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.zones { display: flex; flex-direction: column; gap: 10px; margin-top: 4px; }
.zone-row { display: grid; grid-template-columns: 28px 1fr auto; align-items: center; gap: 10px; font-size: 13px; }
.zl { color: var(--text-2); font-weight: 600; }
.zv { color: var(--text-2); white-space: nowrap; font-variant-numeric: tabular-nums; }
.bar-bg { background: var(--surface-2); border-radius: 4px; height: 12px; overflow: hidden; }
.bar { height: 100%; border-radius: 0 4px 4px 0; min-width: 2px; }
</style>
