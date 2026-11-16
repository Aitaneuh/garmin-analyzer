// Re-reads every stored original FIT file (useful after an update adds new metrics).
export default defineEventHandler(async () => {
  if (syncState.running) return { started: false, reason: 'already running' }
  runReprocess().catch(e => console.error('[reprocess]', e))
  return { started: true }
})
