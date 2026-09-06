<script setup lang="ts">
interface BetaSession {
  authenticated: boolean
  identity?: {
    id: string
    discordUserId: string
    displayName: string
  }
}

interface BetaAccessRequest {
  id: string
  discordIdentityId: string
  displayName: string
  motivation: string
  intendedUsage: string
  aionProfile: string | null
  expectedClients: string[]
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED'
  createdAt: string
  updatedAt: string
}

interface BetaAccessState {
  authenticated: true
  identity: {
    id: string
    discordUserId: string
    displayName: string
  }
  canSubmit: boolean
  request: BetaAccessRequest | null
}

const session = ref<BetaSession>({ authenticated: false })
const accessState = ref<BetaAccessState | null>(null)
const loading = ref(false)
const accessLoading = ref(false)
const requestBusy = ref(false)
const error = ref('')
const requestError = ref('')
const accessError = ref('')

const betaStartUrl = '/api/beta/discord/start'
const expectedClientOptions = [
  'T3 Code',
  'Codex',
  'Claude',
  'ChatGPT',
  'Custom MCP client',
  'Other'
] as const

const requestForm = reactive({
  displayName: '',
  motivation: '',
  intendedUsage: '',
  aionProfile: '',
  expectedClients: [] as string[]
})

const requestStatus = computed(() => accessState.value?.request?.status ?? null)

function resetRequestForm(displayName = '') {
  requestForm.displayName = displayName
  requestForm.motivation = ''
  requestForm.intendedUsage = ''
  requestForm.aionProfile = ''
  requestForm.expectedClients = []
}

async function refreshAccess() {
  if (!session.value.authenticated) {
    accessState.value = null
    accessLoading.value = false
    accessError.value = ''
    return
  }

  accessLoading.value = true
  accessError.value = ''
  requestError.value = ''
  try {
    accessState.value = await $fetch<BetaAccessState>('/api/beta/access')
    if (!requestForm.displayName) {
      requestForm.displayName = session.value.identity?.displayName ?? ''
    }
  } catch {
    accessState.value = null
    accessError.value = 'Could not load your private beta status.'
  } finally {
    accessLoading.value = false
  }

  if (requestStatus.value === 'APPROVED') {
    await navigateTo('/app', { replace: true })
  }
}

async function refreshSession() {
  try {
    session.value = await $fetch<BetaSession>('/api/beta/session')
    if (session.value.authenticated) {
      if (!requestForm.displayName) {
        requestForm.displayName = session.value.identity?.displayName ?? ''
      }
      await refreshAccess()
    } else {
      accessState.value = null
      resetRequestForm()
    }
  } catch {
    session.value = { authenticated: false }
    accessState.value = null
    resetRequestForm()
  }
}

async function signOut() {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    session.value = await $fetch<BetaSession>('/api/beta/session', {
      method: 'DELETE'
    })
    accessState.value = null
    accessError.value = ''
    resetRequestForm()
  } catch {
    error.value = 'Sign-out failed.'
  } finally {
    loading.value = false
  }
}

async function submitRequest() {
  if (!session.value.authenticated || requestBusy.value || accessLoading.value) return
  requestBusy.value = true
  requestError.value = ''
  try {
    accessState.value = await $fetch<BetaAccessState>('/api/beta/access', {
      method: 'POST',
      body: {
        displayName: requestForm.displayName,
        motivation: requestForm.motivation,
        intendedUsage: requestForm.intendedUsage,
        aionProfile: requestForm.aionProfile || null,
        expectedClients: requestForm.expectedClients
      }
    })
  } catch (cause: any) {
    const statusMessage = String(cause?.data?.statusMessage ?? '')
    if (statusMessage === 'active_request_exists') {
      requestError.value = 'A private beta request is already active for this account.'
    } else if (statusMessage) {
      requestError.value = statusMessage
    } else {
      requestError.value = 'Could not submit the request.'
    }
  } finally {
    requestBusy.value = false
  }
}

onMounted(refreshSession)
</script>

<template>
  <main class="landing">
    <div class="atmosphere atmosphere-cyan" aria-hidden="true" />
    <div class="atmosphere atmosphere-violet" aria-hidden="true" />

    <header class="site-header content-width">
      <NuxtLink class="brand" to="/" aria-label="Aion Theory MCP home">
        <svg class="brand-mark" viewBox="0 0 160 160" fill="none" aria-hidden="true">
          <defs>
            <linearGradient id="brand-constellation" x1="24" y1="132" x2="136" y2="28" gradientUnits="userSpaceOnUse">
              <stop stop-color="#5262ff" />
              <stop offset=".54" stop-color="#55d6ff" />
              <stop offset="1" stop-color="#ecfdff" />
            </linearGradient>
            <filter id="brand-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <path d="M22 124 50 104 66 70 82 92 106 50 136 30" stroke="url(#brand-constellation)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
          <path d="m22 124 42 9 34-16 30 7M50 104l14 29M66 70l32 47M82 92l24-42M106 50l22 25" stroke="url(#brand-constellation)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity=".72" />
          <path d="M80 18v28M66 32h28" stroke="#dffbff" stroke-width="4" stroke-linecap="round" filter="url(#brand-glow)" />
          <circle cx="22" cy="124" r="8" fill="#6574ff" />
          <circle cx="50" cy="104" r="7" fill="#55d6ff" />
          <circle cx="66" cy="70" r="6" fill="#86e6ff" />
          <circle cx="82" cy="92" r="10" fill="#f2feff" filter="url(#brand-glow)" />
          <circle cx="106" cy="50" r="7" fill="#62d8ff" />
          <circle cx="136" cy="30" r="8" fill="#e6fcff" filter="url(#brand-glow)" />
          <circle cx="64" cy="133" r="5" fill="#626eff" />
          <circle cx="98" cy="117" r="6" fill="#58d4ff" />
          <circle cx="128" cy="124" r="5" fill="#7480ff" />
        </svg>
        <span class="brand-name">AION THEORY <small>MCP</small></span>
      </NuxtLink>
      <span class="private-beta">Private Beta</span>
    </header>

    <section class="hero content-width" aria-labelledby="landing-title">
      <div class="hero-copy">
        <p class="eyebrow">AION 2 · PRIVATE BETA</p>
        <h1 id="landing-title">Your Aion 2 research,<br />with memory.</h1>
        <p class="lede">
          Track KR, TW and GLOBAL sources.<br />
          Keep theories, contradictions and discoveries across AI sessions.
        </p>
        <div class="hero-action">
          <a class="button primary" :href="betaStartUrl">Request beta access with Discord</a>
          <p>Private beta. Access is reviewed manually.</p>
        </div>
      </div>

      <div class="hero-visual" aria-hidden="true">
        <div class="visual-starfield" />
        <div class="visual-horizon" />
        <div class="memory-rift">
          <span class="rift-core" />
          <span class="rift-arc rift-arc-one" />
          <span class="rift-arc rift-arc-two" />
          <span class="rift-trace rift-trace-one" />
          <span class="rift-trace rift-trace-two" />
          <span class="rift-particle rift-particle-one" />
          <span class="rift-particle rift-particle-two" />
          <span class="rift-particle rift-particle-three" />
        </div>
      </div>
    </section>

    <section class="values content-width" aria-label="Aion Theory principles">
      <article>
        <p class="value-number">01</p>
        <h2>KR / TW / GLOBAL</h2>
        <p>Keep regional information separated.</p>
      </article>
      <article>
        <p class="value-number">02</p>
        <h2>Sources before certainty</h2>
        <p>Know what is observed, sourced, inferred or uncertain.</p>
      </article>
      <article>
        <p class="value-number">03</p>
        <h2>Theorycraft that persists</h2>
        <p>Keep mechanics, builds and contradictions across sessions.</p>
      </article>
    </section>

    <section v-if="session.authenticated" class="beta-flow content-width" aria-live="polite">
      <div v-if="accessLoading" class="compact-state">Checking your beta access.</div>
      <div v-else-if="accessError" class="compact-state" role="alert">{{ accessError }}</div>
      <div v-else-if="requestStatus === 'PENDING'" class="compact-state">
        <strong>Request pending</strong>
        <p>Your beta request is currently under review.</p>
      </div>
      <div v-else-if="requestStatus === 'APPROVED'" class="compact-state">
        <strong>Access approved</strong>
        <p>Opening your Aion Theory workspace.</p>
      </div>
      <div v-else-if="requestStatus === 'REJECTED'" class="compact-state">
        <strong>Request not approved</strong>
        <p>Your current beta request was not approved.</p>
      </div>
      <div v-else-if="requestStatus === 'REVOKED'" class="compact-state">
        <strong>Access unavailable</strong>
        <p>Your beta access is no longer active.</p>
      </div>

      <div v-else class="request-section">
        <div class="request-intro">
          <p class="eyebrow">BETA ACCESS</p>
          <h2>Tell us what you are researching.</h2>
          <p>Keep it short, direct, and focused on Aion 2.</p>
        </div>
        <form class="beta-form" @submit.prevent="submitRequest">
          <label class="field">
            <span>Display name</span>
            <input v-model="requestForm.displayName" type="text" required maxlength="120" autocomplete="nickname" />
          </label>
          <label class="field">
            <span>Why do you want to join?</span>
            <textarea v-model="requestForm.motivation" required rows="4" maxlength="2000" placeholder="Tell us briefly why you want access." />
          </label>
          <label class="field">
            <span>How do you plan to use Aion Theory MCP?</span>
            <textarea v-model="requestForm.intendedUsage" required rows="4" maxlength="2000" placeholder="Describe your intended usage." />
          </label>
          <label class="field">
            <span>Aion 2 profile / experience</span>
            <textarea v-model="requestForm.aionProfile" rows="3" maxlength="2000" placeholder="Optional" />
          </label>
          <fieldset class="field">
            <legend>Expected MCP clients</legend>
            <div class="checkbox-grid">
              <label v-for="option in expectedClientOptions" :key="option" class="check-option">
                <input v-model="requestForm.expectedClients" type="checkbox" :value="option" />
                <span>{{ option }}</span>
              </label>
            </div>
          </fieldset>
          <p v-if="requestError" class="form-error" role="alert">{{ requestError }}</p>
          <button type="submit" class="button primary" :disabled="requestBusy || accessLoading">
            {{ requestBusy ? 'Submitting…' : 'Submit request' }}
          </button>
        </form>
      </div>

      <button v-if="!accessLoading && requestStatus !== 'APPROVED'" type="button" class="sign-out" :disabled="loading" @click="signOut">
        {{ loading ? 'Signing out…' : 'Sign out' }}
      </button>
    </section>

    <p v-if="error" class="error content-width" role="alert">{{ error }}</p>

    <footer class="site-footer content-width">
      <span>AION THEORY MCP</span>
      <span>Aion 2 research memory</span>
      <p class="legal-notice">
        Independent fan project. Not affiliated with, endorsed by, or connected to AION 2,
        NCSOFT, or their respective owners.
      </p>
    </footer>
  </main>
</template>

<style scoped>
/* Replaced landing styles kept inert while the public layout is rebuilt below.
.landing {
  position: relative;
  min-height: 100vh;
  padding: 28px 0 52px;
  overflow: hidden;
}

.ambient {
  position: absolute;
  border-radius: 999px;
  pointer-events: none;
  filter: blur(16px);
  opacity: 0.72;
}

.ambient-left {
  top: -10rem;
  left: -10rem;
  width: 34rem;
  height: 34rem;
  background: radial-gradient(circle, rgba(90, 176, 255, 0.24), transparent 68%);
}

.ambient-right {
  top: 8rem;
  right: -10rem;
  width: 32rem;
  height: 32rem;
  background: radial-gradient(circle, rgba(118, 92, 255, 0.22), transparent 70%);
}

.shell {
  position: relative;
  z-index: 1;
  width: min(1180px, calc(100% - 32px));
  margin: 0 auto;
  padding: 24px;
  border: 1px solid rgba(112, 144, 255, 0.18);
  border-radius: 30px;
  background:
    linear-gradient(180deg, rgba(8, 12, 22, 0.92), rgba(4, 7, 15, 0.96)),
    radial-gradient(circle at top, rgba(88, 157, 255, 0.18), transparent 36%);
  box-shadow:
    0 28px 90px rgba(0, 0, 0, 0.42),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(18px);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 20px;
  margin-bottom: 32px;
  border-bottom: 1px solid rgba(112, 144, 255, 0.14);
}

.brand {
  display: flex;
  align-items: center;
  gap: 14px;
}

.brand p,
.brand span,
.eyebrow,
.panel-top,
.header-note,
.label {
  margin: 0;
}

.brand p {
  font-size: 0.86rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.brand span {
  color: var(--aion-muted);
  font-size: 0.78rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.brand-mark {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  border: 1px solid rgba(144, 188, 255, 0.22);
  color: #ecf8ff;
  background:
    radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.92), transparent 22%),
    linear-gradient(135deg, rgba(56, 165, 255, 0.92), rgba(118, 92, 255, 0.86));
  font-weight: 800;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.04) inset,
    0 18px 40px rgba(66, 104, 255, 0.28);
}

.brand-copy {
  display: grid;
  gap: 3px;
}

.header-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-note {
  color: var(--aion-muted);
  font-size: 0.84rem;
}

.beta-pill {
  padding: 8px 12px;
  border: 1px solid rgba(112, 144, 255, 0.18);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.03);
  color: var(--aion-text);
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.hero {
  display: grid;
  grid-template-columns: minmax(0, 1.02fr) minmax(340px, 0.98fr);
  gap: 34px;
  align-items: center;
  min-height: 66vh;
  padding-bottom: 16px;
}

.eyebrow {
  color: var(--aion-accent-2);
  font-size: 0.72rem;
  letter-spacing: 0.26em;
  font-weight: 800;
  margin-bottom: 14px;
}

h1,
h2,
h3 {
  margin: 0;
  line-height: 1.05;
}

h1 {
  max-width: 12ch;
  font-family: "Iowan Old Style", "Palatino Linotype", Georgia, serif;
  font-weight: 600;
  font-size: clamp(3rem, 5.7vw, 5.6rem);
  line-height: 0.93;
  letter-spacing: -0.06em;
}

h2 {
  font-size: clamp(1.45rem, 2vw, 2.2rem);
  letter-spacing: -0.04em;
}

h3 {
  font-size: 0.95rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--aion-accent-2);
}

.copy {
  padding: 18px 0 6px;
}

.lede {
  max-width: 56ch;
  margin: 20px 0 0;
  color: var(--aion-muted);
  font-size: 1.05rem;
  line-height: 1.8;
}

.actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 30px;
}

.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 50px;
  padding: 0 22px;
  border-radius: 999px;
  border: 1px solid transparent;
  text-decoration: none;
  font-weight: 700;
  font-size: 0.92rem;
  letter-spacing: 0.01em;
  transition:
    transform 0.15s ease,
    border-color 0.15s ease,
    background 0.15s ease,
    box-shadow 0.15s ease;
}

.button:hover {
  transform: translateY(-1px);
}

.primary {
  color: #06111f;
  background: linear-gradient(135deg, #5fb8ff, #765cff);
  box-shadow: 0 18px 30px rgba(78, 111, 255, 0.24);
}

.primary:hover {
  box-shadow: 0 24px 40px rgba(78, 111, 255, 0.3);
}

.ghost {
  color: var(--aion-text);
  border-color: rgba(112, 144, 255, 0.22);
  background: rgba(255, 255, 255, 0.025);
}

.danger {
  margin-top: 20px;
  color: #ffd7d7;
  border-color: rgba(255, 110, 110, 0.28);
  background: rgba(255, 110, 110, 0.08);
}

.action-note {
  color: var(--aion-muted);
  font-size: 0.9rem;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 26px;
}

.tags span {
  padding: 9px 12px;
  border-radius: 999px;
  border: 1px solid rgba(112, 144, 255, 0.16);
  background: rgba(255, 255, 255, 0.03);
  color: var(--aion-text);
  font-size: 0.82rem;
  letter-spacing: 0.01em;
}

.panel {
  position: relative;
  border-radius: 26px;
  border: 1px solid rgba(112, 144, 255, 0.15);
  background:
    linear-gradient(180deg, rgba(8, 11, 20, 0.88), rgba(5, 8, 15, 0.96)),
    radial-gradient(circle at top right, rgba(118, 92, 255, 0.12), transparent 34%);
  overflow: hidden;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    0 24px 60px rgba(0, 0, 0, 0.24);
}

.panel-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  border-bottom: 1px solid rgba(112, 144, 255, 0.12);
  color: var(--aion-muted);
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgba(122, 140, 168, 0.8);
  box-shadow: 0 0 0 4px rgba(122, 140, 168, 0.12);
}

.dot.active {
  background: var(--aion-accent-2);
  box-shadow: 0 0 0 4px rgba(87, 216, 255, 0.14);
}

.panel-body {
  position: relative;
  padding: 20px 18px 18px;
}

.halo-card {
  position: relative;
  min-height: 240px;
  margin-bottom: 16px;
  padding: 22px;
  border-radius: 24px;
  border: 1px solid rgba(112, 144, 255, 0.14);
  background:
    linear-gradient(180deg, rgba(13, 18, 32, 0.96), rgba(6, 9, 17, 0.98)),
    radial-gradient(circle at 68% 18%, rgba(108, 95, 255, 0.16), transparent 32%);
  overflow: hidden;
}

.halo-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at center, rgba(84, 163, 255, 0.14), transparent 38%),
    radial-gradient(circle at 42% 62%, rgba(118, 92, 255, 0.16), transparent 28%);
  opacity: 0.95;
}

.halo-card::after {
  content: '';
  position: absolute;
  inset: auto 12px 12px auto;
  width: 110px;
  height: 110px;
  border-radius: 50%;
  border: 1px solid rgba(166, 196, 255, 0.14);
  opacity: 0.5;
}

.halo-card__glow,
.halo-card__halo,
.halo-card__beam,
.halo-card__ring,
.halo-card__caption {
  position: relative;
  z-index: 1;
}

.halo-card__glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(10px);
}

.halo-card__glow--blue {
  inset: 18% auto auto 18%;
  width: 8rem;
  height: 8rem;
  background: radial-gradient(circle, rgba(89, 176, 255, 0.36), transparent 68%);
}

.halo-card__glow--violet {
  inset: auto 18% 12% auto;
  width: 10rem;
  height: 10rem;
  background: radial-gradient(circle, rgba(118, 92, 255, 0.24), transparent 70%);
}

.halo-card__halo {
  position: absolute;
  inset: 24% auto auto 50%;
  width: 184px;
  height: 184px;
  transform: translateX(-50%);
  border-radius: 50%;
  background:
    radial-gradient(circle, rgba(255, 255, 255, 0.96) 0%, rgba(136, 204, 255, 0.72) 18%, rgba(94, 113, 255, 0.2) 50%, transparent 72%);
  box-shadow:
    0 0 40px rgba(104, 171, 255, 0.38),
    0 0 110px rgba(108, 92, 255, 0.18);
}

.halo-card__beam {
  position: absolute;
  inset: 10px 50% 10px calc(50% - 1px);
  width: 2px;
  background: linear-gradient(180deg, transparent, rgba(176, 233, 255, 0.96), rgba(118, 92, 255, 0.2), transparent);
  box-shadow: 0 0 30px rgba(120, 181, 255, 0.38);
}

.halo-card__ring {
  position: absolute;
  border-radius: 50%;
  border: 1px solid rgba(166, 196, 255, 0.16);
  opacity: 0.52;
}

.halo-card__ring--outer {
  inset: auto 10px 16px auto;
  width: 150px;
  height: 150px;
}

.halo-card__ring--inner {
  inset: 26% 16px auto auto;
  width: 92px;
  height: 92px;
  opacity: 0.32;
}

.halo-card__caption {
  max-width: 17rem;
  margin-top: 86px;
}

.halo-card__caption span {
  display: block;
  margin-bottom: 10px;
  color: var(--aion-accent-2);
  font-size: 0.7rem;
  letter-spacing: 0.24em;
  text-transform: uppercase;
}

.halo-card__caption strong {
  display: block;
  font-family: "Iowan Old Style", "Palatino Linotype", Georgia, serif;
  font-size: 1.2rem;
  line-height: 1.4;
  font-weight: 600;
}

.halo-card__caption p {
  margin: 10px 0 0;
  color: var(--aion-muted);
  line-height: 1.55;
  font-size: 0.92rem;
}

.request-state {
  margin-top: 18px;
  padding: 16px;
  border-radius: 20px;
  border: 1px solid rgba(112, 144, 255, 0.12);
  background: rgba(255, 255, 255, 0.02);
}

.request-state-empty {
  margin-top: 18px;
}

.request-title {
  margin: 0;
  color: var(--aion-accent-2);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

.request-copy {
  margin: 10px 0 0;
  color: var(--aion-muted);
  line-height: 1.65;
}

.request-button {
  width: 100%;
  margin-top: 16px;
}

.loading-state,
.pending-card,
.status-card {
  margin: 16px 0 18px;
  padding: 16px;
  border-radius: 16px;
  border: 1px solid rgba(112, 144, 255, 0.14);
  background: rgba(255, 255, 255, 0.02);
  color: var(--aion-muted);
  line-height: 1.6;
}

.pending-card strong,
.status-card strong {
  display: block;
  margin-bottom: 8px;
  color: var(--aion-text);
}

.beta-form {
  display: grid;
  gap: 14px;
  margin-top: 16px;
}

.field {
  display: grid;
  gap: 8px;
  margin: 0;
  border: 0;
  padding: 0;
  min-width: 0;
}

.field > span,
.field legend {
  color: var(--aion-text);
  font-size: 0.88rem;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.field input,
.field textarea {
  width: 100%;
  border: 1px solid rgba(112, 144, 255, 0.16);
  border-radius: 16px;
  background: rgba(4, 7, 16, 0.96);
  color: var(--aion-text);
  padding: 12px 14px;
  outline: none;
  resize: vertical;
}

.field input:focus,
.field textarea:focus {
  border-color: rgba(118, 92, 255, 0.88);
  box-shadow: 0 0 0 3px rgba(118, 92, 255, 0.12);
}

.checkbox-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 12px;
}

.check-option {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--aion-muted);
  font-size: 0.88rem;
}

.check-option input {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--aion-accent-2);
}

.form-error {
  margin: 0;
  color: #ffb6b6;
  line-height: 1.5;
}

.sign-out {
  width: 100%;
  margin-top: 10px;
}

.panel-copy {
  margin: 12px 0 0;
  color: var(--aion-muted);
  line-height: 1.6;
}

.facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 18px;
}

.facts article {
  min-height: 0;
  padding: 18px 4px 20px 0;
  border-top: 1px solid rgba(112, 144, 255, 0.15);
  background: transparent;
  position: relative;
}

.facts article::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent 60%),
    radial-gradient(circle at top right, rgba(102, 160, 255, 0.09), transparent 56%);
  pointer-events: none;
}

.fact-index {
  position: relative;
  z-index: 1;
  margin: 0 0 10px;
  color: rgba(166, 181, 208, 0.8);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.22em;
}

.facts h3 {
  position: relative;
  z-index: 1;
  margin: 0;
  color: var(--aion-text);
  text-transform: none;
  letter-spacing: -0.03em;
  font-size: 1.02rem;
}

.facts p:not(.fact-index) {
  position: relative;
  z-index: 1;
  margin: 10px 0 0;
  color: var(--aion-muted);
  line-height: 1.7;
  max-width: 22ch;
}

.final-cta {
  display: grid;
  justify-items: center;
  gap: 14px;
  margin-top: 28px;
  padding: 30px 20px 28px;
  border-radius: 28px;
  border: 1px solid rgba(112, 144, 255, 0.14);
  background:
    linear-gradient(135deg, rgba(18, 24, 42, 0.94), rgba(7, 10, 18, 0.96)),
    radial-gradient(circle at top, rgba(94, 106, 255, 0.14), transparent 44%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 24px 70px rgba(0, 0, 0, 0.28);
  text-align: center;
}

.final-cta p {
  max-width: 48ch;
  margin: 0;
  color: var(--aion-muted);
  line-height: 1.65;
}

.final-cta h2 {
  max-width: 14ch;
}

.final-cta .button {
  margin-top: 8px;
}

.error {
  margin: 18px 0 0;
  color: #ffbbbb;
}

code {
  color: #d7f7ff;
}

@media (max-width: 1080px) {
  .hero,
  .facts {
    grid-template-columns: 1fr;
  }

  .hero {
    min-height: 0;
  }

  .final-cta {
    justify-items: start;
    text-align: left;
  }
}

@media (max-width: 820px) {
  .shell {
    width: min(100% - 16px, 1180px);
    padding: 18px;
    border-radius: 24px;
  }

  .header {
    align-items: flex-start;
    flex-direction: column;
  }

  .header-meta {
    width: 100%;
    flex-wrap: wrap;
  }

  .beta-pill {
    width: 100%;
    text-align: center;
  }

  .hero {
    gap: 22px;
  }

  h1 {
    max-width: none;
  }

  .actions {
    align-items: stretch;
  }

  .actions .button,
  .final-cta .button {
    width: 100%;
  }

  .halo-card {
    min-height: 200px;
  }

  .halo-card__caption {
    max-width: 14rem;
  }

  .checkbox-grid {
    grid-template-columns: 1fr;
  }

  .request-state {
    padding: 14px;
  }

  .facts article {
    min-height: 0;
  }

  .final-cta {
    padding: 22px 18px;
  }
}

@media (max-width: 520px) {
  .landing {
    padding: 14px 0 28px;
  }

  .shell {
    width: min(100% - 12px, 1180px);
    padding: 14px;
  }

  .brand-mark {
    width: 40px;
    height: 40px;
  }

  h1 {
    font-size: clamp(2.45rem, 13vw, 3.25rem);
  }

  .lede {
    font-size: 1rem;
  }

  .halo-card {
    min-height: 160px;
    padding: 18px;
  }

  .halo-card__halo {
    width: 146px;
    height: 146px;
  }

  .halo-card__caption {
    margin-top: 74px;
  }

  .request-button,
  .button {
    min-height: 48px;
  }
}
*/
</style>

<style scoped>
.landing {
  --ink: #050913;
  --text: #eff5ff;
  --muted: #9aa9c1;
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  background:
    radial-gradient(ellipse 70% 48% at 88% 23%, rgba(98, 80, 197, 0.17), transparent 70%),
    radial-gradient(ellipse 55% 38% at 13% 13%, rgba(38, 159, 219, 0.12), transparent 70%),
    var(--ink);
  color: var(--text);
}

.content-width { width: min(1200px, calc(100% - 48px)); margin-inline: auto; }

.atmosphere { position: absolute; width: 38rem; height: 38rem; border-radius: 50%; pointer-events: none; filter: blur(34px); opacity: 0.55; }
.atmosphere-cyan { top: 8rem; left: -24rem; background: radial-gradient(circle, rgba(52, 200, 255, 0.3), transparent 68%); }
.atmosphere-violet { top: 5rem; right: -20rem; background: radial-gradient(circle, rgba(128, 91, 255, 0.31), transparent 68%); }

.site-header { position: relative; z-index: 2; display: flex; align-items: center; justify-content: space-between; padding-block: 30px; }
.brand { display: inline-flex; align-items: center; gap: 10px; color: #ddecff; text-decoration: none; }
.brand-mark { width: 38px; height: 38px; filter: drop-shadow(0 0 11px rgba(75, 195, 255, 0.6)); }
.brand-name { display: grid; font-family: Georgia, serif; font-size: 0.92rem; letter-spacing: 0.13em; line-height: 0.9; }
.brand-name small { margin-top: 4px; font-family: inherit; font-size: 0.52em; letter-spacing: 0.52em; text-align: center; }
.private-beta, .eyebrow, .value-number { color: #6bd5ff; font-size: 0.7rem; font-weight: 800; letter-spacing: 0.22em; text-transform: uppercase; }
.private-beta { color: #c3cce0; font-size: 0.66rem; }

.hero { position: relative; z-index: 1; display: grid; grid-template-columns: minmax(0, 0.95fr) minmax(440px, 1.05fr); align-items: center; min-height: 650px; padding-block: 46px 56px; }
.hero-copy { position: relative; z-index: 2; padding-bottom: 12px; }
.eyebrow { margin: 0 0 18px; }
h1, h2, p { margin-top: 0; }
h1, h2 { font-family: Georgia, "Times New Roman", serif; font-weight: 500; }
h1 { max-width: 11ch; margin-bottom: 24px; font-size: clamp(4rem, 5.6vw, 5.45rem); letter-spacing: -0.055em; line-height: 0.96; }
.lede { max-width: 34rem; margin-bottom: 0; color: var(--muted); font-size: 1.02rem; line-height: 1.72; }
.hero-action { display: grid; justify-items: start; gap: 13px; margin-top: 30px; }
.hero-action p { margin-bottom: 0; color: #8291aa; font-size: 0.8rem; }
.button { display: inline-flex; align-items: center; justify-content: center; min-height: 50px; border: 0; border-radius: 8px; padding: 0 19px; cursor: pointer; font: inherit; font-size: 0.9rem; font-weight: 750; text-decoration: none; transition: transform 160ms ease, box-shadow 160ms ease; }
.button:hover:not(:disabled) { transform: translateY(-2px); }
.button:disabled { cursor: wait; opacity: 0.65; }
.primary { color: #f8fbff; background: linear-gradient(105deg, #287cef, #5b5aff); box-shadow: 0 13px 30px rgba(48, 86, 255, 0.35), inset 0 1px rgba(255, 255, 255, 0.26); }

.hero-visual { position: relative; min-height: 570px; overflow: visible; }
.visual-starfield, .visual-horizon { position: absolute; inset: 0; pointer-events: none; }
.visual-starfield { background: radial-gradient(circle at 15% 30%, rgba(203, 239, 255, 0.8) 0 1px, transparent 1.5px), radial-gradient(circle at 64% 13%, rgba(203, 239, 255, 0.55) 0 1px, transparent 1.5px), radial-gradient(circle at 88% 57%, rgba(203, 239, 255, 0.6) 0 1px, transparent 1.5px), radial-gradient(circle at 29% 74%, rgba(203, 239, 255, 0.5) 0 1px, transparent 1.5px), radial-gradient(ellipse at center, rgba(66, 118, 255, 0.14), transparent 63%); }
.visual-horizon { top: auto; bottom: 20px; height: 33%; background: radial-gradient(ellipse at 50% 100%, rgba(72, 166, 255, 0.27), transparent 63%); filter: blur(12px); }
.aion-sigil { position: absolute; top: 50%; left: 53%; width: min(100%, 500px); height: auto; transform: translate(-50%, -49%); overflow: visible; }
.sigil-shadow { fill: rgba(80, 130, 255, 0.06); filter: url(#sigil-glow); }
.sigil-line { stroke: url(#sigil-stroke); stroke-width: 3; filter: url(#sigil-glow); }
.sigil-inner { stroke-width: 1.8; opacity: 0.82; }
.sigil-cross { stroke-width: 1.5; opacity: 0.66; }
.sigil-wing { fill: url(#sigil-stroke); opacity: 0.18; filter: url(#sigil-glow); }
.sigil-star { fill: #effbff; filter: url(#sigil-glow); }
.memory-rift { position: absolute; inset: 5% 5% 2%; overflow: hidden; }
.rift-core { position: absolute; inset: 8% 48% 10%; width: 4px; border-radius: 999px; background: linear-gradient(180deg, transparent, #d6fbff 25%, #5bd8ff 50%, #705fff 76%, transparent); box-shadow: 0 0 18px #64d8ff, 0 0 80px rgba(85, 170, 255, 0.6); }
.rift-arc { position: absolute; border: 1px solid rgba(130, 204, 255, 0.38); border-radius: 50%; filter: drop-shadow(0 0 15px rgba(86, 177, 255, 0.24)); }
.rift-arc-one { width: 420px; height: 150px; top: 31%; left: 7%; transform: rotate(-19deg); border-right-color: transparent; }
.rift-arc-two { width: 370px; height: 128px; top: 49%; right: 1%; transform: rotate(26deg); border-left-color: transparent; border-color: rgba(131, 106, 255, 0.38); }
.rift-trace { position: absolute; height: 1px; background: linear-gradient(90deg, transparent, rgba(141, 220, 255, 0.84), transparent); transform-origin: left center; }
.rift-trace-one { width: 290px; top: 34%; left: 19%; transform: rotate(26deg); }
.rift-trace-two { width: 240px; top: 65%; left: 43%; transform: rotate(-27deg); }
.rift-particle { position: absolute; width: 5px; height: 5px; border-radius: 50%; background: #e7fcff; box-shadow: 0 0 15px 4px rgba(96, 212, 255, 0.62); }
.rift-particle-one { top: 24%; left: 31%; }.rift-particle-two { top: 69%; right: 23%; background: #9da5ff; }.rift-particle-three { top: 48%; right: 10%; width: 3px; height: 3px; }

.values { position: relative; z-index: 1; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-top: 1px solid rgba(159, 192, 245, 0.18); border-bottom: 1px solid rgba(159, 192, 245, 0.12); }
.values article { min-height: 172px; padding: 29px 34px 25px 0; }
.values article + article { padding-left: 34px; border-left: 1px solid rgba(159, 192, 245, 0.16); }
.value-number { margin-bottom: 18px; color: #7488a5; }
.values h2 { margin-bottom: 10px; font-family: inherit; font-size: 1rem; font-weight: 700; letter-spacing: 0.01em; }
.values article > p:last-child { max-width: 25rem; margin-bottom: 0; color: var(--muted); font-size: 0.91rem; line-height: 1.55; }

.beta-flow { position: relative; z-index: 1; padding-block: 96px 22px; }
.compact-state { max-width: 560px; margin-inline: auto; border-left: 1px solid #63c9ff; padding: 2px 0 2px 20px; color: var(--muted); line-height: 1.55; }
.compact-state strong { display: block; color: var(--text); font-weight: 700; }
.compact-state p { margin: 5px 0 0; }
.request-section { display: grid; grid-template-columns: minmax(220px, 0.7fr) minmax(0, 1fr); gap: clamp(42px, 8vw, 110px); align-items: start; max-width: 920px; margin-inline: auto; padding: 40px; border: 1px solid rgba(130, 166, 225, 0.19); background: rgba(9, 15, 30, 0.52); }
.request-intro h2 { margin-bottom: 14px; font-size: clamp(2rem, 3vw, 2.8rem); letter-spacing: -0.045em; line-height: 1.02; }
.request-intro > p:last-child { color: var(--muted); line-height: 1.6; }
.beta-form { display: grid; gap: 17px; }
.field { display: grid; gap: 7px; min-width: 0; margin: 0; border: 0; padding: 0; }
.field > span, .field legend { color: #d7e2f4; font-size: 0.82rem; font-weight: 700; }
.field input, .field textarea { width: 100%; border: 1px solid rgba(148, 178, 229, 0.22); border-radius: 3px; padding: 11px 12px; outline: none; resize: vertical; background: rgba(3, 8, 18, 0.7); color: var(--text); font: inherit; }
.field input:focus, .field textarea:focus { border-color: #5fc8ff; box-shadow: 0 0 0 3px rgba(95, 200, 255, 0.12); }
.checkbox-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.check-option { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 0.84rem; }
.check-option input { width: auto; accent-color: #5aa9ff; }
.form-error, .error { color: #ffb4b4; }
.form-error { margin: 0; font-size: 0.88rem; }
.sign-out { display: block; margin: 20px auto 0; border: 0; padding: 4px; cursor: pointer; background: transparent; color: #8190a8; font: inherit; font-size: 0.78rem; text-decoration: underline; text-underline-offset: 3px; }
.error { position: relative; z-index: 1; margin-top: 20px; }
.site-footer { position: relative; z-index: 1; display: grid; grid-template-columns: 1fr auto; gap: 16px; margin-top: 110px; padding-block: 25px 30px; border-top: 1px solid rgba(159, 192, 245, 0.14); color: #6d7c94; font-size: 0.69rem; letter-spacing: 0.1em; text-transform: uppercase; }
.legal-notice { grid-column: 1 / -1; max-width: 680px; margin: 9px 0 0; color: #71809a; font-size: 0.66rem; letter-spacing: 0.03em; line-height: 1.55; text-transform: none; }

@media (max-width: 760px) {
  .content-width { width: min(100% - 40px, 520px); }
  .site-header { padding-block: 22px; }
  .hero { display: flex; flex-direction: column; align-items: stretch; min-height: 0; padding-block: 52px 50px; }
  h1 { max-width: 9ch; font-size: clamp(3.35rem, 15vw, 4.45rem); }
  .lede br { display: none; }
  .hero-visual { order: 2; min-height: 370px; margin-top: 12px; }
  .memory-rift { inset: 4% -7% 0; }
  .rift-arc-one { left: -9%; }.rift-arc-two { right: -15%; }
  .values { display: block; border-bottom: 0; }
  .values article { min-height: 0; padding: 23px 0; }
  .values article + article { border-left: 0; border-top: 1px solid rgba(159, 192, 245, 0.14); padding-left: 0; }
  .value-number { margin-bottom: 12px; }
  .beta-flow { padding-top: 58px; }
  .request-section { display: block; padding: 28px 22px; }
  .request-intro { margin-bottom: 32px; }
  .checkbox-grid { grid-template-columns: 1fr; }
  .site-footer { margin-top: 76px; font-size: 0.62rem; }
  .legal-notice { font-size: 0.62rem; }
}

@media (max-width: 390px) {
  .content-width { width: min(100% - 32px, 520px); }
  .private-beta { font-size: 0.58rem; }
  h1 { font-size: 3.2rem; }
  .button { width: 100%; }
  .hero-visual { min-height: 330px; }
  .site-footer { grid-template-columns: 1fr; }
}
</style>
