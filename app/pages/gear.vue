<script setup lang="ts">
const { units, year } = useFilters()
const { data: s, pending } = useStats()
const { data: official } = useFetch<any>('/api/athlete-stats', { server: false })

const gearChart = computed(() => {
  const g = (s.value?.gear ?? []).filter((x: any) => x.total_distance > 0)
  if (!g.length) return null
  void units.value
  return () => ({
    type: 'bar' as const,
    data: {
      labels: g.map((x: any) => x.name),
      datasets: [{ label: 'Total distance', data: g.map((x: any) => toDist(x.total_distance, units.value)), backgroundColor: g.map((x: any) => series(x.kind === 'bike' ? 1 : 2)), borderRadius: 4, barThickness: 16 }],
    },
    options: {
      indexAxis: 'y' as const,
      plugins: { legend: { display: false }, tooltip: { mode: 'nearest' as const, intersect: true, callbacks: { label: (c: any) => ` ${nf(c.raw, 0)} ${distUnit(units.value)} total` } } },
      scales: { x: { beginAtZero: true, title: { display: true, text: distUnit(units.value) } }, y: { grid: { display: false } } },
    },
  })
})
const zones = computed(() => official.value?.zones)
</script>

<template>
  <div>
    <div class="row" style="margin-bottom: 14px"><h1>Gear &amp; devices</h1></div>
    <div v-if="pending && !s" class="empty">Loading…</div>
    <template v-else-if="s">
      <div v-if="!s.gear.length" class="empty card">No bikes or shoes on your Strava profile.</div>
      <template v-else>
        <div class="card">
          <div class="card-head">
            <h2>Lifetime distance per item</h2>
            <span class="hint"><span class="swatch" :style="{ background: 'var(--s1)' }" />Bikes <span class="swatch" :style="{ background: 'var(--s2)', marginLeft: '10px' }" />Shoes</span>
          </div>
          <ChartBox v-if="gearChart" :config="gearChart" :height="Math.max(140, s.gear.length * 28 + 40)" />
        </div>
        <div class="card section table-wrap">
          <table class="data">
            <thead><tr><th>Gear</th><th>Type</th><th class="r">Lifetime</th><th class="r">Activities {{ year === 'all' ? '' : `(${year})` }}</th><th class="r">Distance {{ year === 'all' ? '' : `(${year})` }}</th><th class="r">Time</th><th class="r">Elevation</th><th class="r">Avg speed</th></tr></thead>
            <tbody>
              <tr v-for="g in s.gear" :key="g.id">
                <td><strong>{{ g.name }}</strong> <span v-if="g.primary" class="pill">primary</span> <span v-if="g.retired" class="pill">retired</span></td>
                <td>{{ g.kind === 'bike' ? 'Bike' : 'Shoes' }}</td>
                <td class="r">{{ fmtDist(g.total_distance, units, 0) }}</td>
                <td class="r">{{ nf(g.count) }}</td>
                <td class="r">{{ fmtDist(g.distance, units, 0) }}</td>
                <td class="r">{{ fmtDuration(g.moving_time, { long: true }) }}</td>
                <td class="r">{{ fmtElev(g.elevation, units) }}</td>
                <td class="r">{{ g.count ? fmtSpeed(g.avg_speed, units, g.kind === 'shoe' ? 'Run' : 'Ride') : '–' }}</td>
              </tr>
            </tbody>
          </table>
          <p class="muted" style="font-size: 12.5px; margin: 10px 0 0">Shoes are often replaced around 600–800 km (370–500 mi).</p>
        </div>
      </template>

      <div class="grid g-2 section">
        <div class="card">
          <div class="card-head"><h2>Recording devices</h2><span class="hint">from detailed activities</span></div>
          <div v-if="!s.devices.length" class="muted">Appears as activity details are downloaded.</div>
          <table v-else class="data">
            <tbody>
              <tr v-for="d in s.devices" :key="d.name"><td>{{ d.name }}</td><td class="r">{{ nf(d.count) }} activities</td></tr>
            </tbody>
          </table>
        </div>
        <div class="card">
          <div class="card-head"><h2>Your zones</h2><span class="hint">as configured on Strava</span></div>
          <div v-if="!zones?.heart_rate && !zones?.power" class="muted">No zones available.</div>
          <div class="grid g-2">
            <div v-if="zones?.heart_rate?.zones">
              <h3 style="margin-bottom: 6px">Heart rate</h3>
              <table class="data">
                <tbody>
                  <tr v-for="(z, i) in (zones as any).heart_rate.zones" :key="i"><td>Z{{ Number(i) + 1 }}</td><td class="r">{{ z.min }} – {{ z.max === -1 ? '∞' : z.max }} bpm</td></tr>
                </tbody>
              </table>
            </div>
            <div v-if="zones?.power?.zones">
              <h3 style="margin-bottom: 6px">Power</h3>
              <table class="data">
                <tbody>
                  <tr v-for="(z, i) in (zones as any).power.zones" :key="i"><td>Z{{ Number(i) + 1 }}</td><td class="r">{{ z.min }} – {{ z.max === -1 ? '∞' : z.max }} W</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
