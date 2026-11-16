/**
 * One "sync" = (1) Garmin Connect: download new activity files + health data, if logged in
 *              (2) import everything in /data/inbox (uploads + Garmin downloads)
 *              (3) scan the watched import folder, if configured.
 * Only one job runs at a time; the UI polls /api/status for progress.
 */

export const syncState = {
  running: false,
  phase: '' as '' | 'garmin' | 'import' | 'reprocess',
  message: '',
  done: 0,
  total: 0,
  startedAt: 0,
}

async function exclusive<T>(phase: typeof syncState.phase, fn: () => Promise<T>): Promise<T | { started: false; reason: string }> {
  if (syncState.running) return { started: false, reason: 'already running' }
  Object.assign(syncState, { running: true, phase, message: '', done: 0, total: 0, startedAt: Date.now() })
  try {
    return await fn()
  } finally {
    Object.assign(syncState, { running: false, phase: '', message: '' })
  }
}

export function runSync(opts: { garmin?: boolean } = {}) {
  return exclusive('garmin', async () => {
    const errors: string[] = []
    const summary: string[] = []
    if (opts.garmin !== false && garminAvailable() && garminTokensExist()) {
      syncState.phase = 'garmin'
      syncState.message = 'Garmin: connecting'
      try {
        const g = await garminSync()
        if (g.error) errors.push(`Garmin: ${g.error}`)
        else summary.push(`Garmin: ${g.downloaded} new activity files`)
      } catch (e: any) {
        errors.push(`Garmin: ${e?.message ?? e}`)
      }
    }
    syncState.phase = 'import'
    const results = [await processInbox(), await scanImportFolder()]
    const total = results.reduce((t, r) => ({
      files: t.files + r.files, added: t.added + r.added, updated: t.updated + r.updated,
      skipped: t.skipped + r.skipped, names: t.names + r.names, errors: [...t.errors, ...r.errors],
    }))
    if (total.files) summary.push(summarize(total))
    if (total.errors.length) console.warn('[import]', total.errors.join('\n'))
    await updateMeta({
      lastSync: Date.now(),
      lastSyncError: errors.length ? errors.join(' · ') : undefined,
      ...(total.files ? { lastImport: Date.now(), lastImportSummary: summarize(total) } : {}),
    })
    return { started: true, summary, errors, importErrors: total.errors }
  })
}

export function runImportOnly() {
  return runSync({ garmin: false })
}

export function runReprocess() {
  return exclusive('reprocess', async () => {
    const r = await reprocessAll()
    await updateMeta({ lastImport: Date.now(), lastImportSummary: `Re-processed ${summarize(r)}` })
    return { started: true, result: r }
  })
}
