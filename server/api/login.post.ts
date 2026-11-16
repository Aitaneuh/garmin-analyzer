export default defineEventHandler(async (event) => {
  const body = await readBody<{ password?: string }>(event).catch(() => ({} as { password?: string }))
  if (!dashboardPassword() || !safeEqual(String(body?.password ?? ''), dashboardPassword())) {
    await new Promise(r => setTimeout(r, 750)) // slow down brute force
    throw createError({ statusCode: 401, statusMessage: 'Wrong password' })
  }
  setCookie(event, SESSION_COOKIE, sessionToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(event),
    path: '/',
    maxAge: 60 * 60 * 24 * 90,
  })
  return { ok: true }
})
