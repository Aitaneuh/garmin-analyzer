<script setup lang="ts">
const { units, sport, year } = useFilters()
const { data: s, pending } = useStats()

const recordDefs = computed(() => {
  const u = units.value
  const sp = (r: any) => r.sport_type
  return [
    { key: 'longestDistance', label: 'Longest distance', fmt: (r: any) => fmtDist(r.value, u) },
    { key: 'longestTime', label: 'Longest moving time', fmt: (r: any) => fmtDuration(r.value) },
    { key: 'mostElevation', label: 'Most elevation gain', fmt: (r: any) => fmtElev(r.value, u) },
    { key: 'fastestAvgSpeed', label: 'Fastest average (≥1 km)', fmt: (r: any) => fmtSpeed(r.value, u, sp(r)) },
    { key: 'topSpeed', label: 'Top speed', fmt: (r: any) => fmtSpeed(r.value, u) },
    { key: 'steepest', label: 'Steepest (≥3 km)', fmt: (r: any) => `${nf(r.value, 1)} m/km` },
    { key: 'highestAvgHr', label: 'Highest average HR', fmt: (r: any) => `${nf(r.value)} bpm` },
    { key: 'highestMaxHr', label: 'Highest max HR', fmt: (r: any) => `${nf(r.value)} bpm` },
    { key: 'highestLoad', label: 'Highest training load', fmt: (r: any) => nf(r.value) },
    { key: 'highestAerobicTe', label: 'Highest aerobic TE', fmt: (r: any) => nf(r.value, 1) },
    { key: 'highestAnaerobicTe', label: 'Highest anaerobic TE', fmt: (r: any) => nf(r.value, 1) },
    { key: 'mostCalories', label: 'Most calories', fmt: (r: any) => `${nf(r.value)} kcal` },
    { key: 'highestCadence', label: 'Highest run cadence (≥10 min)', fmt: (r: any) => `${nf(r.value)} spm` },
    { key: 'longestStride', label: 'Longest avg stride (≥10 min)', fmt: (r: any) => (u === 'metric' ? `${nf(r.value, 2)} m` : `${nf(r.value / 0.3048, 2)} ft`) },
    { key: 'highestAvgWatts', label: 'Best normalized power', fmt: (r: any) => `${nf(r.value)} W` },
    { key: 'highestMaxWatts', label: 'Highest max power', fmt: (r: any) => `${nf(r.value)} W` },
  ]
})

const effortName = ref('')
watch(() => s.value?.bestEfforts, (be) => {
  if (be?.length && !be.some((e: any) => e.name === effortName.value)) effortName.value = be.find((e: any) => e.name === '5K')?.name ?? be[0].name
}, { immediate: true })
const effort = computed(() => s.value?.bestEfforts.find((e: any) => e.name === effortName.value))

const progressionChart = computed(() => {
  const e = effort.value
  if (!e || e.perYear.length < 2) return null
  return () => ({
    type: 'line' as const,
    data: { labels: e.perYear.map((p: any) => String(p.year)), datasets: [{ label: `Best ${e.name}`, data: e.perYear.map((p: any) => p.moving_time / 60), borderColor: series(2), backgroundColor: series(2), pointRadius: 4 }] },
    options: {
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c: any) => ` ${fmtClock(c.raw * 60)}` } } },
      scales: { x: { grid: { display: false } }, y: { reverse: true, title: { display: true, text: 'time (lower is better)' }, ticks: { callback: (v: any) => fmtClock(v * 60) } } },
    },
  })
})

const eddingtonUnit = computed(() => (units.value === 'metric' ? 'km' : 'mi'))
const edd = computed(() => (units.value === 'metric' ? s.value?.eddington.km : s.value?.eddington.mi))
</script>

<template>
  <div>
    <div class="row" style="margin-bottom: 14px">
      <h1>Records &amp; PRs</h1>
      <span class="pill">{{ sportLabel(sport) }} · {{ year === 'all' ? 'All time' : year }}</span>
    </div>
    <div v-if="pending && !s" class="empty">Loading…</div>
    <template v-else-if="s">
      <div class="tiles">
        <StatTile accent label="Eddington number" :value="edd?.value ?? 0" :sub="`${edd?.daysForNext} more days of ${edd?.next} ${eddingtonUnit} for E${edd?.next}`" />
        <StatTile accent label="Longest daily streak" :value="`${s.streaks.longestDays} days`" :sub="s.streaks.longestDaysFrom ? `${fmtDate(s.streaks.longestDaysFrom)} → ${fmtDate(s.streaks.longestDaysTo)}` : ''" />
        <StatTile accent label="Current daily streak" :value="`${s.streaks.currentDays} days`" />
        <StatTile accent label="Longest weekly streak" :value="`${s.streaks.longestWeeks} weeks`" :sub="`current: ${s.streaks.currentWeeks} weeks`" />
        <StatTile label="Races" :value="nf(s.flags.races)" />
        <StatTile label="Best-effort distances" :value="nf(s.bestEfforts.length)" :sub="s.bestEfforts.length ? `up to ${s.bestEfforts.at(-1).name}` : ''" />
      </div>
      <p class="muted" style="margin: 8px 2px 0; font-size: 12.5px">
        Eddington number E = the largest number such that you've done at least E {{ eddingtonUnit }} on E different days.
      </p>

      <div class="section"><h2>All-time bests</h2></div>
      <div class="records">
        <template v-for="d in recordDefs" :key="d.key">
          <component :is="s.records[d.key].garmin_id ? 'a' : 'div'" v-if="s.records[d.key]" class="card rec" :href="garminUrl(s.records[d.key].garmin_id)" target="_blank" rel="noopener">
            <div class="rec-label">{{ d.label }}</div>
            <div class="rec-value">{{ d.fmt(s.records[d.key]) }}</div>
            <div class="rec-name">{{ s.records[d.key].name }}</div>
            <div class="muted rec-date"><span class="swatch" :style="{ background: sportColor(s.records[d.key].sport_type) }" />{{ sportLabel(s.records[d.key].sport_type) }} · {{ fmtDate(s.records[d.key].date) }}</div>
          </component>
        </template>
      </div>

      <div class="section row">
        <h2>Best efforts</h2>
        <span class="muted" style="font-size: 12.5px">fastest segment of every run, computed from the FIT distance stream</span>
      </div>
      <div v-if="!s.bestEfforts.length" class="empty card">No best efforts yet. They are computed from runs; select a running sport or all sports.</div>
      <div v-else class="grid g-2">
        <div class="card table-wrap">
          <table class="data">
            <thead><tr><th>Distance</th><th class="r">Best time</th><th class="r">Pace</th><th>Activity</th><th class="r">Date</th></tr></thead>
            <tbody>
              <tr v-for="e in s.bestEfforts" :key="e.name" :class="{ sel: e.name === effortName }" style="cursor: pointer" @click="effortName = e.name">
                <td><strong>{{ e.name }}</strong> <span class="muted">({{ e.count }})</span></td>
                <td class="r"><strong>{{ fmtClock(e.top[0].moving_time) }}</strong></td>
                <td class="r">{{ fmtSpeed(e.distance / e.top[0].moving_time, units, 'Run') }}</td>
                <td><ActLink :gid="e.top[0].garmin_id">{{ e.top[0].activity_name }}</ActLink></td>
                <td class="r">{{ fmtDate(e.top[0].start_date_local) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="effort" class="card">
          <div class="card-head"><h2>{{ effort.name }}</h2><span class="hint">top 5 and best per year</span></div>
          <table class="data">
            <tbody>
              <tr v-for="(t, i) in effort.top" :key="i">
                <td class="muted">#{{ Number(i) + 1 }}</td>
                <td><strong>{{ fmtClock(t.moving_time) }}</strong></td>
                <td>{{ fmtSpeed(t.distance / t.moving_time, units, 'Run') }}</td>
                <td><ActLink :gid="t.garmin_id">{{ t.activity_name }}</ActLink></td>
                <td class="r">{{ fmtDate(t.start_date_local) }}</td>
              </tr>
            </tbody>
          </table>
          <ChartBox v-if="progressionChart" :config="progressionChart" :height="200" style="margin-top: 14px" />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.records { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
.rec { color: inherit; display: block; }
a.rec:hover { text-decoration: none; border-color: var(--accent); }
.rec-label { color: var(--text-2); font-size: 12.5px; font-weight: 550; }
.rec-value { font-size: 22px; font-weight: 650; margin: 4px 0; letter-spacing: -0.02em; }
.rec-name { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rec-date { font-size: 12px; margin-top: 2px; }
tr.sel td { background: var(--surface-2); }
</style>
