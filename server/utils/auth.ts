import { createHmac, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'

export const SESSION_COOKIE = 'sa_session'

export function dashboardPassword() {
  return String(useRuntimeConfig().dashboardPassword || '')
}

/** Stateless session: HMAC of a constant with the password. Changing the password logs everyone out. */
export function sessionToken() {
  return createHmac('sha256', dashboardPassword()).update('strava-analyzer-session-v1').digest('hex')
}

export function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

export function isAuthenticated(event: H3Event) {
  if (!dashboardPassword()) return true
  const cookie = getCookie(event, SESSION_COOKIE) || ''
  return safeEqual(cookie, sessionToken())
}

export function isSecureRequest(event: H3Event) {
  return getRequestURL(event, { xForwardedProto: true }).protocol === 'https:'
}
