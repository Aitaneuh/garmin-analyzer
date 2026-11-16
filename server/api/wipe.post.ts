import { promises as fs } from 'node:fs'

// Deletes all imported data (activities, health, original files). Garmin login is kept.
export default defineEventHandler(async () => {
  if (syncState.running) throw createError({ statusCode: 409, statusMessage: 'A sync is running' })
  for (const f of ['activities.json', 'details.json', 'health.json', 'garmin_meta.json', 'imported_files.json', 'meta.json']) await removeJson(f)
  for (const d of ['fit', 'inbox']) {
    await fs.rm(dataPath(d), { recursive: true, force: true })
    await fs.mkdir(dataPath(d), { recursive: true })
  }
  await fs.rm(dataPath('garmin', 'state.json'), { force: true })
  return { ok: true }
})
