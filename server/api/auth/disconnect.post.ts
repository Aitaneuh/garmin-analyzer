// Revokes access on Strava and (optionally) wipes the local data.
export default defineEventHandler(async (event) => {
  const body = await readBody<{ wipe?: boolean }>(event).catch(() => ({} as { wipe?: boolean }))
  if (await getTokens()) {
    try {
      const token = await getAccessToken()
      await $fetch('https://www.strava.com/oauth/deauthorize', { method: 'POST', query: { access_token: token } })
    } catch (e) {
      console.warn('[disconnect] deauthorize failed', e)
    }
  }
  await removeJson('tokens.json')
  if (body?.wipe) {
    for (const f of ['activities.json', 'details.json', 'athlete.json', 'athlete_stats.json', 'zones.json', 'meta.json']) await removeJson(f)
  }
  return { ok: true }
})
