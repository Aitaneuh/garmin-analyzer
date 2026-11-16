<script setup lang="ts">
import type { Map as LMap, LayerGroup } from 'leaflet'

const { units, query, themeTick } = useFilters()
const version = useDataVersion()
const { data: routes, pending } = useFetch<any[]>('/api/map', {
  query,
  key: computed(() => `map-${query.value.sport}-${query.value.year}-${version.value}`),
  server: false,
})

const el = ref<HTMLElement>()
const opacity = ref(0.35)
const colorBy = ref<'sport' | 'single'>('single')
let L: typeof import('leaflet') | null = null
let map: LMap | null = null
let layer: LayerGroup | null = null
let tiles: any = null

const stats = computed(() => {
  const r = routes.value ?? []
  return { count: r.length, distance: r.reduce((s, x) => s + x.distance, 0) }
})

function isDark() {
  const attr = document.documentElement.getAttribute('data-theme')
  return attr ? attr === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
}

function setTiles() {
  if (!map || !L) return
  tiles?.remove()
  // Standard OpenStreetMap tiles (no API key). Dark mode is done with a CSS filter on the tile pane.
  tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map)
  el.value?.classList.toggle('dark-tiles', isDark())
}

function draw(fit = true) {
  if (!map || !L) return
  layer?.remove()
  layer = L.layerGroup()
  const bounds = L.latLngBounds([])
  const single = cssVar('--accent')
  for (const r of routes.value ?? []) {
    const pts = decodePolyline(r.p)
    if (pts.length < 2) continue
    const line = L.polyline(pts, { color: colorBy.value === 'sport' ? sportColor(r.sport_type) : single, weight: 2, opacity: opacity.value, smoothFactor: 1 })
    line.bindPopup(() => {
      const url = garminUrl(r.garmin_id)
      const title = url ? `<a href="${url}" target="_blank" rel="noopener">${escapeHtml(r.name)}</a>` : escapeHtml(r.name)
      return `<strong>${title}</strong><br>${sportLabel(r.sport_type)} · ${fmtDist(r.distance, units.value)}<br>${fmtDate(r.date)}`
    })
    line.on('mouseover', () => line.setStyle({ opacity: 1, weight: 4 }))
    line.on('mouseout', () => line.setStyle({ opacity: opacity.value, weight: 2 }))
    line.addTo(layer)
    for (const p of pts) bounds.extend(p)
  }
  layer.addTo(map)
  if (fit && bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] })
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

onMounted(async () => {
  L = (await import('leaflet')).default
  map = L.map(el.value!, { preferCanvas: true, zoomControl: true }).setView([46, 2], 5)
  setTiles()
  draw()
})
onBeforeUnmount(() => map?.remove())
watch(routes, () => draw())
watch([opacity, colorBy, units], () => draw(false))
watch(themeTick, () => { setTiles(); draw(false) })
</script>

<template>
  <div>
    <div class="row" style="margin-bottom: 14px">
      <h1>Heatmap</h1>
      <span class="pill">{{ stats.count }} routes · {{ fmtDist(stats.distance, units, 0) }}</span>
      <span v-if="pending" class="muted">loading…</span>
      <span class="spacer" />
      <div class="seg">
        <button :class="{ on: colorBy === 'single' }" @click="colorBy = 'single'">Heat</button>
        <button :class="{ on: colorBy === 'sport' }" @click="colorBy = 'sport'">By sport</button>
      </div>
      <label class="row muted" style="gap: 6px; font-size: 12.5px">
        Intensity
        <input v-model.number="opacity" type="range" min="0.05" max="1" step="0.05">
      </label>
    </div>
    <div class="card" style="padding: 0; overflow: hidden">
      <div ref="el" class="map" />
    </div>
    <p class="muted" style="font-size: 12.5px">Every GPS track, simplified to keep the map fast. Click a route for details (and a Garmin Connect link when known).</p>
  </div>
</template>

<style scoped>
.map { height: calc(100vh - 170px); min-height: 420px; width: 100%; background: var(--surface-2); }
:deep(.leaflet-popup-content) { font-size: 13px; }
.map.dark-tiles :deep(.leaflet-tile-pane) { filter: invert(1) hue-rotate(180deg) brightness(0.85) contrast(0.9) grayscale(0.4); }
.map:not(.dark-tiles) :deep(.leaflet-tile-pane) { filter: grayscale(0.6) brightness(1.03); }
</style>
