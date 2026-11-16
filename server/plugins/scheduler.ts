// Background auto-sync. Interval set by NUXT_SYNC_INTERVAL_MINUTES (0 disables).
// In between, it keeps fetching activity details every ~15 min (Strava's rate-limit window).
export default defineNitroPlugin(() => {
  if (import.meta.prerender) return
  const minutes = Number(useRuntimeConfig().syncIntervalMinutes) || 0
  if (minutes > 0) {
    setTimeout(() => runSync().catch(console.error), 15_000)
    setInterval(() => runSync().catch(console.error), minutes * 60_000)
  }
  setInterval(async () => {
    if (syncState.running || !(await getTokens())) return
    const cfg = useRuntimeConfig().detailSync
    if (cfg === false || String(cfg) === 'false') return
    syncState.running = true
    syncState.phase = 'details'
    try {
      await syncDetails()
      await updateMeta({ lastDetailSync: Date.now(), rateLimit: getRateLimit() })
    } catch (e) {
      console.error('[detail-sync]', e)
    } finally {
      syncState.running = false
      syncState.phase = ''
    }
  }, 15 * 60_000 + 30_000)
})
