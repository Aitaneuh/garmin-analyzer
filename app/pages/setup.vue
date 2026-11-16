<script setup lang="ts">
const route = useRoute()
const { data: status, refresh } = useStatus()

const errors: Record<string, string> = {
  access_denied: 'You cancelled the authorization on Strava.',
  invalid_state: 'The login session expired or was tampered with. Please try again.',
  missing_activity_scope: 'Please tick "View data about your activities" (including private ones) on the Strava consent screen — the dashboard needs it.',
  token_exchange_failed: 'Strava rejected the code. Check NUXT_STRAVA_CLIENT_ID / NUXT_STRAVA_CLIENT_SECRET.',
}
const error = computed(() => (route.query.error ? errors[String(route.query.error)] ?? String(route.query.error) : ''))

async function sync(full = false) {
  await $fetch('/api/sync', { method: 'POST', body: { full } })
  await refresh()
}
async function disconnect(wipe: boolean) {
  await $fetch('/api/auth/disconnect', { method: 'POST', body: { wipe } })
  await refresh()
}
const confirmWipe = ref(false)

const rl = computed(() => status.value?.sync.rateLimit)
</script>

<template>
  <div style="max-width: 860px">
    <h1 style="margin-bottom: 14px">Settings &amp; connection</h1>

    <div v-if="route.query.connected" class="notice" style="margin-bottom: 14px">
      ✅ Connected! Your full history is downloading in the background — the sidebar shows progress. Large histories take a few minutes.
    </div>
    <div v-if="error" class="notice error" style="margin-bottom: 14px">{{ error }}</div>

    <div v-if="!status" class="empty">Loading…</div>
    <template v-else>
      <!-- Not configured: show how to create the Strava API app -->
      <div v-if="!status.configured" class="card">
        <h2>1 · Create your Strava API application</h2>
        <ol class="steps">
          <li>Go to <a href="https://www.strava.com/settings/api" target="_blank" rel="noopener">strava.com/settings/api</a> and create an app (any name/website/icon).</li>
          <li>Set <strong>Authorization Callback Domain</strong> to <code>{{ status.callbackDomain }}</code></li>
          <li>Copy the <strong>Client ID</strong> and <strong>Client Secret</strong> into the container's environment as <code>NUXT_STRAVA_CLIENT_ID</code> and <code>NUXT_STRAVA_CLIENT_SECRET</code>, then redeploy the stack.</li>
        </ol>
        <p class="muted">The redirect URI this app will use: <code>{{ status.redirectUri }}</code>. If it's not the address you open the dashboard on, set <code>NUXT_APP_URL</code>.</p>
      </div>

      <div v-else-if="!status.connected" class="card">
        <h2>Connect your Strava account</h2>
        <p class="text-2">You'll be sent to Strava to approve read access to your profile and activities (including private ones). Nothing is ever written to your Strava account.</p>
        <p class="muted" style="font-size: 12.5px">Callback domain on strava.com/settings/api must be <code>{{ status.callbackDomain }}</code>. Redirect URI: <code>{{ status.redirectUri }}</code></p>
        <a href="/api/auth/strava" class="connect">
          <span>Connect with Strava</span>
        </a>
      </div>

      <template v-else>
        <div class="card">
          <div class="card-head"><h2>Strava connection</h2><span class="pill">connected</span></div>
          <div v-if="status.athlete" class="row" style="gap: 14px">
            <img v-if="status.athlete.profile?.startsWith('http')" :src="status.athlete.profile" width="54" height="54" style="border-radius: 50%" alt="">
            <div>
              <div style="font-weight: 650; font-size: 16px">{{ status.athlete.firstname }} {{ status.athlete.lastname }}</div>
              <div class="muted">
                Athlete #{{ status.athlete.id }}<template v-if="status.athlete.created_at"> · on Strava since {{ fmtDate(status.athlete.created_at) }}</template>
                <template v-if="status.athlete.weight"> · {{ status.athlete.weight }} kg</template>
                <template v-if="status.athlete.ftp"> · FTP {{ status.athlete.ftp }} W</template>
              </div>
            </div>
          </div>
        </div>

        <div class="card section">
          <div class="card-head"><h2>Sync</h2></div>
          <table class="data">
            <tbody>
              <tr><td>Activities stored</td><td class="r">{{ nf(status.activityCount) }}</td></tr>
              <tr><td>Activities with details (best efforts, calories, device)</td><td class="r">{{ nf(status.detailCount) }} <span class="muted">({{ status.pendingDetails }} pending)</span></td></tr>
              <tr><td>Last sync</td><td class="r">{{ status.sync.lastSync ? new Date(status.sync.lastSync).toLocaleString() : 'never' }}</td></tr>
              <tr><td>Auto-sync</td><td class="r">{{ status.syncIntervalMinutes ? `every ${status.syncIntervalMinutes} min` : 'disabled' }}</td></tr>
              <tr v-if="rl"><td>Strava API usage (15 min / day)</td><td class="r">{{ rl.shortUsage }} / {{ rl.shortLimit }} · {{ rl.dailyUsage }} / {{ rl.dailyLimit }}</td></tr>
              <tr v-if="status.sync.running"><td>Status</td><td class="r">syncing {{ status.sync.phase }}… ({{ status.sync.fetched }} fetched)</td></tr>
            </tbody>
          </table>
          <div class="row" style="margin-top: 14px">
            <button class="btn primary" :disabled="status.sync.running" @click="sync(false)">Sync new activities</button>
            <button class="btn" :disabled="status.sync.running" title="Re-downloads every activity summary and removes ones deleted on Strava" @click="sync(true)">Full re-sync</button>
          </div>
        </div>

        <div class="card section">
          <div class="card-head"><h2>Disconnect</h2></div>
          <p class="text-2" style="margin-top: 0">Revokes this app's access on Strava. You can keep the downloaded data or wipe it.</p>
          <div class="row">
            <button class="btn danger" @click="disconnect(false)">Disconnect, keep data</button>
            <button v-if="!confirmWipe" class="btn danger" @click="confirmWipe = true">Disconnect &amp; wipe data…</button>
            <button v-else class="btn danger" style="border-color: var(--critical)" @click="disconnect(true)">Yes, delete everything</button>
          </div>
        </div>
      </template>

      <div class="card section">
        <h2>Security</h2>
        <p class="text-2" style="margin-bottom: 0">
          Password protection is <strong>{{ status.passwordProtected ? 'on' : 'off' }}</strong>.
          <template v-if="!status.passwordProtected"> Set <code>NUXT_DASHBOARD_PASSWORD</code> if this dashboard is reachable by anyone else (it shows private activities and your map).</template>
        </p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.steps { padding-left: 20px; display: flex; flex-direction: column; gap: 8px; color: var(--text-2); }
.connect {
  display: inline-flex; align-items: center; gap: 10px; background: #fc4c02; color: #fff; font-weight: 650;
  padding: 11px 20px; border-radius: 8px; margin-top: 6px;
}
.connect:hover { text-decoration: none; filter: brightness(1.06); }
</style>
