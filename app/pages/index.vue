<script setup lang="ts">
interface BetaSession {
  authenticated: boolean
  identity?: {
    id: string
    discordUserId: string
    displayName: string
  }
}

const requestUrl = useRequestURL()
const session = ref<BetaSession>({ authenticated: false })
const loading = ref(false)
const error = ref('')

const mcpEndpoint = computed(() => `${requestUrl.origin}/mcp`)
const betaStartUrl = '/api/beta/discord/start'

async function refreshSession() {
  try {
    session.value = await $fetch<BetaSession>('/api/beta/session')
  } catch {
    session.value = { authenticated: false }
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
  } catch {
    error.value = 'Sign-out failed.'
  } finally {
    loading.value = false
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
            Access is manual and limited. Discord is used to identify beta applicants, not to
            authenticate the MCP protocol.
          </p>

          <div class="actions">
            <a class="button primary" :href="betaStartUrl">Request Beta Access with Discord</a>
            <a class="button ghost" :href="mcpEndpoint">MCP endpoint</a>
          </div>

          <p class="smallprint">
            No password. No public signup. Access is not guaranteed.
          </p>
        </div>

        <aside class="panel" aria-label="Beta access status">
          <div class="panel-top">
            <span>Status</span>
            <span class="dot" :class="{ active: session.authenticated }" />
          </div>

          <div class="panel-body">
            <p class="label">Current state</p>
            <h2>{{ session.authenticated ? 'Discord identity linked' : 'Awaiting Discord identity' }}</h2>
            <p class="panel-copy">
              {{ session.authenticated
                ? `Signed in as ${session.identity?.displayName}.`
                : 'Start the Discord OAuth flow to register your identity server-side.' }}
            </p>

            <dl v-if="session.authenticated" class="identity">
              <div>
                <dt>Discord user</dt>
                <dd>{{ session.identity?.displayName }}</dd>
              </div>
              <div>
                <dt>Discord id</dt>
                <dd><code>{{ session.identity?.discordUserId }}</code></dd>
              </div>
            </dl>

            <button
              v-if="session.authenticated"
              type="button"
              class="button danger"
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
          <h3>Protocol</h3>
          <p>Remote HTTP MCP on <code>/mcp</code>.</p>
        </article>
        <article>
          <h3>Identity</h3>
          <p>Discord OAuth is only used for human identification.</p>
        </article>
        <article>
          <h3>Access</h3>
          <p>Manual review before any private portal or token issuance.</p>
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
  margin: 22px 0 0;
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
}
</style>
