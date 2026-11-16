import { createWriteStream, promises as fs } from 'node:fs'
import { pipeline } from 'node:stream/promises'

// Streams one uploaded file (raw request body) into /data/inbox. Large Garmin exports (GBs) are fine:
// nothing is held in memory. The browser calls POST /api/import once all files are uploaded.
export default defineEventHandler(async (event) => {
  const raw = String(getQuery(event).name || 'upload.fit')
  const name = raw.split(/[\/]/).pop()!.replace(/[^\w.\-]+/g, '_').slice(-120)
  if (!/\.(fit|zip|gz|json)$/i.test(name)) throw createError({ statusCode: 400, statusMessage: 'Only .fit, .fit.gz, .zip or summarizedActivities .json files' })
  await ensureDataDirs()
  const final = dataPath('inbox', `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${name}`)
  const tmp = `${final}.part`
  try {
    await pipeline(event.node.req, createWriteStream(tmp))
    await fs.rename(tmp, final)
  } catch (e) {
    await fs.rm(tmp, { force: true })
    throw createError({ statusCode: 500, statusMessage: `Upload failed: ${(e as Error).message}` })
  }
  return { ok: true }
})
