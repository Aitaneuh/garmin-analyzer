import { createWriteStream, promises as fs } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { gunzipSync } from 'node:zlib'
import yauzl from 'yauzl'
import type { Activity, ActivityDetail, GarminMeta } from './store'

/**
 * Imports activities from files:
 *  - .fit                 a single activity (from the watch, Garmin Connect "Export original", ...)
 *  - .fit.gz              Strava bulk export format
 *  - .zip                 anything containing the above, nested zips included (Garmin account export,
 *                         Garmin Connect downloads). "*summarizedActivities.json" inside a Garmin
 *                         export is read too, so activities get their real names.
 * Sources: files in /data/inbox (browser uploads + Garmin Connect downloads, deleted once imported)
 * and the optional watched folder NUXT_IMPORT_DIR (never modified; remembered by name/size/date).
 */

export interface ImportResult {
  files: number
  added: number
  updated: number
  skipped: number
  names: number
  errors: string[]
}

interface Session {
  acts: Record<string, Activity>
  details: Record<string, ActivityDetail>
  meta: Record<string, GarminMeta>
  result: ImportResult
  dirty: number
  touched: Set<number>
}

const newResult = (): ImportResult => ({ files: 0, added: 0, updated: 0, skipped: 0, names: 0, errors: [] })

async function openSession(): Promise<Session> {
  const [acts, details, meta] = await Promise.all([getActivities(), getDetails(), getGarminMeta()])
  return { acts: { ...acts }, details: { ...details }, meta: { ...meta }, result: newResult(), dirty: 0, touched: new Set() }
}

async function flush(s: Session) {
  // Apply names / Garmin ids to every activity touched in this session, plus all if names changed.
  applyMeta(s, s.result.names > 0)
  await Promise.all([saveActivities(s.acts), saveDetails(s.details), saveGarminMeta(s.meta)])
  s.dirty = 0
}

function applyMeta(s: Session, all: boolean) {
  const ids = all ? Object.keys(s.acts).map(Number) : [...s.touched]
  for (const id of ids) {
    const a = s.acts[id]
    if (!a) continue
    const hit = findNear(s.meta, id, 120)
    if (!hit) continue
    const m = hit[1]
    if (m.name) a.name = m.name
    if (m.id) a.garmin_id = m.id
    if (m.race) a.race = true
    if (m.local && a.start_date_local === a.start_date) a.start_date_local = m.local
  }
}

/** Insert or replace an activity (matched by start time within 90 s). */
function upsert(s: Session, parsed: { activity: Activity; detail: ActivityDetail }, garminId?: number) {
  const a = parsed.activity
  const near = findNear(s.acts, a.id, 90)
  if (near) {
    const old = near[1]
    if (near[0] !== a.id) {
      delete s.acts[near[0]]
      delete s.details[near[0]]
    }
    // Keep things only Connect knows about.
    a.garmin_id = garminId ?? old.garmin_id
    a.race = old.race
    if (old.name && !/^(Night|Morning|Lunch|Afternoon|Evening) /.test(old.name)) a.name = old.name
    s.result.updated++
  } else {
    if (garminId) a.garmin_id = garminId
    s.result.added++
  }
  if (garminId) a.source = 'garmin'
  s.acts[a.id] = a
  s.details[a.id] = parsed.detail
  s.touched.add(a.id)
  s.dirty++
}

async function importFitBuffer(s: Session, buf: Buffer, label: string, garminId?: number, keepOriginal = true) {
  try {
    const parsed = parseFit(buf)
    for (const p of parsed) upsert(s, p, garminId)
    if (keepOriginal && parsed.length) await fs.writeFile(dataPath('fit', `${parsed[0]!.activity.id}.fit`), buf)
  } catch (e: any) {
    if (e instanceof NotAnActivityError) s.result.skipped++
    else if (s.result.errors.length < 20) s.result.errors.push(`${label}: ${e?.message ?? e}`)
  }
  s.result.files++
  if (s.result.files % 25 === 0) syncState.message = `Importing: ${s.result.files} files read, ${s.result.added} new activities`
  if (s.dirty >= 250) await flush(s)
}

function importNamesJson(s: Session, text: string) {
  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    return
  }
  const list: any[] = []
  for (const block of Array.isArray(data) ? data : [data]) {
    if (Array.isArray(block?.summarizedActivitiesExport)) list.push(...block.summarizedActivitiesExport)
  }
  for (const x of list) {
    const begin = Number(x.beginTimestamp ?? x.startTimeGmt)
    if (!begin || !x.activityId) continue
    const start = Math.round(begin / 1000)
    const localMs = Number(x.startTimeLocal)
    s.meta[start] = {
      ...s.meta[start],
      id: Number(x.activityId),
      name: x.name || s.meta[start]?.name,
      type: x.activityType ?? s.meta[start]?.type,
      local: localMs ? new Date(localMs).toISOString().replace('.000Z', 'Z') : s.meta[start]?.local,
    }
    s.result.names++
  }
}

const isFitName = (n: string) => /\.fit$/i.test(n)
const isGzFitName = (n: string) => /\.fit\.gz$/i.test(n)
const isZipName = (n: string) => /\.zip$/i.test(n)
const isNamesJson = (n: string) => /summarizedActivities.*\.json$/i.test(n)

function openZip(path: string): Promise<yauzl.ZipFile> {
  return new Promise((res, rej) => yauzl.open(path, { lazyEntries: true, autoClose: true }, (err, zf) => (err ? rej(err) : res(zf!))))
}
function readEntry(zf: yauzl.ZipFile, entry: yauzl.Entry): Promise<Buffer> {
  return new Promise((res, rej) => zf.openReadStream(entry, (err, rs) => {
    if (err) return rej(err)
    const chunks: Buffer[] = []
    rs!.on('data', c => chunks.push(c))
    rs!.on('end', () => res(Buffer.concat(chunks)))
    rs!.on('error', rej)
  }))
}

async function importZip(s: Session, path: string, label: string, garminId?: number) {
  const zf = await openZip(path)
  await new Promise<void>((resolve, reject) => {
    zf.on('error', reject)
    zf.on('end', () => resolve())
    zf.on('entry', async (entry: yauzl.Entry) => {
      try {
        const name = entry.fileName
        if (/\/$/.test(name) || name.startsWith('__MACOSX')) return zf.readEntry()
        if (isFitName(name)) {
          await importFitBuffer(s, await readEntry(zf, entry), `${label}/${name}`, garminId ?? garminIdFromName(name))
        } else if (isGzFitName(name)) {
          await importFitBuffer(s, gunzipSync(await readEntry(zf, entry)), `${label}/${name}`)
        } else if (isNamesJson(name)) {
          importNamesJson(s, (await readEntry(zf, entry)).toString('utf8'))
        } else if (isZipName(name)) {
          // Nested zip (Garmin export): extract to a temp file, then recurse.
          const tmp = dataPath('inbox', `.nested-${Date.now()}-${Math.random().toString(36).slice(2)}.zip.part`)
          await new Promise<void>((res, rej) => zf.openReadStream(entry, (err, rs) => (err ? rej(err) : pipeline(rs!, createWriteStream(tmp)).then(res, rej))))
          try {
            await importZip(s, tmp, `${label}/${name}`)
          } finally {
            await fs.rm(tmp, { force: true })
          }
        }
        zf.readEntry()
      } catch (e) {
        zf.close()
        reject(e)
      }
    })
    zf.readEntry()
  })
}

/** "garmin-123456.zip" / "123456_ACTIVITY.fit" -> 123456 */
function garminIdFromName(name: string) {
  const m = /(?:^|[/\\])(?:garmin-)?(\d{6,})(?:_ACTIVITY)?\.(?:zip|fit)$/i.exec(name)
  return m ? Number(m[1]) : undefined
}

async function importPath(s: Session, path: string, label = basename(path)) {
  const name = basename(path)
  try {
    if (isZipName(name)) await importZip(s, path, label, garminIdFromName(name))
    else if (isGzFitName(name)) await importFitBuffer(s, gunzipSync(await fs.readFile(path)), label)
    else if (isFitName(name)) await importFitBuffer(s, await fs.readFile(path), label, garminIdFromName(name))
    else if (isNamesJson(name)) importNamesJson(s, await fs.readFile(path, 'utf8'))
    else s.result.skipped++
  } catch (e: any) {
    if (s.result.errors.length < 20) s.result.errors.push(`${label}: ${e?.message ?? e}`)
  }
}

/** Process everything waiting in /data/inbox, then delete it. */
export async function processInbox(): Promise<ImportResult> {
  await ensureDataDirs()
  const dir = dataPath('inbox')
  const files = (await fs.readdir(dir)).filter(f => !f.startsWith('.') && !f.endsWith('.part')).sort()
  const s = await openSession()
  if (!files.length) return s.result
  syncState.total += files.length
  for (const f of files) {
    syncState.message = `Importing ${f}`
    await importPath(s, join(dir, f), f)
    await fs.rm(join(dir, f), { force: true })
    syncState.done++
  }
  await flush(s)
  return s.result
}

/** Scan the watched folder (NUXT_IMPORT_DIR) for new files. Files are never modified. */
export async function scanImportFolder(): Promise<ImportResult> {
  const root = importDir()
  const s = await openSession()
  if (!root) return s.result
  try {
    await fs.access(root)
  } catch {
    return s.result
  }
  const seen = await readJson<Record<string, number>>('imported_files.json', {})
  const pending: { path: string; key: string }[] = []
  async function walk(dir: string, depth = 0) {
    if (depth > 6) return
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue
      const p = join(dir, e.name)
      if (e.isDirectory()) await walk(p, depth + 1)
      else if (isFitName(e.name) || isGzFitName(e.name) || isZipName(e.name) || isNamesJson(e.name)) {
        const st = await fs.stat(p)
        const key = `${relative(root!, p)}|${st.size}|${Math.round(st.mtimeMs)}`
        if (!seen[key]) pending.push({ path: p, key })
      }
    }
  }
  await walk(root)
  if (!pending.length) return s.result
  syncState.total += pending.length
  const next = { ...seen }
  for (const [i, f] of pending.entries()) {
    syncState.message = `Importing ${relative(root, f.path)}`
    await importPath(s, f.path, relative(root, f.path))
    syncState.done++
    next[f.key] = Date.now()
    if (i % 200 === 199) await writeJson('imported_files.json', next)
  }
  await flush(s)
  await writeJson('imported_files.json', next)
  return s.result
}

/** Re-parse every stored original FIT file (after an app update adds new metrics). */
export async function reprocessAll(): Promise<ImportResult> {
  const dir = dataPath('fit')
  const files = (await fs.readdir(dir)).filter(isFitName)
  const s = await openSession()
  syncState.total += files.length
  for (const f of files) {
    syncState.message = `Re-processing ${f}`
    try {
      const buf = await fs.readFile(join(dir, f))
      for (const p of parseFit(buf)) upsert(s, p)
    } catch (e: any) {
      if (s.result.errors.length < 20) s.result.errors.push(`${f}: ${e?.message ?? e}`)
    }
    s.result.files++
    syncState.done++
  }
  s.result.updated = s.result.updated + s.result.added
  s.result.added = 0
  s.result.names = 1 // force meta re-application
  await flush(s)
  return s.result
}

/** Merge activity names / ids that the Garmin Connect sync reported. */
export async function mergeGarminMeta(list: (GarminMeta & { start: number })[]) {
  if (!list.length) return
  const s = await openSession()
  for (const { start, ...m } of list) s.meta[start] = { ...s.meta[start], ...m }
  s.result.names = list.length
  await flush(s)
}

/** Delete one activity (and its original file). */
export async function deleteActivity(id: number) {
  const s = await openSession()
  delete s.acts[id]
  delete s.details[id]
  await Promise.all([saveActivities(s.acts), saveDetails(s.details)])
  await fs.rm(dataPath('fit', `${id}.fit`), { force: true })
}

export function importDir() {
  const d = String(useRuntimeConfig().importDir || '')
  return d || null
}

export function summarize(r: ImportResult) {
  const parts = [`${r.added} new`, `${r.updated} updated`]
  if (r.skipped) parts.push(`${r.skipped} skipped (not activities)`)
  if (r.errors.length) parts.push(`${r.errors.length} errors`)
  return `${r.files} files: ${parts.join(', ')}`
}


