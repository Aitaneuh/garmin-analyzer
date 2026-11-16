// Forgets the Garmin Connect tokens. Imported activities and health data are kept.
export default defineEventHandler(async () => {
  await garminLogout()
  return { ok: true }
})
