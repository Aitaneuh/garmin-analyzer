<script setup lang="ts">
/** Day-of-week x hour-of-day activity counts. */
const props = defineProps<{ data: number[][] }>()
const { themeTick } = useFilters()
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const max = computed(() => Math.max(1, ...props.data.flat()))
const colors = computed(() => {
  void themeTick.value
  return [0, 1, 2, 3, 4, 5].map(seq)
})
function level(v: number) {
  if (!v) return 0
  return Math.min(5, 1 + Math.floor((v / max.value) * 4.999))
}
</script>

<template>
  <div class="pc-wrap">
    <table class="pc">
      <thead>
        <tr>
          <th />
          <th v-for="h in 24" :key="h" class="h">{{ (h - 1) % 3 === 0 ? h - 1 : '' }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, d) in data" :key="d">
          <th class="d">{{ days[d] }}</th>
          <td v-for="(v, h) in row" :key="h">
            <div class="c" :style="{ background: colors[level(v)] }" :title="`${days[d]} ${h}:00–${h}:59 · ${v} ${v === 1 ? 'activity' : 'activities'}`" />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.pc-wrap { overflow-x: auto; }
.pc { border-collapse: separate; border-spacing: 3px; width: 100%; min-width: 460px; }
.pc th { font-weight: 500; color: var(--muted); font-size: 10.5px; }
.pc th.d { text-align: right; padding-right: 4px; width: 32px; }
.pc td { padding: 0; }
.c { height: 18px; border-radius: 4px; }
.c:hover { outline: 1px solid var(--text); }
</style>
