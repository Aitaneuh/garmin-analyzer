// Step 2 of OAuth: Strava redirects back here with ?code=...&scope=...&state=...
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const expected = getCookie(event, 'sa_oauth_state')
  deleteCookie(event, 'sa_oauth_state', { path: '/' })
  if (q.error) return sendRedirect(event, `/setup?error=${encodeURIComponent(String(q.error))}`)
  if (!q.code || !expected || q.state !== expected) return sendRedirect(event, '/setup?error=invalid_state')

  const scope = String(q.scope || '')
  if (!scope.includes('activity:read')) return sendRedirect(event, '/setup?error=missing_activity_scope')

  try {
    await exchangeCode(String(q.code))
  } catch (e: any) {
    console.error('[oauth] token exchange failed', e?.data || e)
    return sendRedirect(event, '/setup?error=token_exchange_failed')
  }
  runSync() // first sync runs in the background (fetches the full history)
  return sendRedirect(event, '/setup?connected=1')
})
