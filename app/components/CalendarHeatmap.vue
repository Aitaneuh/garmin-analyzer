<script setup lang="ts">
/** GitHub-style daily activity calendar (weeks as columns, Mon..Sun rows). */
const props = defineProps<{ days: { date: string; distance: number; time: number; count: number }[]; metric: 'distance' | 'time' }>()
const { units, themeTick } = useFilters()

const CELL = 12
const GAP = 3
const hover = ref<{ x: number; y: number; d: any } | null>(null)
const wrap = ref<HTMLElement>()
function onEnter(e: MouseEvent, d: any) {
  const r = wrap.value!.getBoundingClientRect()
  hover.value = { x: e.clientX - r.left + wrap.value!.scrollLeft, y: e.clientY - r.top, d }
}

const layout = computed(() => {
  if (!props.days.length) return { cells: [], months: [], width: 0, max: 0 }
  const first = new Date(`${props.days[0]!.date}T00:00:00Z`)
  const offset = (first.getUTCDay() + 6) % 7 // monday-based
  const vals = props.days.map(d => (props.metric === 'distance' ? d.distance : d.time)).filter(v => v > 0).sort((a, b) => a - b)
  // quantile thresholds -> 5 steps so a few huge days don't wash out the rest
  const q = (p: number) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))] ?? 0
  const thresholds = [q(0.2), q(0.4), q(0.6), q(0.8)]
  const months: { x: number; label: string }[] = []
  const cells = props.days.map((d, i) => {
    const idx = i + offset
    const col = Math.floor(idx / 7)
    const row = idx % 7
    const v = props.metric === 'distance' ? d.distance : d.time
    let level = 0
    if (d.count > 0) {
      level = 1
      for (const t of thresholds) if (v > t) level++
      level = Math.min(5, level)
    }
    if (d.date.endsWith('-01')) months.push({ x: col * (CELL + GAP), label: fmtDate(d.date, { month: 'short' }) })
    return { ...d, x: col * (CELL + GAP), y: row * (CELL + GAP), level }
  })
  const cols = Math.ceil((props.days.length + offset) / 7)
  return { cells, months, width: cols * (CELL + GAP), max: vals.at(-1) ?? 0 }
})

const colors = computed(() => {
  void themeTick.value // re-read on theme change
  return [0, 1, 2, 3, 4, 5].map(seq)
})
</script>

<template>
  <div ref="wrap" class="cal-wrap">
    <svg :width="layout.width + 28" :height="7 * (CELL + GAP) + 18" role="img" aria-label="Daily activity calendar">
      <g transform="translate(28, 16)">
        <text v-for="m in layout.months" :key="m.x" :x="m.x" y="-5" class="lbl">{{ m.label }}</text>
        <text v-for="(d, i) in ['Mon', '', 'Wed', '', 'Fri', '', 'Sun']" :key="i" x="-6" :y="i * (CELL + GAP) + 10" class="lbl" text-anchor="end">{{ d }}</text>
        <rect
          v-for="c in layout.cells" :key="c.date" :x="c.x" :y="c.y" :width="CELL" :height="CELL" rx="3"
          :fill="colors[c.level]" class="cell"
          @mouseenter="(e) => onEnter(e as MouseEvent, c)"
          @mouseleave="hover = null"
        />
      </g>
    </svg>
    <div v-if="hover" class="tip" :style="{ left: `${hover.x + 12}px`, top: `${hover.y - 8}px` }">
      <strong>{{ fmtDate(hover.d.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) }}</strong><br>
      <template v-if="hover.d.count">
        {{ hover.d.count }} {{ hover.d.count > 1 ? 'activities' : 'activity' }} · {{ fmtDist(hover.d.distance, units) }} · {{ fmtDuration(hover.d.time) }}
      </template>
      <template v-else>Rest day</template>
    </div>
    <div class="legend">
      <span class="muted">Less</span>
      <span v-for="i in 6" :key="i" class="swatch" :style="{ background: colors[i - 1] }" />
      <span class="muted">More</span>
    </div>
  </div>
</template>

<style scoped>
.cal-wrap { position: relative; overflow-x: auto; }
.lbl { font-size: 10px; fill: var(--muted); }
.cell { cursor: default; }
.cell:hover { stroke: var(--text); stroke-width: 1; }
.tip {
  position: absolute; pointer-events: none; background: var(--surface); border: 1px solid var(--axis);
  border-radius: 8px; padding: 6px 10px; font-size: 12px; white-space: nowrap; z-index: 5; color: var(--text-2);
}
.tip strong { color: var(--text); }
.legend { display: flex; gap: 4px; align-items: center; justify-content: flex-end; font-size: 11px; margin-top: 6px; }
.legend .swatch { margin: 0; }
</style>
