<script setup lang="ts">
import { Chart, registerables, type ChartConfiguration } from 'chart.js'

Chart.register(...registerables)

/**
 * Thin Chart.js wrapper. Pass a builder function so colors (CSS vars) are
 * re-read whenever the theme changes.
 */
const props = withDefaults(defineProps<{
  config: () => ChartConfiguration
  height?: number
}>(), { height: 260 })

const canvas = ref<HTMLCanvasElement>()
let chart: Chart | null = null
const { themeTick } = useFilters()

function baseDefaults() {
  const ink = cssVar('--text-2')
  const muted = cssVar('--muted')
  const grid = cssVar('--grid')
  Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", sans-serif'
  Chart.defaults.font.size = 12
  Chart.defaults.color = muted
  Chart.defaults.borderColor = grid
  Chart.defaults.plugins.legend.labels.color = ink
  Chart.defaults.plugins.legend.labels.boxWidth = 10
  Chart.defaults.plugins.legend.labels.boxHeight = 10
  Chart.defaults.plugins.legend.labels.useBorderRadius = true
  Chart.defaults.plugins.legend.labels.borderRadius = 3
  Chart.defaults.plugins.tooltip.backgroundColor = cssVar('--surface')
  Chart.defaults.plugins.tooltip.titleColor = cssVar('--text')
  Chart.defaults.plugins.tooltip.bodyColor = ink
  Chart.defaults.plugins.tooltip.borderColor = cssVar('--axis')
  Chart.defaults.plugins.tooltip.borderWidth = 1
  Chart.defaults.plugins.tooltip.padding = 10
  Chart.defaults.plugins.tooltip.cornerRadius = 8
  Chart.defaults.plugins.tooltip.boxPadding = 4
  Chart.defaults.plugins.tooltip.usePointStyle = true
  Chart.defaults.elements.line.borderWidth = 2
  Chart.defaults.elements.point.radius = 0
  Chart.defaults.elements.point.hoverRadius = 5
  Chart.defaults.elements.point.hitRadius = 8
  Chart.defaults.elements.bar.borderRadius = 4
  Chart.defaults.maintainAspectRatio = false
  Chart.defaults.interaction.mode = 'index'
  Chart.defaults.interaction.intersect = false
  Chart.defaults.scale.grid.color = grid
  ;(Chart.defaults.scale as any).border.color = cssVar('--axis')
}

function render() {
  if (!canvas.value) return
  baseDefaults()
  const cfg = props.config()
  if (chart) chart.destroy()
  chart = new Chart(canvas.value, cfg)
}

onMounted(render)
watch(() => [props.config, themeTick.value], () => nextTick(render))
onBeforeUnmount(() => chart?.destroy())
</script>

<template>
  <div class="chart" :style="{ height: `${height}px` }">
    <canvas ref="canvas" />
  </div>
</template>

<style scoped>
.chart { position: relative; width: 100%; }
</style>
