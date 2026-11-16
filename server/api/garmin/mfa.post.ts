export default defineEventHandler(async (event) => {
  const body = await readBody<{ code?: string }>(event).catch(() => ({} as any))
  if (!body?.code) throw createError({ statusCode: 400, statusMessage: 'Code is required' })
  const r = await garminMfa(String(body.code))
  if (r.ok) runSync().catch(e => console.error('[sync]', e))
  return r
})
