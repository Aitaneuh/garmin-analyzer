// Imports files waiting in the inbox (called after browser uploads finish) without contacting Garmin.
export default defineEventHandler(async () => {
  if (syncState.running) return { started: false, reason: 'already running' }
  runImportOnly().catch(e => console.error('[import]', e))
  return { started: true }
})
