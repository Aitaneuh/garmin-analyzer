<script setup lang="ts">
const { data: status, refresh } = useStatus()
const dataVersion = useDataVersion()

// --- Upload ------------------------------------------------------------------------------
const dragging = ref(false)
const uploads = ref<{ name: string; size: number; loaded: number; state: 'queued' | 'uploading' | 'done' | 'error'; error?: string }[]>([])
const uploading = computed(() => uploads.value.some(u => u.state === 'queued' || u.state === 'uploading'))
const fileInput = ref<HTMLInputElement>()

function fmtBytes(n: number) {
  if (n > 1e9) return `${nf(n / 1e9, 1)} GB`
  if (n > 1e6) return `${nf(n / 1e6, 1)} MB`
  return `${nf(n / 1e3, 0)} KB`
}

function uploadOne(file: File, entry: (typeof uploads.value)[number]) {
  return new Promise<void>((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', `/api/upload?name=${encodeURIComponent(file.name)}`)
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    xhr.upload.onprogress = (e) => { entry.loaded = e.loaded }
    xhr.onload = () => {
      if (xhr.status < 300) entry.state = 'done'
      else {
        entry.state = 'error'
        try { entry.error = JSON.parse(xhr.responseText).statusMessage } catch { entry.error = `HTTP ${xhr.status}` }
      }
      resolve()
    }
    xhr.onerror = () => { entry.state = 'error'; entry.error = 'network error'; resolve() }
    entry.state = 'uploading'
    xhr.send(file)
  })
}

async function addFiles(list: FileList | File[] | null | undefined) {
  const files = [...(list ?? [])].filter(f => /\.(fit|zip|gz|json)$/i.test(f.name))
  if (!files.length) return
  const entries = files.map(f => reactive({ name: f.name, size: f.size, loaded: 0, state: 'queued' as const }))
  uploads.value.push(...entries)
  for (const [i, f] of files.entries()) await uploadOne(f, entries[i]!)
  await $fetch('/api/import', { method: 'POST' })
  await refresh()
}
function onDrop(e: DragEvent) {
  dragging.value = false
  addFiles(e.dataTransfer?.files)
}

// --- Garmin Connect login ---------------------------------------------------------------
const email = ref('')
const password = ref('')
const mfaCode = ref('')
const needsMfa = ref(false)
const busy = ref(false)
const loginError = ref('')

async function login() {
  busy.value = true
  loginError.value = ''
  try {
    const r = await $fetch<any>('/api/garmin/login', { method: 'POST', body: { email: email.value, password: password.value } })
    password.value = ''
    if (r.needsMfa) needsMfa.value = true
    else if (!r.ok) loginError.value = r.error || 'Login failed'
    await refresh()
  } catch (e: any) {
    loginError.value = e?.data?.statusMessage || e?.message || 'Login failed'
  } finally {
    busy.value = false
  }
}
async function submitMfa() {
  busy.value = true
  loginError.value = ''
  try {
    const r = await $fetch<any>('/api/garmin/mfa', { method: 'POST', body: { code: mfaCode.value } })
    if (r.ok) { needsMfa.value = false; mfaCode.value = '' }
    else loginError.value = r.error || 'Code rejected'
    await refresh()
  } catch (e: any) {
    loginError.value = e?.data?.statusMessage || e?.message || 'Code rejected'
  } finally {
    busy.value = false
  }
}
async function logoutGarmin() {
  await $fetch('/api/garmin/logout', { method: 'POST' })
  await refresh()
}

// --- Sync / maintenance -----------------------------------------------------------------
async function sync() {
  await $fetch('/api/sync', { method: 'POST' })
  await refresh()
}
async function reprocess() {
  await $fetch('/api/reprocess', { method: 'POST' })
  await refresh()
}
const confirmWipe = ref(false)
async function wipe() {
  await $fetch('/api/wipe', { method: 'POST' })
  confirmWipe.value = false
  dataVersion.value++
  await refresh()
}
const s = computed(() => status.value?.sync)
const g = computed(() => status.value?.garmin)
</script>

<template>
  <div style="max-width: 920px">
    <h1 style="margin-bottom: 14px">Settings &amp; data</h1>

    <div v-if="!status" class="empty">Loading…</div>
    <template v-else>
      <!-- Status ------------------------------------------------------------------- -->
      <div class="card">
        <div class="card-head"><h2>Your data</h2><button class="btn small primary" :disabled="s?.running" @click="sync">Sync now</button></div>
        <table class="data">
          <tbody>
            <tr><td>Activities</td><td class="r">{{ nf(status.activityCount) }}</td></tr>
            <tr><td>Days of health data</td><td class="r">{{ nf(status.healthDays) }}</td></tr>
            <tr><td>Devices</td><td class="r">{{ status.devices.join(', ') || '–' }}</td></tr>
            <tr><td>Last sync</td><td class="r">{{ s?.lastSync ? new Date(s.lastSync).toLocaleString() : 'never' }}</td></tr>
            <tr v-if="s?.lastImportSummary"><td>Last import</td><td class="r">{{ s.lastImportSummary }} <span class="muted">({{ relTime(s.lastImport) }})</span></td></tr>
            <tr><td>Auto-sync</td><td class="r">{{ status.syncIntervalMinutes ? `every ${status.syncIntervalMinutes} min` : 'off' }}</td></tr>
          </tbody>
        </table>
        <div v-if="s?.running" class="progress">
          <div class="row" style="justify-content: space-between"><span>{{ s.message || 'Working…' }}</span><span v-if="s.total" class="muted">{{ s.done }} / {{ s.total }}</span></div>
          <div class="bar-bg"><div class="bar" :style="{ width: s.total ? `${Math.min(100, s.done / s.total * 100)}%` : '30%' }" :class="{ indet: !s.total }" /></div>
        </div>
      </div>

      <!-- Import --------------------------------------------------------------------- -->
      <div class="card section">
        <div class="card-head"><h2>Import FIT files</h2><span class="hint">works without any account</span></div>
        <div
          class="drop" :class="{ on: dragging }"
          @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false" @drop.prevent="onDrop"
          @click="fileInput?.click()"
        >
          <strong>Drop files here</strong> or click to choose
          <div class="muted" style="font-size: 12.5px; margin-top: 4px">.fit · .zip (Garmin export, any size) · .fit.gz (Strava export)</div>
          <input ref="fileInput" type="file" multiple accept=".fit,.zip,.gz,.json" style="display: none" @change="addFiles(($event.target as HTMLInputElement).files)">
        </div>
        <div v-if="uploads.length" class="uploads">
          <div v-for="(u, i) in uploads" :key="i" class="up">
            <span class="ellipsis">{{ u.name }}</span>
            <span class="muted">{{ fmtBytes(u.size) }}</span>
            <span v-if="u.state === 'uploading'">{{ nf(u.loaded / Math.max(1, u.size) * 100) }}%</span>
            <span v-else-if="u.state === 'done'" style="color: var(--good)">✓ uploaded</span>
            <span v-else-if="u.state === 'error'" style="color: var(--critical)">✕ {{ u.error }}</span>
            <span v-else class="muted">waiting</span>
          </div>
          <p v-if="!uploading" class="muted" style="font-size: 12.5px; margin: 8px 0 0">Uploaded. Import progress shows above and in the sidebar.</p>
        </div>

        <h3 style="margin-top: 18px">Where to get your files</h3>
        <ol class="steps">
          <li>
            <strong>Your whole history (recommended once):</strong> on
            <a href="https://www.garmin.com/account/datamanagement/exportdata" target="_blank" rel="noopener">garmin.com → Account → Data Management → Export Your Data</a>,
            request the export. Garmin emails you a link (can take a few hours to a few days). Upload that zip here as is; activity names come along too.
          </li>
          <li><strong>Straight from the watch:</strong> plug the Forerunner into a computer via USB and copy <code>GARMIN/Activity/*.fit</code>.</li>
          <li><strong>One activity:</strong> in Garmin Connect, open an activity → ⚙ → <em>Export Original</em> (gives a .zip).</li>
          <li><strong>From Strava:</strong> Strava's "Download your data" archive also works (.fit.gz files inside).</li>
        </ol>
        <p v-if="status.importDir" class="muted" style="font-size: 12.5px">
          Watched folder: <code>{{ status.importDir }}</code>. Anything you copy there (e.g. via Syncthing or a network share) is imported every 5 minutes and never modified.
        </p>
        <p v-else class="muted" style="font-size: 12.5px">
          Tip: set <code>NUXT_IMPORT_DIR</code> and mount a folder there to have new files imported automatically.
        </p>
      </div>

      <!-- Garmin Connect ------------------------------------------------------------- -->
      <div class="card section">
        <div class="card-head"><h2>Garmin Connect auto-sync</h2><span v-if="g?.loggedIn" class="pill">logged in</span></div>
        <div v-if="!g?.available" class="notice">The Garmin helper isn't installed in this image (Python + garminconnect). Use the Docker image from this project.</div>

        <template v-else-if="g.loggedIn">
          <table class="data">
            <tbody>
              <tr v-if="g.fullName"><td>Account</td><td class="r">{{ g.fullName }}</td></tr>
              <tr><td>Last Garmin sync</td><td class="r">{{ g.lastSync ? new Date(g.lastSync).toLocaleString() : 'not yet' }}</td></tr>
              <tr><td>Activity history</td><td class="r">{{ g.historyDone ? 'complete' : 'still downloading (150 per sync)' }}</td></tr>
            </tbody>
          </table>
          <div v-if="g.lastError" class="notice error" style="margin-top: 12px">{{ g.lastError }}</div>
          <p class="text-2" style="font-size: 13px">
            New activities are downloaded as original FIT files, together with daily health data (sleep, HRV, resting HR, steps, stress, Body Battery, VO2 max, race predictions).
          </p>
          <button class="btn danger" @click="logoutGarmin">Log out of Garmin</button>
        </template>

        <template v-else>
          <div v-if="g.lastError" class="notice error" style="margin-bottom: 12px">{{ g.lastError }}</div>
          <p class="text-2" style="margin-top: 0; font-size: 13.5px">
            Downloads new activities and health data automatically. Garmin has no official API for individuals, so this uses the same login as the Garmin Connect app
            (via the open-source <a href="https://github.com/cyberjunky/python-garminconnect" target="_blank" rel="noopener">python-garminconnect</a>).
            <strong>Your password is not stored</strong>: it is used once to get a login token, which is kept in the data volume.
            Garmin sometimes changes its login, which can break this until the library is updated; FIT import always works.
          </p>
          <form v-if="!needsMfa" class="login" @submit.prevent="login">
            <input v-model="email" type="email" placeholder="Garmin email" autocomplete="username" required>
            <input v-model="password" type="password" placeholder="Garmin password" autocomplete="current-password" required>
            <button class="btn primary" :disabled="busy">{{ busy ? 'Logging in… (up to a minute)' : 'Log in to Garmin' }}</button>
          </form>
          <form v-else class="login" @submit.prevent="submitMfa">
            <p class="text-2" style="margin: 0 0 6px; width: 100%">Garmin sent you a verification code (email or authenticator app).</p>
            <input v-model="mfaCode" inputmode="numeric" autocomplete="one-time-code" placeholder="6-digit code" required>
            <button class="btn primary" :disabled="busy">{{ busy ? 'Checking…' : 'Verify' }}</button>
            <button type="button" class="btn" @click="needsMfa = false">Cancel</button>
          </form>
          <div v-if="loginError" class="notice error" style="margin-top: 12px">{{ loginError }}</div>
          <details style="margin-top: 12px">
            <summary class="muted" style="cursor: pointer; font-size: 12.5px">Login keeps failing?</summary>
            <p class="text-2" style="font-size: 13px">
              Garmin blocks logins from some IPs and after too many attempts (wait 15–30 minutes). You can also log in from a terminal:
              Portainer → Containers → <em>strava-analyzer</em> → <em>Console</em> → Connect, then run
              <code>python3 /app/garmin/bridge.py login-cli</code> and follow the prompts. Then click Sync now.
            </p>
          </details>
        </template>
      </div>

      <!-- Maintenance ---------------------------------------------------------------- -->
      <div class="card section">
        <div class="card-head"><h2>Maintenance</h2></div>
        <div class="row">
          <button class="btn" :disabled="s?.running" title="Re-reads every stored original FIT file, e.g. after an update that adds new metrics" @click="reprocess">Re-process all FIT files</button>
          <button v-if="!confirmWipe" class="btn danger" :disabled="s?.running" @click="confirmWipe = true">Delete all data…</button>
          <template v-else>
            <button class="btn danger" style="border-color: var(--critical)" @click="wipe">Yes, delete activities, files &amp; health data</button>
            <button class="btn" @click="confirmWipe = false">Cancel</button>
          </template>
        </div>
        <p class="muted" style="font-size: 12.5px; margin-bottom: 0">Deleting keeps the Garmin login. Original FIT files live in the data volume under <code>fit/</code>.</p>
      </div>

      <div class="card section">
        <h2>Security</h2>
        <p class="text-2" style="margin-bottom: 0">
          Password protection is <strong>{{ status.passwordProtected ? 'on' : 'off' }}</strong>.
          <template v-if="!status.passwordProtected"> Set <code>NUXT_DASHBOARD_PASSWORD</code> if this dashboard is reachable by anyone else: it shows your health data and where you train.</template>
        </p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.steps { padding-left: 20px; display: flex; flex-direction: column; gap: 8px; color: var(--text-2); font-size: 13.5px; }
.drop {
  border: 2px dashed var(--axis); border-radius: var(--radius); padding: 26px 16px; text-align: center; cursor: pointer;
  background: var(--surface-2); color: var(--text-2); transition: border-color .15s, background .15s;
}
.drop.on, .drop:hover { border-color: var(--accent); }
.uploads { margin-top: 12px; display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.up { display: grid; grid-template-columns: 1fr auto auto; gap: 12px; }
.ellipsis { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.login { display: flex; flex-wrap: wrap; gap: 8px; }
.login input { flex: 1; min-width: 180px; }
.progress { margin-top: 14px; font-size: 13px; color: var(--text-2); }
.bar-bg { background: var(--surface-2); border-radius: 4px; height: 8px; overflow: hidden; margin-top: 6px; }
.bar { height: 100%; background: var(--accent); border-radius: 4px; transition: width .4s; }
.bar.indet { animation: slide 1.2s infinite ease-in-out; }
@keyframes slide { from { transform: translateX(-100%); } to { transform: translateX(340%); } }
</style>
