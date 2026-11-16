<script setup lang="ts">
// Activity name that links to Garmin Connect when the Garmin activity id is known.
const props = defineProps<{ gid?: number | null; title?: string }>()
const href = computed(() => garminUrl(props.gid))
</script>

<template>
  <a v-if="href" :href="href" target="_blank" rel="noopener" :title="title" @click.stop><slot /></a>
  <span v-else :title="title"><slot /></span>
</template>
