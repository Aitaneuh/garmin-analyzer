<script setup lang="ts">
const { units, sport, year } = useFilters()
const { data: s, pending } = useStats()
const { data: recent } = useFetch<any[]>('/api/activities', { query: computed(() => ({ sport: sport.value, year: year.value })), server: false })

const metric = ref<'distance' | 'time' | 'elevation'>('distance')
const t = computed(() => s.value?.totals)

function metricValue(agg: any) {
  if (metric.value === 'distance') return toDist(agg.distance, units.value)
  if (metric.value === 'time') return agg.moving_time / 3600
  return toElev(agg.elevation, units.value)
}
const metricUnit = computed(() => (metric.value === 'distance' ? distUnit(units.value) : metric.value === 'time' ? 'h' : elevUnit(units.value)))

// Monthly chart: stacked by sport group when several sports are visible.
const monthlyChart = computed(() => {
  const st = s.value
  if (!st) return null
  const m = metric.value
  const u = units.value
  return () => {
    const labels = st.monthly.map((x: any) => x.month)
    const groups = new Map<string, number[]>()
    if (m !== 'elevation') {
      for (const [sp, v] of Object.entries<any>(st.monthlyBySport)) {
        const g = sportGroup(sp)
        const arr = groups.get(g) ?? new Array(labels.length).fill(0)
        const src = m === 'distance' ? v.distance : v.time
        src.forEach((x: number, i: number) => { arr[i] += m === 'distance' ? toDist(x, u) : x / 3600 })
        groups.set(g, arr)
      }
    }
    const datasets = m === 'elevation' || groups.size <= 1
      ? [{ label: m === 'elevation' ? 'Elevation' : m === 'time' ? 'Moving time' : 'Distance', data: st.monthly.map(metricValue), backgroundColor: series(2) }]
      : GROUP_ORDER.filter(g => groups.has(g)).map(g => ({ label: g, data: groups.get(g)!, backgroundColor: groupColor(g), borderColor: cssVar('--surface'), borderWidth: 1, borderRadius: 2 }))
    return {
      type: 'bar' as const,
      data: { labels, datasets },
      options: {
        plugins: {
          legend: { display: datasets.length > 1, position: 'bottom' as const },
          tooltip: {
            callbacks: {
              title: (items: any) => fmtDate(`${items[0].label}-01`, { month: 'long', year: 'numeric' }),
              label: (c: any) => ` ${c.dataset.label}: ${nf(c.raw, 1)} ${metricUnit.value}`,
            },
          },
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 12, callback(this: any, v: any) { const l = this.getLabelForValue(v); return l.endsWith('-01') || labels.length <= 24 ? fmtDate(`${l}-01`, labels.length <= 24 ? { month: 'short' } : { year: 'numeric' }) : '' } } },
          y: { stacked: true, beginAtZero: true, title: { display: true, text: metricUnit.value } },
        },
      },
    }
  }
})

const weeklyChart = computed(() => {
  const st = s.value
  if (!st) return null
  void units.value
  void metric.value
  return () => ({
    type: 'bar' as const,
    data: {
      labels: st.weekly.map((w: any) => w.week),
      datasets: [{ label: 'Per week', data: st.weekly.map(metricValue), backgroundColor: series(1), borderRadius: 3 }],
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { title: (i: any) => `Week of ${fmtDate(i[0].label)}`, label: (c: any) => ` ${nf(c.raw, 1)} ${metricUnit.value} · ${st.weekly[c.dataIndex].count} activities` } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 16, callback(this: any, v: any) { return fmtDate(this.getLabelForValue(v), { month: 'short' }) } } },
        y: { beginAtZero: true, title: { display: true, text: metricUnit.value } },
      },
    },
  })
})

const sportChart = computed(() => {
  const st = s.value
  if (!st) return null
  const rows = st.bySport.slice(0, 12)
  return () => ({
    type: 'bar' as const,
    data: {
      labels: rows.map((r: any) => sportLabel(r.sport)),
      datasets: [{ label: 'Moving time', data: rows.map((r: any) => r.moving_time / 3600), backgroundColor: rows.map((r: any) => sportColor(r.sport)), borderRadius: 4, barThickness: 16 }],
    },
    options: {
      indexAxis: 'y' as const,
      plugins: {
        legend: { display: false },
        tooltip: { mode: 'nearest' as const, intersect: true, callbacks: { label: (c: any) => { const r = rows[c.dataIndex]; return ` ${fmtDuration(r.moving_time, { long: true })} · ${r.count} activities · ${fmtDist(r.distance, units.value)}` } } },
      },
      scales: { x: { beginAtZero: true, title: { display: true, text: 'hours' } }, y: { grid: { display: false } } },
    },
  })
})

// Latest fitness numbers from the training-load model + Garmin health data.
const { data: well } = useWellness(30)
const load = computed(() => s.value?.trainingLoad?.at(-1))
const formLabel = computed(() => {
  const v = load.value?.tsb
  if (v == null) return ''
  if (v > 15) return 'fresh'
  if (v > 5) return 'rested'
  if (v > -10) return 'neutral'
  if (v > -30) return 'productive'
  return 'overreaching'
})
</script>

<template>
  <div>
    <div class="row" style="margin-bottom: 14px">
      <h1>Overview</h1>
      <span class="pill">{{ sportLabel(sport) }} · {{ year === 'all' ? 'All time' : year }}</span>
    </div>

    <div v-if="pending && !s" class="empty">Crunching numbers…</div>
    <div v-else-if="s && !t.count" class="empty">No activities for this filter yet. Try another sport or year, or run a sync.</div>

    <template v-else-if="s">
      <div class="tiles">
        <StatTile accent label="Activities" :value="nf(t.count)" :sub="`${nf(t.perWeek, 1)} per week`" />
        <StatTile accent label="Distance" :value="fmtDist(t.distance, units, 0)" :sub="`${fmtDist(t.distPerWeek, units, 1)} / week`" />
        <StatTile accent label="Moving time" :value="fmtDuration(t.moving_time, { long: true })" :sub="`${fmtDuration(t.timePerWeek)} / week`" />
        <StatTile accent label="Elevation gain" :value="fmtElev(t.elevation, units)" :sub="`${nf(t.everests, 1)}× Everest`" />
        <StatTile label="Active days" :value="nf(s.streaks.activeDays)" :sub="`${nf(s.streaks.activeDays / Math.max(1, t.periodDays) * 100, 0)}% of days`" />
        <StatTile label="Current streak" :value="`${s.streaks.currentDays} d`" :sub="`${s.streaks.currentWeeks} weeks in a row`" />
        <StatTile label="Eddington" :value="units === 'metric' ? s.eddington.km.value : s.eddington.mi.value" :sub="`${units === 'metric' ? s.eddington.km.daysForNext : s.eddington.mi.daysForNext} more days for next`" />
        <StatTile label="Avg speed" :value="fmtSpeed(t.avg_speed, units, sport === 'AllRuns' ? 'Run' : sport)" :sub="`avg ${fmtDist(t.avg_distance, units, 1)} per activity`" />
        <StatTile label="Avg heart rate" :value="t.avg_hr ? `${nf(t.avg_hr)} bpm` : '–'" :sub="t.max_hr ? `max ${nf(t.max_hr)} bpm` : ''" />
        <StatTile label="Calories" :value="t.calories ? nf(t.calories) : '–'" :sub="t.kilojoules ? `${nf(t.kilojoules)} kJ of work` : `${nf(t.calories / Math.max(1, t.count))} per activity`" />
        <StatTile label="Training load" :value="t.load ? nf(t.load) : '–'" :sub="t.avg_aerobic_te ? `avg aerobic TE ${nf(t.avg_aerobic_te, 1)}` : 'Garmin EPOC-based load'" />
        <StatTile label="Races" :value="nf(s.flags.races)" :sub="`${nf(s.flags.trainer)} indoor activities`" />
      </div>

      <div class="card section">
        <div class="card-head">
          <h2>Activity calendar</h2>
          <span class="hint">{{ year === 'all' ? 'Last 365 days' : year }} · shade = distance (quantiles)</span>
        </div>
        <CalendarHeatmap :days="s.calendar" metric="distance" />
      </div>

      <div class="row section" style="margin-bottom: 10px">
        <h2>Volume</h2>
        <span class="spacer" />
        <div class="seg">
          <button v-for="m in (['distance', 'time', 'elevation'] as const)" :key="m" :class="{ on: metric === m }" @click="metric = m">{{ m === 'time' ? 'Time' : m[0]!.toUpperCase() + m.slice(1) }}</button>
        </div>
      </div>
      <div class="grid g-2">
        <div class="card span-2">
          <div class="card-head"><h3>Per month</h3></div>
          <ChartBox v-if="monthlyChart" :config="monthlyChart" :height="280" />
        </div>
        <div class="card">
          <div class="card-head"><h3>Per week</h3><span class="hint">{{ year === 'all' ? 'last 52 weeks' : year }}</span></div>
          <ChartBox v-if="weeklyChart" :config="weeklyChart" :height="240" />
        </div>
        <div class="card">
          <div class="card-head"><h3>Time by sport</h3><span class="hint">{{ year === 'all' ? 'all time' : year }}</span></div>
          <ChartBox v-if="sportChart" :config="sportChart" :height="Math.max(160, Math.min(12, s.bySport.length) * 26 + 40)" />
        </div>
      </div>

      <div class="grid g-2 section">
        <div class="card">
          <div class="card-head"><h2>Fun facts</h2></div>
          <ul class="facts">
            <li>You've gone around the Earth <strong>{{ nf(t.earthLaps, 2) }}×</strong> ({{ nf(t.moonTrips * 100, 1) }}% of the way to the Moon).</li>
            <li>You've climbed <strong>{{ nf(t.everests, 1) }} Everests</strong>.</li>
            <li>That's <strong>{{ nf(t.moving_time / 86400, 1) }} days</strong> of pure moving time, plus {{ fmtDuration(t.paused_time, { long: true }) }} paused.</li>
            <li>Longest daily streak: <strong>{{ s.streaks.longestDays }} days</strong><template v-if="s.streaks.longestDaysFrom"> ({{ fmtDate(s.streaks.longestDaysFrom) }} → {{ fmtDate(s.streaks.longestDaysTo) }})</template>. Longest weekly streak: <strong>{{ s.streaks.longestWeeks }} weeks</strong>.</li>
            <li v-if="t.first">First activity: <ActLink :gid="t.first.garmin_id">{{ t.first.name }}</ActLink> on {{ fmtDate(t.first.date) }}.</li>
            <li><strong>{{ s.flags.withGps }}</strong> with GPS, <strong>{{ s.flags.trainer }}</strong> indoor, <strong>{{ s.flags.races }}</strong> races.</li>
            <li>{{ s.flags.withHr }} activities with heart rate, {{ s.flags.withDynamics }} with running dynamics, {{ s.flags.withPower }} with power.</li>
            <li v-if="t.avg_temp != null">Average temperature: <strong>{{ units === 'metric' ? `${nf(t.avg_temp, 1)} °C` : `${nf(t.avg_temp * 9 / 5 + 32, 0)} °F` }}</strong>.</li>
          </ul>
        </div>
        <div class="card">
          <div class="card-head"><h2>Fitness snapshot</h2><NuxtLink to="/training" class="hint">Training →</NuxtLink></div>
          <table class="data">
            <tbody>
              <tr v-if="load"><td>Fitness <span class="muted">(42-day load)</span></td><td class="r"><strong>{{ nf(load.ctl) }}</strong></td></tr>
              <tr v-if="load"><td>Fatigue <span class="muted">(7-day load)</span></td><td class="r">{{ nf(load.atl) }}</td></tr>
              <tr v-if="load"><td>Form</td><td class="r">{{ nf(load.tsb) }} <span class="muted">· {{ formLabel }}</span></td></tr>
              <tr v-if="well?.latest?.vo2max"><td>VO2 max</td><td class="r"><strong>{{ nf(well.latest.vo2max.value, 0) }}</strong></td></tr>
              <tr v-if="well?.averages?.rhr?.d7"><td>Resting HR <span class="muted">(7-day avg)</span></td><td class="r">{{ nf(well.averages.rhr.d7) }} bpm</td></tr>
              <tr v-if="well?.averages?.hrv?.d7"><td>HRV <span class="muted">(7-day avg)</span></td><td class="r">{{ nf(well.averages.hrv.d7) }} ms</td></tr>
              <tr v-if="well?.averages?.sleep_s?.d7"><td>Sleep <span class="muted">(7-day avg)</span></td><td class="r">{{ fmtDuration(well.averages.sleep_s.d7) }}</td></tr>
            </tbody>
          </table>
          <p v-if="!well?.hasData" class="muted" style="margin: 10px 0 0; font-size: 12.5px">Log in to Garmin Connect in <NuxtLink to="/setup">Settings</NuxtLink> to add VO2 max, resting HR, HRV and sleep.</p>
        </div>
      </div>

      <div class="card section">
        <div class="card-head"><h2>Sports breakdown</h2></div>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Sport</th><th class="r">Activities</th><th class="r">Distance</th><th class="r">Time</th><th class="r">Elevation</th><th class="r">Avg speed / pace</th><th class="r">Avg HR</th><th class="r">Calories</th></tr></thead>
            <tbody>
              <tr v-for="r in s.bySport" :key="r.sport">
                <td><span class="swatch" :style="{ background: sportColor(r.sport) }" />{{ sportLabel(r.sport) }}</td>
                <td class="r">{{ nf(r.count) }}</td>
                <td class="r">{{ r.distance ? fmtDist(r.distance, units, 0) : '–' }}</td>
                <td class="r">{{ fmtDuration(r.moving_time, { long: true }) }}</td>
                <td class="r">{{ r.elevation ? fmtElev(r.elevation, units) : '–' }}</td>
                <td class="r">{{ r.distance ? fmtSpeed(r.avg_speed, units, r.sport) : '–' }}</td>
                <td class="r">{{ r.avg_hr ? nf(r.avg_hr) : '–' }}</td>
                <td class="r">{{ r.calories ? nf(r.calories) : '–' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card section">
        <div class="card-head"><h2>Recent activities</h2><NuxtLink to="/activities" class="hint">See all →</NuxtLink></div>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Date</th><th>Name</th><th>Sport</th><th class="r">Distance</th><th class="r">Time</th><th class="r">Pace / speed</th><th class="r">Elev</th><th class="r">HR</th></tr></thead>
            <tbody>
              <tr v-for="a in (recent ?? []).slice(0, 10)" :key="a.id">
                <td>{{ fmtDate(a.start_date_local) }}</td>
                <td><ActLink :gid="a.garmin_id">{{ a.name }}</ActLink></td>
                <td><span class="swatch" :style="{ background: sportColor(a.sport_type) }" />{{ sportLabel(a.sport_type) }}</td>
                <td class="r">{{ a.distance ? fmtDist(a.distance, units) : '–' }}</td>
                <td class="r">{{ fmtDuration(a.moving_time) }}</td>
                <td class="r">{{ a.distance ? fmtSpeed(a.average_speed, units, a.sport_type) : '–' }}</td>
                <td class="r">{{ fmtElev(a.total_elevation_gain, units) }}</td>
                <td class="r">{{ a.average_heartrate ? nf(a.average_heartrate) : '–' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.facts { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 8px; color: var(--text-2); }
.facts strong { color: var(--text); }
</style>
