<script setup lang="ts">
const route = useRoute()
const { sport, year, units, theme, themeTick } = useFilters()
const { data: status, refresh: refreshStatus } = useStatus()
const dataVersion = useDataVersion()
const menuOpen = ref(false)

const bare = computed(() => route.path === '/login')

const nav = [
  { to: '/', label: 'Overview', icon: 'M3 12h4l3-8 4 16 3-8h4' },
  { to: '/trends', label: 'Trends', icon: 'M3 20h18M5 16l4-5 4 3 6-8' },
  { to: '/training', label: 'Training', icon: 'M13 2 4 14h7l-1 8 9-12h-7l1-8z' },
  { to: '/records', label: 'Records & PRs', icon: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM17 6h3v2a3 3 0 0 1-3 3M7 6H4v2a3 3 0 0 0 3 3' },
  { to: '/map', label: 'Heatmap', icon: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14' },
  { to: '/activities', label: 'Activities', icon: 'M4 6h16M4 12h16M4 18h10' },
  { to: '/health', label: 'Health', icon: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z' },
  { to: '/devices', label: 'Devices & zones', icon: 'M8 3h8l1 4H7l1-4zM7 17h10l-1 4H8l-1-4zM6 7h12v10H6z' },
  { to: '/setup', label: 'Settings', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.8 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.8-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3.4 15H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 4.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.8 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 20.6 9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 2z' },
]

// Send first-time users to the setup page.
watch(status, (s) => {
  if (s && !s.garmin.loggedIn && !s.activityCount && !['/setup', '/login'].includes(route.path)) navigateTo('/setup')
}, { immediate: true })

// Poll while a sync runs; refresh pages when it finishes.
let timer: ReturnType<typeof setInterval> | undefined
watch(() => status.value?.sync.running, (running, was) => {
  clearInterval(timer)
  if (running) timer = setInterval(refreshStatus, 3000)
  if (was && !running) dataVersion.value++
}, { immediate: true })
onBeforeUnmount(() => clearInterval(timer))

async function sync() {
  await $fetch('/api/sync', { method: 'POST' })
  await refreshStatus()
}

function applyTheme() {
  const el = document.documentElement
  if (theme.value === 'auto') el.removeAttribute('data-theme')
  else el.setAttribute('data-theme', theme.value)
  try { localStorage.setItem('sa-theme', theme.value) } catch {}
  themeTick.value++
}
onMounted(() => {
  applyTheme()
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => themeTick.value++)
})
watch(theme, applyTheme)
function cycleTheme() {
  theme.value = theme.value === 'auto' ? 'light' : theme.value === 'light' ? 'dark' : 'auto'
}

// Make sure the selected sport/year still exist after a sync / disconnect.
watch(status, (s) => {
  if (!s) return
  const validSports = ['all', 'AllRuns', 'AllRides', ...s.sports]
  if (!validSports.includes(sport.value)) sport.value = 'all'
  if (year.value !== 'all' && !s.years.includes(year.value)) year.value = 'all'
})

const hasRuns = computed(() => status.value?.sports.some(s => ['Run', 'TrailRun', 'VirtualRun'].includes(s)))
const hasRides = computed(() => status.value?.sports.some(s => /Ride/.test(s)))

watch(() => route.path, () => { menuOpen.value = false })

async function logout() {
  await $fetch('/api/logout', { method: 'POST' })
  window.location.href = '/login'
}
</script>

<template>
  <NuxtPage v-if="bare" />
  <div v-else class="shell">
    <aside class="side" :class="{ open: menuOpen }">
      <div class="brand">
        <img src="/favicon.svg" alt="" width="26" height="26">
        <span>Garmin Analyzer</span>
      </div>
      <div v-if="status?.garmin.fullName || status?.devices.length" class="athlete">
        <div>
          <div class="name">{{ status.garmin.fullName || 'My training' }}</div>
          <div class="muted small">{{ status.devices.slice(0, 2).join(' · ') }}</div>
        </div>
      </div>
      <nav>
        <NuxtLink v-for="n in nav" :key="n.to" :to="n.to" class="nav-link">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path :d="n.icon" /></svg>
          {{ n.label }}
        </NuxtLink>
      </nav>
      <div class="side-foot">
        <div v-if="status" class="sync-info">
          <template v-if="status.sync.running">
            <span class="dot live" /> {{ status.sync.phase === 'garmin' ? 'Syncing Garmin' : status.sync.phase === 'reprocess' ? 'Re-processing' : 'Importing' }}…
            <span v-if="status.sync.total" class="muted">({{ status.sync.done }} / {{ status.sync.total }})</span>
            <div class="muted small ellipsis">{{ status.sync.message }}</div>
          </template>
          <template v-else>
            <span class="dot" :class="{ err: status.sync.lastSyncError }" />
            Synced {{ relTime(status.sync.lastSync) }}
          </template>
          <div class="muted small">{{ nf(status.activityCount) }} activities<template v-if="status.healthDays"> · {{ nf(status.healthDays) }} health days</template></div>
        </div>
        <div class="row">
          <button class="btn small" :disabled="status?.sync.running" :title="status?.garmin.loggedIn ? 'Sync Garmin Connect and import new files' : 'Import new files'" @click="sync()">Sync now</button>
          <button class="btn small" :title="`Theme: ${theme}`" @click="cycleTheme">{{ theme === 'auto' ? 'Auto' : theme === 'light' ? 'Light' : 'Dark' }}</button>
          <button v-if="status?.passwordProtected" class="btn small" @click="logout">Log out</button>
        </div>
      </div>
    </aside>

    <main class="main">
      <header class="topbar">
        <button class="btn small menu-btn" aria-label="Menu" @click="menuOpen = !menuOpen">☰</button>
        <div class="filters">
          <select v-model="sport" aria-label="Sport">
            <option value="all">All sports</option>
            <option v-if="hasRuns" value="AllRuns">All runs</option>
            <option v-if="hasRides" value="AllRides">All rides</option>
            <option v-for="s in status?.sports ?? []" :key="s" :value="s">{{ sportLabel(s) }}</option>
          </select>
          <select v-model="year" aria-label="Year">
            <option value="all">All time</option>
            <option v-for="y in status?.years ?? []" :key="y" :value="y">{{ y }}</option>
          </select>
          <select v-model="units" aria-label="Units">
            <option value="metric">km / m</option>
            <option value="imperial">mi / ft</option>
          </select>
        </div>
      </header>
      <div v-if="status?.sync.lastSyncError" class="notice error" style="margin-bottom: 14px">
        Last sync failed: {{ status.sync.lastSyncError }}
      </div>
      <NuxtPage />
    </main>
    <div v-if="menuOpen" class="scrim" @click="menuOpen = false" />
  </div>
</template>

<style scoped>
.shell { display: flex; min-height: 100vh; }
.side {
  width: 236px; flex-shrink: 0; background: var(--surface); border-right: 1px solid var(--border);
  display: flex; flex-direction: column; padding: 18px 14px; position: sticky; top: 0; height: 100vh;
}
.brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 16px; padding: 0 6px 16px; }
.athlete { display: flex; gap: 10px; align-items: center; padding: 10px 6px 14px; border-bottom: 1px solid var(--grid); margin-bottom: 10px; }
.avatar { width: 38px; height: 38px; border-radius: 50%; object-fit: cover; }
.name { font-weight: 600; }
.ellipsis { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px; }
.small { font-size: 12px; }
nav { display: flex; flex-direction: column; gap: 2px; }
.nav-link { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; color: var(--text-2); font-weight: 550; }
.nav-link:hover { background: var(--surface-2); text-decoration: none; }
.nav-link.router-link-exact-active { background: var(--surface-2); color: var(--accent-ink); }
.side-foot { margin-top: auto; display: flex; flex-direction: column; gap: 10px; padding-top: 12px; border-top: 1px solid var(--grid); }
.sync-info { font-size: 12.5px; color: var(--text-2); }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--good); margin-right: 4px; }
.dot.err { background: var(--critical); }
.dot.live { background: var(--accent); animation: pulse 1s infinite alternate; }
@keyframes pulse { to { opacity: .3; } }
.main { flex: 1; min-width: 0; padding: 18px 24px 40px; max-width: 1480px; }
.topbar { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
.filters { display: flex; gap: 8px; flex-wrap: wrap; margin-left: auto; }
.menu-btn { display: none; }
.scrim { display: none; }

@media (max-width: 900px) {
  .side { position: fixed; z-index: 1000; left: 0; transform: translateX(-100%); transition: transform .2s; }
  .side.open { transform: none; }
  .scrim { display: block; position: fixed; inset: 0; background: rgba(0, 0, 0, .35); z-index: 999; }
  .menu-btn { display: inline-flex; }
  .main { padding: 14px 16px 40px; }
  .filters { flex: 1; }
  .filters select { flex: 1; }
}
</style>
