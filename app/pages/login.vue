<script setup lang="ts">
const password = ref('')
const error = ref('')
const busy = ref(false)
async function submit() {
  busy.value = true
  error.value = ''
  try {
    await $fetch('/api/login', { method: 'POST', body: { password: password.value } })
    window.location.href = '/'
  } catch {
    error.value = 'Wrong password'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="wrap">
    <form class="card box" @submit.prevent="submit">
      <div class="row" style="gap: 10px; margin-bottom: 18px">
        <img src="/favicon.svg" width="30" height="30" alt="">
        <h1>Strava Analyzer</h1>
      </div>
      <label for="pw" class="text-2" style="font-size: 13px">Dashboard password</label>
      <input id="pw" v-model="password" type="password" autocomplete="current-password" autofocus style="width: 100%; margin: 6px 0 12px">
      <div v-if="error" class="notice error" style="margin-bottom: 12px">{{ error }}</div>
      <button class="btn primary" style="width: 100%" :disabled="busy || !password">Sign in</button>
    </form>
  </div>
</template>

<style scoped>
.wrap { min-height: 100vh; display: grid; place-items: center; padding: 16px; }
.box { width: 100%; max-width: 360px; padding: 26px; }
</style>
