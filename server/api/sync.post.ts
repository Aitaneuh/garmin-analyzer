export default defineEventHandler(async (event) => {
  const body = await readBody<{ full?: boolean }>(event).catch(() => ({} as { full?: boolean }))
  if (syncState.running) return { started: false, reason: 'already running' }
  if (!(await getTokens())) throw createError({ statusCode: 400, statusMessage: 'Strava not connected' })
  runSync({ full: !!body?.full }) // runs in the background; the UI polls /api/status
  return { started: true }
})
