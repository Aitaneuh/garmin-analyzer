// Garmin Connect login. The password is passed to the Python helper once and never stored;
// only the resulting tokens are saved (in /data/garmin/tokens).
export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: string; password?: string }>(event).catch(() => ({} as any))
  if (!body?.email || !body?.password) throw createError({ statusCode: 400, statusMessage: 'Email and password are required' })
  if (!garminAvailable()) throw createError({ statusCode: 500, statusMessage: 'Garmin helper not installed in this image' })
  const r = await garminLogin(String(body.email), String(body.password))
  if (r.ok) runSync().catch(e => console.error('[sync]', e))
  return r
})
