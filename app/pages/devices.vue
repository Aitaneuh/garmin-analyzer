<script setup lang="ts">
const { units, year } = useFilters()
const { data: s, pending } = useStats()
const { data: status } = useStatus()

const profile = computed(() => status.value?.garmin.profile ?? {})
const zoneRows = computed(() => {
  const b: number[] | undefined = s.value?.hrZones?.bounds
  if (!b?.length) return []
  // Garmin stores the upper bound of each zone; the first value is the top of "zone 0".
  const tops = b.length > 5 ? b.slice(b.length - 5) : b
  const floor = b.length > 5 ? b[b.length - 6]! : null
  return tops.map((top, i) => ({ zone: i + 1, from: i === 0 ? floor : tops[i - 1], to: top }))
})
const zoneTotal = computed(() => (s.value?.hrZones?.totals ?? []).reduce((a: number, b: number) => a + b, 0))
</script>

<template>
  <div>
    <div class="row" style="margin-bottom: 14px">
      <h1>Devices &amp; zones</h1>
      <span class="pill">{{ year === 'all' ? 'All time' : year }}</span>
    </div>
    <div v-if="pending && !s" class="empty">Loading…</div>
    <template v-else-if="s">
      <div class="card table-wrap">
        <div class="card-head"><h2>Recording devices</h2><span class="hint">from the FIT files</span></div>
        <div v-if="!s.devices.length" class="muted">No device information yet.</div>
        <table v-else class="data">
          <thead><tr><th>Device</th><th class="r">Activities</th><th class="r">Distance</th><th class="r">Time</th><th class="r">First used</th><th class="r">Last used</th></tr></thead>
          <tbody>
            <tr v-for="d in s.devices" :key="d.name">
              <td><strong>{{ d.name }}</strong></td>
              <td class="r">{{ nf(d.count) }}</td>
              <td class="r">{{ fmtDist(d.distance, units, 0) }}</td>
              <td class="r">{{ fmtDuration(d.time, { long: true }) }}</td>
              <td class="r">{{ fmtDate(d.first) }}</td>
              <td class="r">{{ fmtDate(d.last) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="grid g-2 section">
        <div class="card">
          <div class="card-head"><h2>Heart-rate zones</h2><span class="hint">as set on your watch (latest activity)</span></div>
          <div v-if="!zoneRows.length" class="muted">No zone information in your FIT files yet.</div>
          <table v-else class="data">
            <thead><tr><th>Zone</th><th class="r">Range</th><th class="r">Time {{ year === 'all' ? '' : `(${year})` }}</th><th class="r">Share</th></tr></thead>
            <tbody>
              <tr v-for="z in zoneRows" :key="z.zone">
                <td><span class="swatch" :style="{ background: seq(z.zone) }" />Zone {{ z.zone }}</td>
                <td class="r">{{ z.from != null ? `${z.from}–${z.to}` : `≤ ${z.to}` }} bpm</td>
                <td class="r">{{ fmtDuration(s.hrZones.totals[z.zone - 1], { long: true }) }}</td>
                <td class="r">{{ zoneTotal ? `${nf(s.hrZones.totals[z.zone - 1] / zoneTotal * 100, 0)}%` : '–' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="card">
          <div class="card-head"><h2>Physiological profile</h2><span class="hint">from Garmin Connect</span></div>
          <div v-if="!Object.keys(profile).length" class="muted">Log in to Garmin Connect in <NuxtLink to="/setup">Settings</NuxtLink> to show your profile values.</div>
          <table v-else class="data">
            <tbody>
              <tr v-if="profile.vo2MaxRunning"><td>VO2 max (running)</td><td class="r">{{ profile.vo2MaxRunning }}</td></tr>
              <tr v-if="profile.vo2MaxCycling"><td>VO2 max (cycling)</td><td class="r">{{ profile.vo2MaxCycling }}</td></tr>
              <tr v-if="profile.lactateThresholdHeartRate"><td>Lactate threshold HR</td><td class="r">{{ profile.lactateThresholdHeartRate }} bpm</td></tr>
              <tr v-if="profile.weight"><td>Weight</td><td class="r">{{ nf(profile.weight / 1000, 1) }} kg</td></tr>
              <tr v-if="profile.height"><td>Height</td><td class="r">{{ nf(profile.height, 0) }} cm</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
