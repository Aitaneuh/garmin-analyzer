// Starts a sync in the background (Garmin Connect, then the import inbox and watched folder).
export default defineEventHandler(async () => {
  if (syncState.running) return { started: false, reason: 'already running' }
  runSync().catch(e => console.error('[sync]', e))
  return { started: true }
})
