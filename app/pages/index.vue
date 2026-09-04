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
    <section class="surface">
      <header class="header">
        <div class="brand">
          <span class="brand-mark">A</span>
          <div>
            <p>AION Context MCP</p>
            <span>Private Beta</span>
          </div>
        </div>
        <p class="header-note">Discord identity only</p>
      </header>

      <div class="hero">
        <div class="copy">
          <p class="eyebrow">PUBLIC</p>
          <h1>Connect an AI client to persistent AION context.</h1>
          <p class="lede">
            Access is manual and limited. Discord is used to identify beta applicants.
          </p>

          <div class="actions">
            <a class="button primary" :href="betaStartUrl">Request access with Discord</a>
          </div>

          <p class="smallprint">
            No public signup. Access is not guaranteed.
          </p>
        </div>

        <aside class="panel" aria-label="Beta access status">
          <div class="panel-top">
            <span>Status</span>
            <span class="dot" :class="{ active: session.authenticated && !accessLoading }" />
          </div>

          <div class="panel-body">
            <template v-if="!session.authenticated">
              <p class="label">Current state</p>
              <h2>Awaiting Discord identity</h2>
              <p class="panel-copy">
                Start the Discord OAuth flow to register your identity server-side.
              </p>
            </template>

            <template v-else>
              <p class="label">Private beta access</p>
              <h2 v-if="accessLoading">Loading access state…</h2>
              <h2 v-else-if="requestStatus === 'PENDING'">Request pending</h2>
              <h2 v-else-if="requestStatus === 'APPROVED'">Access approved</h2>
              <h2 v-else-if="requestStatus === 'REJECTED'">Access request not approved</h2>
              <h2 v-else-if="requestStatus === 'REVOKED'">Access revoked</h2>
              <h2 v-else>Request private beta access</h2>

              <p class="panel-copy">
                <span v-if="accessLoading">Checking your private beta access state.</span>
                <span v-else-if="requestStatus === 'PENDING'">
                  Request received. Your private beta request is pending review.
                </span>
                <span v-else-if="requestStatus === 'APPROVED'">
                  Your account has been approved for the private beta. The private workspace will
                  be available here.
                </span>
                <span v-else-if="requestStatus === 'REJECTED'">
                  Your current request was not approved.
                </span>
                <span v-else-if="requestStatus === 'REVOKED'">
                  Your access to the private beta is no longer active.
                </span>
                <span v-else>
                  Tell us briefly how you plan to use AION MCP. Access is reviewed manually.
                  Submitting a request does not guarantee access, and no review delay is
                  promised.
                </span>
              </p>

              <dl class="identity">
                <div>
                  <dt>Discord user</dt>
                  <dd>{{ session.identity?.displayName }}</dd>
                </div>
                <div>
                  <dt>Discord id</dt>
                  <dd><code>{{ session.identity?.discordUserId }}</code></dd>
                </div>
              </dl>

              <div v-if="accessLoading" class="loading-state" aria-live="polite">
                Loading private beta status…
              </div>

              <div v-else-if="requestStatus === 'PENDING'" class="status-card">
                <strong>Request pending</strong>
                <p>Your access request is currently under review.</p>
                <p>Access is manually reviewed. No response time is guaranteed.</p>
              </div>

              <div v-else-if="requestStatus === 'APPROVED'" class="status-card">
                <strong>Access approved</strong>
                <p>Your account has been approved for the private beta.</p>
                <p>The private workspace will be available here.</p>
              </div>

              <div v-else-if="requestStatus === 'REJECTED'" class="status-card">
                <strong>Access request not approved</strong>
                <p>Your current request was not approved.</p>
              </div>

              <div v-else-if="requestStatus === 'REVOKED'" class="status-card">
                <strong>Access revoked</strong>
                <p>Your access to the private beta is no longer active.</p>
              </div>

              <div v-else-if="accessError" class="loading-state" role="alert">
                {{ accessError }}
              </div>

              <form v-else class="beta-form" @submit.prevent="submitRequest">
                <label class="field">
                  <span>Display name</span>
                  <input
                    v-model="requestForm.displayName"
                    type="text"
                    required
                    maxlength="120"
                    autocomplete="nickname"
                  />
                </label>

                <label class="field">
                  <span>Why do you want to join?</span>
                  <textarea
                    v-model="requestForm.motivation"
                    required
                    rows="4"
                    maxlength="2000"
                    placeholder="Tell us briefly why you want access."
                  />
                </label>

                <label class="field">
                  <span>How do you plan to use AION MCP?</span>
                  <textarea
                    v-model="requestForm.intendedUsage"
                    required
                    rows="4"
                    maxlength="2000"
                    placeholder="Describe your intended usage."
                  />
                </label>

                <label class="field">
                  <span>AION profile / experience</span>
                  <textarea
                    v-model="requestForm.aionProfile"
                    rows="3"
                    maxlength="2000"
                    placeholder="Optional"
                  />
                </label>

                <fieldset class="field">
                  <legend>Expected MCP clients</legend>
                  <div class="checkbox-grid">
                    <label v-for="option in expectedClientOptions" :key="option" class="check-option">
                      <input
                        v-model="requestForm.expectedClients"
                        type="checkbox"
                        :value="option"
                      />
                      <span>{{ option }}</span>
                    </label>
                  </div>
                </fieldset>

                <p v-if="requestError" class="form-error" role="alert">{{ requestError }}</p>

                <button
                  type="submit"
                  class="button primary"
                  :disabled="requestBusy || accessLoading"
                >
                  {{ requestBusy ? 'Submitting…' : 'Submit request' }}
                </button>
              </form>
            </template>

            <button
              v-if="session.authenticated"
              type="button"
              class="button danger sign-out"
              :disabled="loading"
              @click="signOut"
            >
              {{ loading ? 'Signing out…' : 'Sign out' }}
            </button>
          </div>
        </aside>
      </div>

      <section class="facts" aria-label="Technical summary">
        <article>
          <h3>Persistent context</h3>
          <p>Research survives individual AI sessions.</p>
        </article>
        <article>
          <h3>Source aware</h3>
          <p>Stored knowledge keeps provenance and applicability.</p>
        </article>
        <article>
          <h3>AI client agnostic</h3>
          <p>Designed for approved AI clients.</p>
        </article>
      </section>

      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </section>
  </main>
</template>

<style scoped>
.landing {
  min-height: 100vh;
  padding: 32px 0 48px;
}

.surface {
  width: min(1100px, calc(100% - 32px));
  margin: 0 auto;
  padding: 28px;
  border: 1px solid rgba(81, 176, 255, 0.18);
  border-radius: 28px;
  background:
    linear-gradient(180deg, rgba(9, 14, 28, 0.94), rgba(6, 10, 20, 0.96)),
    radial-gradient(circle at top, rgba(56, 166, 255, 0.14), transparent 38%);
  box-shadow: 0 28px 90px rgba(0, 0, 0, 0.42);
  backdrop-filter: blur(16px);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 28px;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 12px;
}

.brand p,
.brand span,
.eyebrow,
.panel-top,
.header-note,
.label,
.smallprint {
  margin: 0;
}

.brand p {
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.brand span {
  color: var(--aion-muted);
  font-size: 0.82rem;
}

.brand-mark {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 11px;
  color: #05101d;
  background: linear-gradient(135deg, var(--aion-accent), var(--aion-accent-2));
  font-weight: 900;
}

.header-note {
  color: var(--aion-muted);
  font-size: 0.82rem;
}

.hero {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(300px, 0.95fr);
  gap: 28px;
  align-items: stretch;
}

.eyebrow {
  color: var(--aion-accent-2);
  font-size: 0.72rem;
  letter-spacing: 0.22em;
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
  max-width: 16ch;
  font-size: clamp(2.8rem, 5vw, 5rem);
  letter-spacing: -0.05em;
}

h2 {
  font-size: clamp(1.4rem, 2vw, 2rem);
  letter-spacing: -0.03em;
}

h3 {
  font-size: 0.95rem;
  text-transform: uppercase;
  letter-spacing: 0.11em;
  color: var(--aion-accent-2);
}

.copy {
  padding: 12px 0;
}

.lede {
  max-width: 60ch;
  margin: 18px 0 0;
  color: var(--aion-muted);
  font-size: 1.04rem;
  line-height: 1.7;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 28px;
}

.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 46px;
  padding: 0 18px;
  border-radius: 14px;
  border: 1px solid transparent;
  text-decoration: none;
  font-weight: 700;
  font-size: 0.92rem;
  transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}

.button:hover {
  transform: translateY(-1px);
}

.primary {
  color: #06111f;
  background: linear-gradient(135deg, var(--aion-accent), var(--aion-accent-2));
}

.ghost {
  color: var(--aion-text);
  border-color: rgba(81, 176, 255, 0.22);
  background: rgba(255, 255, 255, 0.02);
}

.danger {
  margin-top: 20px;
  color: #ffd7d7;
  border-color: rgba(255, 110, 110, 0.28);
  background: rgba(255, 110, 110, 0.08);
}

.smallprint {
  margin-top: 16px;
  color: var(--aion-muted);
  font-size: 0.86rem;
  line-height: 1.5;
}

.panel {
  border-radius: 22px;
  border: 1px solid rgba(81, 176, 255, 0.14);
  background: rgba(6, 10, 20, 0.72);
  overflow: hidden;
}

.panel-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  border-bottom: 1px solid rgba(81, 176, 255, 0.12);
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
  padding: 24px 18px 18px;
}

.loading-state,
.pending-card,
.status-card {
  margin: 16px 0 18px;
  padding: 16px;
  border-radius: 16px;
  border: 1px solid rgba(81, 176, 255, 0.15);
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
  margin-top: 18px;
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
  border: 1px solid rgba(81, 176, 255, 0.18);
  border-radius: 14px;
  background: rgba(4, 7, 16, 0.96);
  color: var(--aion-text);
  padding: 12px 14px;
  outline: none;
  resize: vertical;
}

.field input:focus,
.field textarea:focus {
  border-color: rgba(82, 239, 217, 0.8);
  box-shadow: 0 0 0 3px rgba(82, 239, 217, 0.12);
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

.label {
  color: var(--aion-accent-2);
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  font-weight: 800;
}

.panel-copy {
  margin: 12px 0 0;
  color: var(--aion-muted);
  line-height: 1.6;
}

.identity {
  display: grid;
  gap: 14px;
  margin: 18px 0 0;
}

.identity dt {
  color: var(--aion-muted);
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  margin-bottom: 6px;
}

.identity dd {
  margin: 0;
  color: var(--aion-text);
  word-break: break-word;
}

.facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-top: 22px;
}

.facts article {
  min-height: 118px;
  padding: 18px;
  border-radius: 18px;
  border: 1px solid rgba(81, 176, 255, 0.12);
  background: rgba(255, 255, 255, 0.02);
}

.facts p {
  margin: 12px 0 0;
  color: var(--aion-muted);
  line-height: 1.55;
}

.error {
  margin: 18px 0 0;
  color: #ffbbbb;
}

code {
  color: #d7f7ff;
}

@media (max-width: 900px) {
  .surface {
    width: min(100% - 20px, 1100px);
    padding: 20px;
    border-radius: 22px;
  }

  .hero,
  .facts {
    grid-template-columns: 1fr;
  }

  .header {
    align-items: flex-start;
    flex-direction: column;
  }

  h1 {
    max-width: none;
  }

  .checkbox-grid {
    grid-template-columns: 1fr;
  }
}
</style>
