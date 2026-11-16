import { randomBytes } from 'node:crypto'

// Step 1 of OAuth: send the user to Strava's consent screen.
export default defineEventHandler((event) => {
  if (!isConfigured()) {
    throw createError({ statusCode: 500, statusMessage: 'Set NUXT_STRAVA_CLIENT_ID and NUXT_STRAVA_CLIENT_SECRET first' })
  }
  const state = randomBytes(16).toString('hex')
  setCookie(event, 'sa_oauth_state', state, { httpOnly: true, sameSite: 'lax', secure: isSecureRequest(event), path: '/', maxAge: 600 })
  const url = new URL('https://www.strava.com/oauth/authorize')
  url.searchParams.set('client_id', stravaConfig().clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', `${appBaseUrl(event)}/api/auth/callback`)
  url.searchParams.set('approval_prompt', 'auto')
  url.searchParams.set('scope', STRAVA_SCOPES)
  url.searchParams.set('state', state)
  return sendRedirect(event, url.toString(), 302)
})
