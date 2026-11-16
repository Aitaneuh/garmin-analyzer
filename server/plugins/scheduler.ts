// Background jobs:
//  - full sync (Garmin Connect + inbox + watched folder) every NUXT_SYNC_INTERVAL_MINUTES (0 = off)
//  - the watched import folder and the inbox are also checked every 5 minutes (cheap, no Garmin calls)
export default defineNitroPlugin(() => {
  if (import.meta.prerender) return
  const minutes = Number(useRuntimeConfig().syncIntervalMinutes) || 0
  setTimeout(() => {
    dropLegacyStravaData()
      .catch(e => console.error('[migrate]', e))
      .then(() => runSync())
      .catch(console.error)
  }, 20_000) // initial run after start-up
  if (minutes > 0) setInterval(() => runSync().catch(console.error), minutes * 60_000)
  setInterval(() => {
    if (!syncState.running) runImportOnly().catch(console.error)
  }, 5 * 60_000)
})

/** Earlier versions of this app stored Strava data in the same volume; it has a different format. */
async function dropLegacyStravaData() {
  const acts = await getActivities()
  const legacy = Object.values(acts).filter(a => !(a as any).source)
  if (legacy.length) {
    for (const a of legacy) delete acts[a.id]
    await saveActivities(acts)
    console.log(`[migrate] removed ${legacy.length} activities from the old Strava version`)
  }
  for (const f of ['tokens.json', 'athlete.json', 'athlete_stats.json', 'zones.json']) await removeJson(f)
}
