<script setup lang="ts">
const { units, sport, year } = useFilters()
const { data: s, pending } = useStats()

const pace = computed(() => isPaceSport(sport.value))
const singleSport = computed(() => sport.value !== 'all')
const speedUnit = computed(() => (pace.value ? `min/${distUnit(units.value)}` : units.value === 'imperial' ? 'mph' : 'km/h'))
const fmtPaceTick = (v: number) => (pace.value ? fmtClock(v * 60) : nf(v, 1))

const xMonth = (labels: string[]) => ({
  grid: { display: false },
  ticks: {
    maxRotation: 0, autoSkipPadding: 14,
    callback(this: any, v: any) { const l = this.getLabelForValue(v); return fmtDate(`${l}-01`, labels.length <= 24 ? { month: 'short' } : { month: 'short', year: '2-digit' }) },
  },
})

// Year over year cumulative distance: selected/current year highlighted, previous year second, rest as context.
const yoyChart = computed(() => {
  const st = s.value
  if (!st) return null
  void units.value
  return () => {
    const years = Object.keys(st.yoy).sort()
    const focus = year.value !== 'all' ? year.value : years.at(-1)
    const prev = String(Number(focus) - 1)
    const datasets = years.map(y => {
      const isFocus = y === focus
      const isPrev = y === prev
      return {
        label: y,
        data: st.yoy[y].map((v: number, x: number) => ({ x, y: toDist(v, units.value) })),
        borderColor: isFocus ? series(2) : isPrev ? series(1) : cssVar('--other'),
        borderWidth: isFocus ? 2.5 : isPrev ? 2 : 1.25,
        order: isFocus ? 0 : isPrev ? 1 : 2,
        pointRadius: 0,
      }
    })
    return {
      type: 'line' as const,
      data: { datasets },
      options: {
        interaction: { mode: 'nearest' as const, intersect: false, axis: 'x' as const },
        plugins: {
          legend: { position: 'bottom' as const },
          tooltip: {
            mode: 'index' as const,
            itemSort: (a: any, b: any) => b.parsed.y - a.parsed.y,
            callbacks: {
              title: (i: any) => new Date(Date.UTC(2024, 0, 1 + i[0].parsed.x)).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }),
              label: (c: any) => ` ${c.dataset.label}: ${nf(c.parsed.y, 0)} ${distUnit(units.value)}`,
            },
          },
        },
        scales: {
          x: {
            type: 'linear' as const, min: 0, max: 365, grid: { display: false },
            // one tick on the 1st of each month (leap-year day numbers)
            afterBuildTicks: (axis: any) => { axis.ticks = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335].map(value => ({ value })) },
            ticks: { callback: (v: any) => new Date(Date.UTC(2024, 0, 1 + Number(v))).toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' }) },
          },
          y: { beginAtZero: true, title: { display: true, text: distUnit(units.value) } },
        },
      },
    }
  }
})

function yearBar(field: 'distance' | 'moving_time' | 'elevation' | 'count', color: number) {
  return computed(() => {
    const st = s.value
    if (!st) return null
    void units.value
    const conv = (r: any) => field === 'distance' ? toDist(r.distance, units.value) : field === 'moving_time' ? r.moving_time / 3600 : field === 'elevation' ? toElev(r.elevation, units.value) : r.count
    const unit = field === 'distance' ? distUnit(units.value) : field === 'moving_time' ? 'h' : field === 'elevation' ? elevUnit(units.value) : ''
    return () => ({
      type: 'bar' as const,
      data: { labels: st.byYear.map((r: any) => String(r.year)), datasets: [{ label: field, data: st.byYear.map(conv), backgroundColor: series(color), maxBarThickness: 48 }] },
      options: {
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c: any) => ` ${nf(c.raw, field === 'count' ? 0 : 1)} ${unit}` } } },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true } },
      },
    })
  })
}
const yearDist = yearBar('distance', 2)
const yearTime = yearBar('moving_time', 1)
const yearElev = yearBar('elevation', 3)
const yearCount = yearBar('count', 7)

const speedChart = computed(() => {
  const st = s.value
  if (!st || !singleSport.value) return null
  void units.value
  const rows = st.monthly.filter((m: any) => m.count > 0 && m.distance > 0)
  return () => ({
    type: 'line' as const,
    data: {
      labels: rows.map((m: any) => m.month),
      datasets: [{ label: pace.value ? 'Avg pace' : 'Avg speed', data: rows.map((m: any) => speedValue(m.avg_speed, units.value, pace.value)), borderColor: series(2), backgroundColor: series(2), pointRadius: 2.5, tension: 0.25 }],
    },
    options: {
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: (i: any) => fmtDate(`${i[0].label}-01`, { month: 'long', year: 'numeric' }), label: (c: any) => ` ${fmtPaceTick(c.raw)} ${speedUnit.value} · ${rows[c.dataIndex].count} activities` } } },
      scales: { x: xMonth(rows.map((m: any) => m.month)), y: { reverse: pace.value, title: { display: true, text: speedUnit.value }, ticks: { callback: (v: any) => fmtPaceTick(v) } } },
    },
  })
})

const hrChart = computed(() => {
  const st = s.value
  if (!st) return null
  const rows = st.monthly.filter((m: any) => m.avg_hr)
  if (!rows.length) return null
  return () => ({
    type: 'line' as const,
    data: { labels: rows.map((m: any) => m.month), datasets: [{ label: 'Avg heart rate', data: rows.map((m: any) => m.avg_hr), borderColor: series(8), backgroundColor: series(8), pointRadius: 2.5, tension: 0.25 }] },
    options: {
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: (i: any) => fmtDate(`${i[0].label}-01`, { month: 'long', year: 'numeric' }), label: (c: any) => ` ${nf(c.raw)} bpm` } } },
      scales: { x: xMonth(rows.map((m: any) => m.month)), y: { title: { display: true, text: 'bpm' } } },
    },
  })
})

const elevMonthChart = computed(() => {
  const st = s.value
  if (!st) return null
  void units.value
  return () => ({
    type: 'bar' as const,
    data: { labels: st.monthly.map((m: any) => m.month), datasets: [{ label: 'Elevation', data: st.monthly.map((m: any) => toElev(m.elevation, units.value)), backgroundColor: series(3), borderRadius: 3 }] },
    options: {
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: (i: any) => fmtDate(`${i[0].label}-01`, { month: 'long', year: 'numeric' }), label: (c: any) => ` ${nf(c.raw)} ${elevUnit(units.value)}` } } },
      scales: { x: xMonth(st.monthly.map((m: any) => m.month)), y: { beginAtZero: true, title: { display: true, text: elevUnit(units.value) } } },
    },
  })
})

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const dowChart = computed(() => {
  const st = s.value
  if (!st) return null
  return () => ({
    type: 'bar' as const,
    data: { labels: DOW, datasets: [{ label: 'Activities', data: st.dayOfWeek.map((d: any) => d.count), backgroundColor: series(1) }] },
    options: {
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c: any) => { const d = st.dayOfWeek[c.dataIndex]; return ` ${d.count} activities · ${fmtDist(d.distance, units.value, 0)} · ${fmtDuration(d.moving_time, { long: true })}` } } } },
      scales: { x: { grid: { display: false } }, y: { beginAtZero: true } },
    },
  })
})

const hodChart = computed(() => {
  const st = s.value
  if (!st) return null
  return () => ({
    type: 'bar' as const,
    data: { labels: st.hourOfDay.map((_: any, h: number) => `${h}h`), datasets: [{ label: 'Activities started', data: st.hourOfDay.map((d: any) => d.count), backgroundColor: series(7), borderRadius: 3 }] },
    options: {
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: (i: any) => `${i[0].dataIndex}:00 – ${i[0].dataIndex}:59`, label: (c: any) => ` ${c.raw} activities started` } } },
      scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 6 } }, y: { beginAtZero: true } },
    },
  })
})

const histChart = computed(() => {
  const st = s.value
  if (!st) return null
  const h = units.value === 'imperial' ? st.histogram.imperial : st.histogram.metric
  const div = units.value === 'imperial' ? 1609.344 : 1000
  const labels = h.edges.map((e: number, i: number) => {
    const a = nf(e / div, e / div % 1 ? 1 : 0)
    const next = h.edges[i + 1]
    return next ? `${a}–${nf(next / div, next / div % 1 ? 1 : 0)}` : `${a}+`
  })
  return () => ({
    type: 'bar' as const,
    data: { labels, datasets: [{ label: 'Activities', data: h.counts, backgroundColor: series(2) }] },
    options: {
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: (i: any) => `${i[0].label} ${distUnit(units.value)}`, label: (c: any) => ` ${c.raw} activities` } } },
      scales: { x: { grid: { display: false }, title: { display: true, text: distUnit(units.value) } }, y: { beginAtZero: true } },
    },
  })
})

const hrHistChart = computed(() => {
  const st = s.value
  if (!st?.hrHistogram.length) return null
  return () => ({
    type: 'bar' as const,
    data: { labels: st.hrHistogram.map((r: any) => `${r.bpm}`), datasets: [{ label: 'Activities', data: st.hrHistogram.map((r: any) => r.count), backgroundColor: series(8) }] },
    options: {
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: (i: any) => `${i[0].label}–${Number(i[0].label) + 4} bpm average`, label: (c: any) => ` ${c.raw} activities` } } },
      scales: { x: { grid: { display: false }, title: { display: true, text: 'average bpm' } }, y: { beginAtZero: true } },
    },
  })
})

function scatterChart(yField: 'spd' | 'hr', xField: 'dist' | 'hr' | 'd') {
  return computed(() => {
    const st = s.value
    if (!st || !singleSport.value) return null
    void units.value
    const pts = st.scatter.filter((p: any) => p[yField] != null && (xField !== 'hr' || p.hr != null))
    if (pts.length < 3) return null
    const yv = (p: any) => yField === 'spd' ? speedValue(p.spd, units.value, pace.value) : p.hr
    const xv = (p: any) => xField === 'dist' ? toDist(p.dist, units.value) : xField === 'hr' ? p.hr : new Date(p.d).getTime()
    return () => ({
      type: 'scatter' as const,
      data: { datasets: [{ label: 'Activities', data: pts.map((p: any) => ({ x: xv(p), y: yv(p) })), backgroundColor: series(1), borderColor: cssVar('--surface'), borderWidth: 1, pointRadius: 4, pointHoverRadius: 6 }] },
      options: {
        interaction: { mode: 'nearest' as const, intersect: true },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (i: any) => fmtDate(pts[i[0].dataIndex].d),
              label: (c: any) => { const p = pts[c.dataIndex]; return ` ${fmtDist(p.dist, units.value)} · ${fmtSpeed(p.spd, units.value, pace.value ? 'Run' : 'Ride')}${p.hr ? ` · ${nf(p.hr)} bpm` : ''}` },
            },
          },
        },
        scales: {
          x: xField === 'd'
            ? { type: 'linear' as const, ticks: { callback: (v: any) => new Date(v).getUTCFullYear() }, grid: { display: false } }
            : { title: { display: true, text: xField === 'dist' ? distUnit(units.value) : 'avg heart rate (bpm)' }, grid: { display: false } },
          y: yField === 'spd'
            ? { reverse: pace.value, title: { display: true, text: speedUnit.value }, ticks: { callback: (v: any) => fmtPaceTick(v) } }
            : { title: { display: true, text: 'bpm' } },
        },
      },
    })
  })
}
const distVsSpeed = scatterChart('spd', 'dist')
const hrVsSpeed = scatterChart('spd', 'hr')
const speedOverTime = scatterChart('spd', 'd')
</script>

<template>
  <div>
    <div class="row" style="margin-bottom: 14px">
      <h1>Trends</h1>
      <span class="pill">{{ sportLabel(sport) }} · {{ year === 'all' ? 'All time' : year }}</span>
    </div>
    <div v-if="pending && !s" class="empty">Loading…</div>
    <template v-else-if="s">
      <div class="card">
        <div class="card-head"><h2>Year over year · cumulative distance</h2><span class="hint">{{ year === 'all' ? 'current year' : year }} highlighted</span></div>
        <ChartBox v-if="yoyChart" :config="yoyChart" :height="320" />
      </div>

      <div class="section"><h2>Per year</h2></div>
      <div class="grid g-4">
        <div class="card"><div class="card-head"><h3>Distance ({{ distUnit(units) }})</h3></div><ChartBox v-if="yearDist" :config="yearDist" :height="180" /></div>
        <div class="card"><div class="card-head"><h3>Moving time (h)</h3></div><ChartBox v-if="yearTime" :config="yearTime" :height="180" /></div>
        <div class="card"><div class="card-head"><h3>Elevation ({{ elevUnit(units) }})</h3></div><ChartBox v-if="yearElev" :config="yearElev" :height="180" /></div>
        <div class="card"><div class="card-head"><h3>Activities</h3></div><ChartBox v-if="yearCount" :config="yearCount" :height="180" /></div>
      </div>
      <div class="card section table-wrap">
        <table class="data">
          <thead><tr><th>Year</th><th class="r">Activities</th><th class="r">Distance</th><th class="r">Time</th><th class="r">Elevation</th><th class="r">Avg {{ pace ? 'pace' : 'speed' }}</th><th class="r">Avg HR</th><th class="r">Load</th><th class="r">Δ distance</th></tr></thead>
          <tbody>
            <tr v-for="(r, i) in [...s.byYear].reverse()" :key="r.year">
              <td><strong>{{ r.year }}</strong></td>
              <td class="r">{{ nf(r.count) }}</td>
              <td class="r">{{ fmtDist(r.distance, units, 0) }}</td>
              <td class="r">{{ fmtDuration(r.moving_time, { long: true }) }}</td>
              <td class="r">{{ fmtElev(r.elevation, units) }}</td>
              <td class="r">{{ singleSport ? fmtSpeed(r.avg_speed, units, pace ? 'Run' : 'Ride') : '–' }}</td>
              <td class="r">{{ r.avg_hr ? nf(r.avg_hr) : '–' }}</td>
              <td class="r">{{ r.load ? nf(r.load) : '–' }}</td>
              <td class="r">
                <template v-if="s.byYear[s.byYear.length - 2 - i]">
                  <span :style="{ color: r.distance >= s.byYear[s.byYear.length - 2 - i].distance ? 'var(--good)' : 'var(--critical)' }">
                    {{ r.distance >= s.byYear[s.byYear.length - 2 - i].distance ? '▲' : '▼' }}
                    {{ nf(Math.abs(r.distance / Math.max(1, s.byYear[s.byYear.length - 2 - i].distance) - 1) * 100, 0) }}%
                  </span>
                </template>
                <span v-else class="muted">–</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="section"><h2>Performance</h2></div>
      <div v-if="!singleSport" class="notice" style="margin-bottom: 14px">Pick a sport in the top bar (e.g. <em>All runs</em>) to see pace/speed trends and scatter plots — mixing sports would make them meaningless.</div>
      <div class="grid g-2">
        <div v-if="speedChart" class="card"><div class="card-head"><h3>Monthly average {{ pace ? 'pace' : 'speed' }}</h3><span class="hint">{{ speedUnit }}</span></div><ChartBox :config="speedChart" :height="240" /></div>
        <div v-if="hrChart" class="card"><div class="card-head"><h3>Monthly average heart rate</h3><span class="hint">time-weighted</span></div><ChartBox :config="hrChart" :height="240" /></div>
        <div v-if="speedOverTime" class="card"><div class="card-head"><h3>Every activity: {{ pace ? 'pace' : 'speed' }} over time</h3></div><ChartBox :config="speedOverTime" :height="260" /></div>
        <div v-if="distVsSpeed" class="card"><div class="card-head"><h3>Distance vs {{ pace ? 'pace' : 'speed' }}</h3></div><ChartBox :config="distVsSpeed" :height="260" /></div>
        <div v-if="hrVsSpeed" class="card"><div class="card-head"><h3>Heart rate vs {{ pace ? 'pace' : 'speed' }}</h3><span class="hint">aerobic efficiency</span></div><ChartBox :config="hrVsSpeed" :height="260" /></div>
        <div class="card"><div class="card-head"><h3>Monthly elevation</h3></div><ChartBox v-if="elevMonthChart" :config="elevMonthChart" :height="240" /></div>
      </div>

      <div class="section"><h2>Habits</h2></div>
      <div class="grid g-2">
        <div class="card"><div class="card-head"><h3>Day of week</h3></div><ChartBox v-if="dowChart" :config="dowChart" :height="220" /></div>
        <div class="card"><div class="card-head"><h3>Start time</h3></div><ChartBox v-if="hodChart" :config="hodChart" :height="220" /></div>
        <div class="card span-2"><div class="card-head"><h3>When you train</h3><span class="hint">day × hour · darker = more activities</span></div><Punchcard :data="s.punchcard" /></div>
        <div class="card"><div class="card-head"><h3>Distance distribution</h3></div><ChartBox v-if="histChart" :config="histChart" :height="220" /></div>
        <div v-if="hrHistChart" class="card"><div class="card-head"><h3>Average heart rate distribution</h3></div><ChartBox :config="hrHistChart" :height="220" /></div>
      </div>
    </template>
  </div>
</template>
