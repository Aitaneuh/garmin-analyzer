<script setup lang="ts">
const { units, query } = useFilters()
const version = useDataVersion()
const { data: list, pending } = useFetch<any[]>('/api/activities', {
  query,
  key: computed(() => `acts-${query.value.sport}-${query.value.year}-${version.value}`),
  server: false,
})

const search = ref('')
const sortKey = ref('start_date_local')
const sortDir = ref<1 | -1>(-1)
const page = ref(1)
const perPage = 50
const flags = ref({ race: false, commute: false, trainer: false, hr: false })

const columns = [
  { key: 'start_date_local', label: 'Date' },
  { key: 'name', label: 'Name' },
  { key: 'sport_type', label: 'Sport' },
  { key: 'distance', label: 'Distance', r: true },
  { key: 'moving_time', label: 'Moving', r: true },
  { key: 'elapsed_time', label: 'Elapsed', r: true },
  { key: 'average_speed', label: 'Pace / speed', r: true },
  { key: 'total_elevation_gain', label: 'Elev', r: true },
  { key: 'average_heartrate', label: 'Avg HR', r: true },
  { key: 'max_heartrate', label: 'Max HR', r: true },
  { key: 'average_watts', label: 'Watts', r: true },
  { key: 'average_cadence', label: 'Cadence', r: true },
  { key: 'suffer_score', label: 'Effort', r: true },
  { key: 'calories', label: 'kcal', r: true },
  { key: 'kudos_count', label: 'Kudos', r: true },
  { key: 'pr_count', label: 'PRs', r: true },
]

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  let rows = list.value ?? []
  if (q) rows = rows.filter(a => a.name.toLowerCase().includes(q) || a.sport_type.toLowerCase().includes(q) || (a.device_name ?? '').toLowerCase().includes(q))
  if (flags.value.race) rows = rows.filter(a => a.workout_type === 1 || a.workout_type === 11)
  if (flags.value.commute) rows = rows.filter(a => a.commute)
  if (flags.value.trainer) rows = rows.filter(a => a.trainer)
  if (flags.value.hr) rows = rows.filter(a => a.average_heartrate)
  const k = sortKey.value
  const d = sortDir.value
  return [...rows].sort((a, b) => {
    const va = a[k] ?? -Infinity
    const vb = b[k] ?? -Infinity
    return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * d
  })
})
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / perPage)))
const rows = computed(() => filtered.value.slice((page.value - 1) * perPage, page.value * perPage))
watch([search, flags, sortKey, sortDir, list], () => { page.value = 1 }, { deep: true })

const totals = computed(() => filtered.value.reduce((t, a) => ({ d: t.d + a.distance, m: t.m + a.moving_time, e: t.e + a.total_elevation_gain }), { d: 0, m: 0, e: 0 }))

function sortBy(k: string) {
  if (sortKey.value === k) sortDir.value = sortDir.value === 1 ? -1 : 1
  else { sortKey.value = k; sortDir.value = k === 'name' || k === 'sport_type' ? 1 : -1 }
}

function exportCsv() {
  const keys = ['id', ...columns.map(c => c.key), 'commute', 'trainer', 'gear_id', 'device_name']
  const esc = (v: any) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
  const csv = [keys.join(','), ...filtered.value.map(a => keys.map(k => esc(a[k])).join(','))].join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'strava-activities.csv'
  link.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div>
    <div class="row" style="margin-bottom: 14px">
      <h1>Activities</h1>
      <span class="pill">{{ nf(filtered.length) }} · {{ fmtDist(totals.d, units, 0) }} · {{ fmtDuration(totals.m, { long: true }) }} · {{ fmtElev(totals.e, units) }}</span>
    </div>
    <div class="row" style="margin-bottom: 12px">
      <input v-model="search" type="search" placeholder="Search name, sport, device…" style="flex: 1; min-width: 180px; max-width: 360px">
      <label class="chk"><input v-model="flags.race" type="checkbox"> Races</label>
      <label class="chk"><input v-model="flags.commute" type="checkbox"> Commutes</label>
      <label class="chk"><input v-model="flags.trainer" type="checkbox"> Indoor</label>
      <label class="chk"><input v-model="flags.hr" type="checkbox"> With HR</label>
      <span class="spacer" />
      <button class="btn small" @click="exportCsv">Export CSV</button>
    </div>
    <div v-if="pending && !list" class="empty">Loading…</div>
    <div v-else class="card table-wrap" style="padding: 6px">
      <table class="data">
        <thead>
          <tr>
            <th v-for="c in columns" :key="c.key" :class="{ r: c.r }" style="cursor: pointer; user-select: none" @click="sortBy(c.key)">
              {{ c.label }}<span v-if="sortKey === c.key">{{ sortDir === 1 ? ' ▲' : ' ▼' }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in rows" :key="a.id">
            <td style="white-space: nowrap">{{ fmtDate(a.start_date_local) }}</td>
            <td class="name"><a :href="stravaUrl(a.id)" target="_blank" rel="noopener" :title="a.name">{{ a.name }}</a></td>
            <td style="white-space: nowrap"><span class="swatch" :style="{ background: sportColor(a.sport_type) }" />{{ sportLabel(a.sport_type) }}</td>
            <td class="r">{{ a.distance ? fmtDist(a.distance, units) : '–' }}</td>
            <td class="r">{{ fmtDuration(a.moving_time) }}</td>
            <td class="r">{{ fmtDuration(a.elapsed_time) }}</td>
            <td class="r">{{ a.distance ? fmtSpeed(a.average_speed, units, a.sport_type) : '–' }}</td>
            <td class="r">{{ fmtElev(a.total_elevation_gain, units) }}</td>
            <td class="r">{{ a.average_heartrate ? nf(a.average_heartrate) : '–' }}</td>
            <td class="r">{{ a.max_heartrate ? nf(a.max_heartrate) : '–' }}</td>
            <td class="r">{{ a.average_watts ? nf(a.average_watts) : '–' }}</td>
            <td class="r">{{ a.average_cadence ? nf(a.average_cadence) : '–' }}</td>
            <td class="r">{{ a.suffer_score ? nf(a.suffer_score) : '–' }}</td>
            <td class="r">{{ a.calories ? nf(a.calories) : '–' }}</td>
            <td class="r">{{ a.kudos_count }}</td>
            <td class="r">{{ a.pr_count || '' }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="!rows.length" class="empty">No activities match.</div>
    </div>
    <div v-if="pages > 1" class="row" style="justify-content: center; margin-top: 12px">
      <button class="btn small" :disabled="page === 1" @click="page--">← Prev</button>
      <span class="muted">Page {{ page }} / {{ pages }}</span>
      <button class="btn small" :disabled="page === pages" @click="page++">Next →</button>
    </div>
  </div>
</template>

<style scoped>
.chk { display: inline-flex; align-items: center; gap: 5px; font-size: 13px; color: var(--text-2); }
td.name { max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
