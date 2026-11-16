<script setup lang="ts">
defineProps<{ label: string; value: string | number; sub?: string; accent?: boolean }>()
</script>

<template>
  <div class="tile" :class="{ accent }">
    <div class="label">{{ label }}</div>
    <div class="value">{{ value }}</div>
    <div v-if="sub" class="sub">{{ sub }}</div>
  </div>
</template>

<style scoped>
.tile {
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 14px 16px; min-width: 0;
}
.tile.accent { border-top: 3px solid var(--accent); padding-top: 12px; }
.label { color: var(--text-2); font-size: 12.5px; font-weight: 550; }
.value { font-size: 24px; font-weight: 650; margin-top: 4px; letter-spacing: -0.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sub { color: var(--muted); font-size: 12px; margin-top: 2px; }
</style>
