<script setup lang="ts">
const config = useRuntimeConfig()

const origin = ref('https://aion-mcp.labsio.app')
const password = ref('')
const authenticated = ref(false)
const busy = ref(false)
const copied = ref('')
const error = ref('')

const endpoint = computed(() => `${origin.value}/mcp`)
const releaseTag = computed(() => config.public.releaseTag || 'v0.1.0')
const connectionConfig = computed(() =>
  JSON.stringify({ mcpServers: { 'aion-context': { url: endpoint.value } } }, null, 2)
)

async function refreshSession() {
  try {
    const session = await $fetch<{ authenticated: boolean }>('/oauth/session')
    authenticated.value = session.authenticated
  } catch {
    authenticated.value = false
  }
}

async function login() {
  if (!password.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const session = await $fetch<{ authenticated: boolean }>('/oauth/session', {
      method: 'POST',
      body: { password: password.value }
    })
    authenticated.value = session.authenticated
    password.value = ''
  } catch (cause: any) {
    error.value = cause?.data?.error === 'invalid_credentials'
      ? 'Incorrect password.'
      : 'Sign-in is unavailable. Please try again.'
  } finally {
    busy.value = false
  }
}

async function logout() {
  busy.value = true
  error.value = ''
  try {
    await $fetch('/oauth/session', { method: 'DELETE' })
    authenticated.value = false
  } catch {
    error.value = 'Sign-out failed.'
  } finally {
    busy.value = false
  }
}

async function copy(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value)
    copied.value = label
    window.setTimeout(() => {
      if (copied.value === label) copied.value = ''
    }, 1800)
  } catch {
    error.value = 'Could not copy automatically. Select the text manually.'
  }
}

onMounted(async () => {
  origin.value = window.location.origin
  await refreshSession()
})
</script>

<template>
  <main class="landing">
    <nav class="nav page-width" aria-label="Main navigation">
      <a class="brand" href="#top" aria-label="AION MCP home">
        <span class="brand-mark">A</span>
        <span>AION <em>MCP</em></span>
      </a>
      <div class="nav-links">
        <a href="#connect">Connect</a>
        <a href="#sign-in">Sign in</a>
        <a href="#capabilities">Capabilities</a>
      </div>
      <a class="nav-status" href="#sign-in">
        <span class="status-dot" :class="{ active: authenticated }" />
        {{ authenticated ? 'Session active' : 'Protected access' }}
      </a>
    </nav>

    <section id="top" class="hero page-width">
      <div class="hero-copy">
        <p class="eyebrow">AION 2 · SHARED CONTEXT</p>
        <h1>Context that stays explicit.</h1>
        <p class="lede">
          AION MCP gives compatible clients one clean endpoint to search sources, preserve
          evidence, and challenge claims without turning the model into a database.
        </p>
        <div class="hero-actions">
          <a class="button primary" href="#connect">Connect a client <span>→</span></a>
          <a class="button quiet" href="#sign-in">Open session</a>
        </div>
        <div class="trust-row">
          <span>OAuth 2.1 + PKCE</span>
          <span>Traceable sources</span>
          <span>Release {{ releaseTag }}</span>
        </div>
      </div>

      <aside class="hero-panel" aria-label="MCP endpoint preview">
        <div class="panel-top">
          <span class="terminal-dots"><i /><i /><i /></span>
          <span>AION REMOTE SERVER</span>
          <span class="panel-live">LIVE</span>
        </div>
        <div class="panel-body">
          <p class="panel-label">MCP SERVER URL</p>
          <div class="endpoint-value">
            <code>{{ endpoint }}</code>
            <button type="button" class="copy-button" @click="copy(endpoint, 'url')">
              {{ copied === 'url' ? 'Copied' : 'Copy' }}
            </button>
          </div>
          <div class="mini-list">
            <p><span>01</span> Source-backed answers</p>
            <p><span>02</span> OAuth session in this browser</p>
            <p><span>03</span> Release tag as source of truth</p>
          </div>
          <div class="code-box">
            <div class="code-header">
              <span>Generic configuration</span>
              <button type="button" @click="copy(connectionConfig, 'config')">
                {{ copied === 'config' ? 'Copied' : 'Copy' }}
              </button>
            </div>
            <pre>{{ connectionConfig }}</pre>
          </div>
        </div>
      </aside>
    </section>

    <section id="connect" class="section page-width">
      <div class="section-intro">
        <p class="eyebrow">HOW IT WORKS</p>
        <h2>Three steps, no ceremony.</h2>
      </div>
      <div class="steps-grid">
        <article class="step-card">
          <span class="step-number">01</span>
          <h3>Add the server</h3>
          <p>Paste the remote MCP URL into T3 Code, ChatGPT, or another compatible client.</p>
        </article>
        <article class="step-card">
          <span class="step-number">02</span>
          <h3>Approve access</h3>
          <p>OAuth opens here on first use. Sign in once, then approve the client request.</p>
        </article>
        <article class="step-card">
          <span class="step-number">03</span>
          <h3>Search first</h3>
          <p>Ask the client to call <code>aion_search_context</code> before answering.</p>
        </article>
      </div>
    </section>

    <section id="sign-in" class="section page-width auth-section">
      <div class="section-intro">
        <p class="eyebrow">BROWSER SESSION</p>
        <h2>{{ authenticated ? 'Session ready for approval.' : 'Sign in before approving a client.' }}</h2>
        <p>
          This session stays in the browser only and keeps the OAuth flow short when a client
          redirects back here.
        </p>
      </div>
      <form v-if="!authenticated" class="login-form" @submit.prevent="login">
        <label for="password">Access password</label>
        <div class="login-row">
          <input
            id="password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
            placeholder="Your OAuth password"
          />
          <button class="button primary" :disabled="busy" type="submit">
            {{ busy ? 'Signing in…' : 'Sign in' }}
          </button>
        </div>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      </form>
      <div v-else class="logged-in">
        <span class="check">✓</span>
        <div>
          <strong>Session active</strong>
          <p>Return to your client and approve its authorization request.</p>
        </div>
        <button type="button" class="text-button" :disabled="busy" @click="logout">Sign out</button>
      </div>
    </section>

    <section id="capabilities" class="section page-width">
      <div class="section-intro centered">
        <p class="eyebrow">WHAT THE AI CAN USE</p>
        <h2>Small surface, clear behavior.</h2>
        <p>The model reasons. AION MCP keeps retrieval, evidence, and contradictions explicit.</p>
      </div>
      <div class="features-grid">
        <article class="feature-card featured">
          <span class="feature-icon">⌕</span>
          <h3>Search context</h3>
          <code>aion_search_context</code>
          <p>Retrieves stored sources, knowledge, and open contradictions before an answer.</p>
        </article>
        <article class="feature-card">
          <span class="feature-icon">⌁</span>
          <h3>Preserve evidence</h3>
          <code>aion_record_source</code>
          <p>Records links, transcripts, and notes without claiming every source is definitive.</p>
        </article>
        <article class="feature-card">
          <span class="feature-icon">↯</span>
          <h3>Make doubt visible</h3>
          <code>aion_record_challenge</code>
          <p>Keeps contradictions and counter-evidence attached instead of erasing them.</p>
        </article>
      </div>
    </section>

    <footer class="footer page-width">
      <a class="brand" href="#top">
        <span class="brand-mark">A</span>
        <span>AION <em>MCP</em></span>
      </a>
      <span>Context infrastructure for AION 2 · {{ releaseTag }}</span>
      <a :href="`${endpoint.replace('/mcp', '')}/health`" target="_blank" rel="noreferrer">Server status</a>
    </footer>
  </main>
</template>

<style scoped>
.page-width {
  width: min(1120px, calc(100% - 48px));
  margin-inline: auto;
}

.landing {
  color: var(--aion-text);
}

.nav {
  min-height: 84px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.brand {
  color: var(--aion-text);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 0.92rem;
  letter-spacing: 0.13em;
  font-weight: 800;
}

.brand em {
  color: var(--aion-accent-2);
  font-style: normal;
}

.brand-mark {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  background: linear-gradient(135deg, var(--aion-accent), var(--aion-accent-2));
  color: #070716;
  clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%);
  font-family: Georgia, serif;
  font-size: 1rem;
}

.nav-links {
  display: flex;
  gap: 26px;
}

.nav-links a,
.nav-status {
  color: var(--aion-muted);
  text-decoration: none;
  font-size: 0.84rem;
}

.nav-links a:hover {
  color: var(--aion-text);
}

.nav-status {
  display: flex;
  gap: 8px;
  align-items: center;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--aion-accent);
  box-shadow: 0 0 0 4px rgba(142, 111, 255, 0.14);
}

.status-dot.active {
  background: #57d8ff;
  box-shadow: 0 0 0 4px rgba(87, 216, 255, 0.14);
}

.hero {
  display: grid;
  grid-template-columns: 1.05fr 0.95fr;
  gap: 72px;
  padding: 96px 0 104px;
  align-items: center;
}

.eyebrow {
  color: var(--aion-accent-2);
  font-size: 0.68rem;
  letter-spacing: 0.22em;
  font-weight: 800;
  margin: 0 0 18px;
}

h1,
h2,
h3,
p {
  margin-top: 0;
}

h1,
h2 {
  color: var(--aion-text);
  font-family: Georgia, 'Times New Roman', serif;
  font-weight: 400;
  letter-spacing: -0.045em;
}

h1 {
  max-width: 640px;
  margin-bottom: 24px;
  font-size: clamp(3.2rem, 6vw, 5.7rem);
  line-height: 0.93;
}

.lede {
  max-width: 620px;
  color: var(--aion-muted);
  font-size: 1.08rem;
  line-height: 1.72;
}

.hero-actions {
  display: flex;
  gap: 12px;
  margin: 34px 0 28px;
}

.button {
  border: 1px solid transparent;
  padding: 12px 17px;
  min-height: 45px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  font: inherit;
  font-weight: 700;
  font-size: 0.83rem;
  cursor: pointer;
  text-decoration: none;
  transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease;
}

.button:hover:not(:disabled) {
  transform: translateY(-2px);
}

.button:disabled {
  opacity: 0.65;
  cursor: wait;
}

.primary {
  background: linear-gradient(135deg, var(--aion-accent), var(--aion-accent-2));
  color: #090816;
  border-color: transparent;
}

.primary span {
  font-size: 1.1rem;
}

.quiet {
  color: var(--aion-text);
  border-color: rgba(181, 174, 225, 0.16);
  background: rgba(255, 255, 255, 0.02);
}

.trust-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  color: var(--aion-muted);
  font-size: 0.74rem;
}

.trust-row span {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.trust-row span::before {
  content: '•';
  color: var(--aion-accent-2);
}

.hero-panel {
  background: rgba(12, 13, 31, 0.84);
  border: 1px solid rgba(138, 108, 255, 0.22);
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(14px);
}

.panel-top {
  height: 47px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid rgba(138, 108, 255, 0.16);
  padding: 0 18px;
  color: var(--aion-muted);
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.11em;
}

.terminal-dots {
  display: flex;
  gap: 5px;
}

.terminal-dots i {
  width: 6px;
  height: 6px;
  border-radius: 100%;
  background: rgba(181, 174, 225, 0.32);
}

.terminal-dots i:first-child {
  background: var(--aion-accent-2);
}

.panel-live {
  margin-left: auto;
  color: #79f2c1;
  font-size: 0.58rem;
}

.panel-body {
  padding: 28px;
}

.panel-label {
  color: var(--aion-accent-2);
  font-size: 0.64rem;
  font-weight: 800;
  letter-spacing: 0.18em;
  margin-bottom: 10px;
}

.endpoint-value {
  display: flex;
  gap: 14px;
  align-items: center;
  justify-content: space-between;
  margin-top: 11px;
}

.endpoint-value code {
  color: var(--aion-text);
  font-size: clamp(0.8rem, 2vw, 1rem);
  overflow-wrap: anywhere;
}

.copy-button,
.code-header button {
  border: 1px solid rgba(181, 174, 225, 0.24);
  color: var(--aion-text);
  background: rgba(255, 255, 255, 0.02);
  cursor: pointer;
  font: inherit;
  padding: 7px 10px;
  font-size: 0.7rem;
  white-space: nowrap;
}

.mini-list {
  display: grid;
  gap: 12px;
  margin: 22px 0 18px;
}

.mini-list p {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  color: var(--aion-muted);
  font-size: 0.83rem;
}

.mini-list span {
  color: var(--aion-accent-2);
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.16em;
}

.code-box {
  border: 1px solid rgba(138, 108, 255, 0.14);
  background: rgba(255, 255, 255, 0.02);
  overflow: hidden;
}

.code-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 13px 16px;
  color: var(--aion-muted);
  font-size: 0.7rem;
  border-bottom: 1px solid rgba(138, 108, 255, 0.14);
}

.code-header button {
  padding: 4px 7px;
}

.code-box pre {
  padding: 16px;
  margin: 0;
  overflow-x: auto;
  color: #d9d2ff;
  font-size: 0.7rem;
  line-height: 1.55;
}

.section {
  padding: 34px 0 108px;
}

.section-intro h2 {
  font-size: clamp(2.4rem, 4vw, 4rem);
  line-height: 0.99;
  margin-bottom: 18px;
}

.section-intro > p:not(.eyebrow) {
  color: var(--aion-muted);
  line-height: 1.65;
  max-width: 520px;
}

.centered {
  text-align: center;
}

.centered > p:not(.eyebrow) {
  margin-inline: auto;
}

.steps-grid,
.features-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-top: 44px;
}

.step-card,
.feature-card,
.login-form,
.logged-in {
  border: 1px solid rgba(181, 174, 225, 0.14);
  background: rgba(255, 255, 255, 0.02);
}

.step-card {
  padding: 24px;
  min-height: 184px;
}

.step-number {
  color: var(--aion-accent-2);
  font-size: 0.66rem;
  letter-spacing: 0.16em;
  font-weight: 800;
}

.step-card h3,
.feature-card h3 {
  margin: 13px 0 8px;
  font-size: 1rem;
  color: var(--aion-text);
}

.step-card p,
.feature-card p {
  color: var(--aion-muted);
  font-size: 0.85rem;
  line-height: 1.6;
  margin-bottom: 0;
}

.step-card code {
  color: #99d6ff;
}

.auth-section {
  display: grid;
  grid-template-columns: 0.88fr 1.12fr;
  gap: 72px;
  align-items: center;
}

.login-form {
  padding: 28px;
}

.login-form label {
  display: block;
  color: var(--aion-text);
  font-size: 0.75rem;
  margin-bottom: 9px;
}

.login-row {
  display: flex;
  gap: 10px;
}

.login-row input {
  min-width: 0;
  flex: 1;
  border: 1px solid rgba(181, 174, 225, 0.18);
  background: rgba(7, 8, 22, 0.72);
  color: var(--aion-text);
  padding: 12px;
  font: inherit;
  outline: none;
}

.login-row input:focus {
  border-color: var(--aion-accent-2);
}

.form-error {
  color: #ffb7b7;
  font-size: 0.78rem;
  margin: 12px 0 0;
}

.logged-in {
  display: flex;
  gap: 15px;
  align-items: flex-start;
  padding: 26px;
}

.check {
  display: grid;
  place-items: center;
  width: 27px;
  height: 27px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--aion-accent-2);
  color: #08131b;
  font-weight: 800;
}

.logged-in strong {
  color: var(--aion-text);
}

.logged-in p {
  color: var(--aion-muted);
  font-size: 0.8rem;
  margin: 5px 0 0;
  line-height: 1.5;
}

.text-button {
  margin-left: auto;
  border: 0;
  color: var(--aion-accent-2);
  background: none;
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;
  white-space: nowrap;
}

.features-grid {
  margin-top: 52px;
}

.feature-card {
  min-height: 226px;
  padding: 28px;
}

.feature-card.featured {
  background:
    radial-gradient(circle at 0 0, rgba(87, 216, 255, 0.11), transparent 16rem),
    rgba(255, 255, 255, 0.03);
}

.feature-icon {
  display: block;
  color: var(--aion-accent-2);
  font-size: 1.45rem;
  min-height: 37px;
}

.feature-card code {
  color: #99d6ff;
  font-size: 0.7rem;
}

.feature-card p {
  margin-top: 17px;
}

.footer {
  min-height: 108px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  color: var(--aion-muted);
  font-size: 0.72rem;
}

.footer > a:last-child {
  color: var(--aion-accent-2);
  text-decoration: none;
}

@media (max-width: 820px) {
  .page-width {
    width: min(100% - 32px, 620px);
  }

  .nav {
    min-height: 70px;
  }

  .nav-links {
    display: none;
  }

  .hero,
  .auth-section {
    grid-template-columns: 1fr;
    gap: 42px;
  }

  .hero {
    padding: 68px 0 80px;
  }

  .hero-panel {
    max-width: 520px;
    width: calc(100% - 12px);
  }

  .steps-grid,
  .features-grid {
    grid-template-columns: 1fr;
  }

  .section {
    padding-bottom: 82px;
  }

  .footer {
    padding: 30px 0;
    min-height: 0;
    flex-wrap: wrap;
  }

  .endpoint-value {
    align-items: flex-start;
    flex-direction: column;
  }

  .login-row {
    flex-direction: column;
  }

  .login-row .button {
    width: 100%;
  }

  .text-button {
    margin-left: 0;
  }
}
</style>
