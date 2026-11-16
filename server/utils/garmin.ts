import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Runs garmin/bridge.py (python-garminconnect) and returns its JSON answer.
 * Garmin has no public API for individuals, so this uses the same unofficial login as the
 * Garmin Connect mobile app. It can break when Garmin changes things; rebuilding the image
 * pulls the latest library version.
 */

export interface BridgeResult {
  ok?: boolean
  error?: string
  kind?: 'auth' | 'rate_limit' | 'error'
  [k: string]: any
}

export function bridgePath() {
  const candidates = [process.env.GARMIN_BRIDGE, '/app/garmin/bridge.py', resolve('garmin/bridge.py')].filter(Boolean) as string[]
  return candidates.find(p => existsSync(p))
}

export function pythonBin() {
  return process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3')
}

export function garminAvailable() {
  return !!bridgePath()
}

export function runBridge(cmd: string, input: unknown, onProgress?: (p: any) => void, timeoutMs = 30 * 60_000): Promise<BridgeResult> {
  const script = bridgePath()
  if (!script) return Promise.resolve({ error: 'Garmin helper not found (garmin/bridge.py)', kind: 'error' })
  return new Promise((resolvePromise) => {
    const child = spawn(pythonBin(), [script, cmd], {
      env: { ...process.env, GARMIN_DIR: dataPath('garmin'), PYTHONUNBUFFERED: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderrBuf = ''
    let stderrTail = ''
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs)
    child.stdout.on('data', (c) => { stdout += c })
    child.stderr.on('data', (c) => {
      stderrBuf += c
      let i
      while ((i = stderrBuf.indexOf('\n')) >= 0) {
        const line = stderrBuf.slice(0, i)
        stderrBuf = stderrBuf.slice(i + 1)
        try {
          const msg = JSON.parse(line)
          if (msg && typeof msg === 'object' && 'progress' in msg) {
            onProgress?.(msg)
            continue
          }
        } catch { /* not JSON */ }
        if (line.trim()) stderrTail = (stderrTail + '\n' + line).slice(-2000)
      }
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      resolvePromise({ error: `Could not start Python (${pythonBin()}): ${err.message}`, kind: 'error' })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      const last = stdout.trim().split('\n').filter(Boolean).pop()
      if (last) {
        try {
          return resolvePromise(JSON.parse(last))
        } catch { /* fall through */ }
      }
      if (stderrTail.trim()) console.error('[garmin]', stderrTail.trim())
      resolvePromise({ error: `Garmin helper exited with code ${code}${stderrTail ? `: ${stderrTail.trim().split('\n').pop()}` : ''}`, kind: 'error' })
    })
    child.stdin.end(JSON.stringify(input ?? {}))
  })
}

// MFA logins are two steps. The pending state holds session cookies, so it stays in memory only.
let pendingMfa: { state: unknown; at: number } | null = null

export async function garminLogin(email: string, password: string) {
  const r = await runBridge('login', { email, password }, undefined, 3 * 60_000)
  if (r.needs_mfa) {
    pendingMfa = { state: r.state, at: Date.now() }
    return { needsMfa: true }
  }
  if (r.ok) await afterLogin(r)
  return { ok: !!r.ok, error: r.error }
}

export async function garminMfa(code: string) {
  if (!pendingMfa || Date.now() - pendingMfa.at > 10 * 60_000) {
    pendingMfa = null
    return { ok: false, error: 'The login session expired. Enter your email and password again.' }
  }
  const r = await runBridge('mfa', { state: pendingMfa.state, code }, undefined, 3 * 60_000)
  if (r.ok) {
    pendingMfa = null
    await afterLogin(r)
  }
  return { ok: !!r.ok, error: r.error }
}

async function afterLogin(r: BridgeResult) {
  await updateGarminMeta({ connected: true, fullName: r.full_name, displayName: r.display_name, profile: r.profile, lastError: undefined })
}

export async function garminLogout() {
  await runBridge('logout', {})
  await updateGarminMeta({ connected: false, lastError: undefined })
}

export function garminTokensExist() {
  return existsSync(dataPath('garmin', 'tokens', 'garmin_tokens.json'))
}

/** One Garmin Connect sync: download new activity files to the inbox and fetch health data. */
export async function garminSync(): Promise<{ downloaded: number; warnings: string[]; error?: string }> {
  const cfg = useRuntimeConfig()
  const [acts, health] = await Promise.all([getActivities(), getHealth()])
  const list = Object.values(acts)
  const healthDays = Number(cfg.garminHealthDays ?? 365)
  const r = await runBridge('sync', {
    known_ids: list.map(a => a.garmin_id).filter(Boolean),
    known_starts: list.map(a => a.id),
    inbox: dataPath('inbox'),
    max_downloads: Number(cfg.garminMaxDownloads ?? 150),
    health_days: healthDays,
    health_have: Object.values(health).filter(d => (d as any).final).map(d => d.date),
    health_budget: Number(cfg.garminHealthBudget ?? 45),
  }, (p) => {
    syncState.message = p.progress === 'Downloading activity'
      ? `Garmin: downloading ${p.name ?? p.id}`
      : p.progress === 'Health data' ? `Garmin: health data ${p.date}` : `Garmin: ${p.progress}`
  })

  if (r.error) {
    if (r.kind === 'auth') await updateGarminMeta({ connected: false })
    await updateGarminMeta({ lastError: r.error })
    return { downloaded: 0, warnings: [], error: r.error }
  }

  // Names / ids / race flags for activities.
  if (Array.isArray(r.meta)) await mergeGarminMeta(r.meta)

  // Health days + VO2 max history.
  const next = { ...(await getHealth()) }
  for (const [date, day] of Object.entries<any>(r.health ?? {})) next[date] = { ...next[date], ...day, date, fetched_at: Date.now() }
  for (const [date, v] of Object.entries<any>(r.vo2max ?? {})) next[date] = { ...next[date], ...v, date }
  // Forget days outside the window.
  const cutoff = new Date(Date.now() - (healthDays + 7) * 86_400_000).toISOString().slice(0, 10)
  for (const d of Object.keys(next)) if (d < cutoff && !next[d]!.vo2max) delete next[d]
  await saveHealth(next)

  const patch: any = {
    connected: true,
    fullName: r.full_name,
    displayName: r.display_name,
    lastSync: Date.now(),
    lastError: r.warnings?.length ? r.warnings.join(' · ') : undefined,
    historyDone: !r.more_activities,
  }
  if (r.profile) patch.profile = r.profile
  await updateGarminMeta(patch)
  if (r.race_predictions) await updateMeta({ racePredictions: r.race_predictions })
  return { downloaded: r.downloaded ?? 0, warnings: r.warnings ?? [] }
}
