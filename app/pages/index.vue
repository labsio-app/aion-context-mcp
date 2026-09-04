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
  <main>
    <nav class="nav page-width" aria-label="Main navigation">
      <a class="brand" href="#top" aria-label="AION MCP home">
        <span class="brand-mark">A</span><span>AION <em>MCP</em></span>
      </a>
      <div class="nav-links">
        <a href="#connect">Connect</a><a href="#capabilities">Capabilities</a><a href="#security">Security</a>
      </div>
      <a class="nav-status" href="#sign-in">
        <span class="status-dot" :class="{ active: authenticated }" />
        {{ authenticated ? 'Signed in' : 'Protected access' }}
      </a>
    </nav>

    <section id="top" class="hero page-width">
      <div class="hero-copy">
        <p class="eyebrow">AION 2 · SHARED CONTEXT</p>
        <h1>Reliable memory for AION research.</h1>
        <p class="lede">
          AION MCP lets T3 Code, ChatGPT, and any compatible MCP client search, preserve, and
          challenge AION 2 context—without turning your AI into a database.
        </p>
        <div class="hero-actions">
          <a class="button primary" href="#connect">Connect a client <span>→</span></a>
          <a class="button quiet" href="#capabilities">Explore tools</a>
        </div>
        <div class="trust-row"><span>OAuth 2.1 + PKCE</span><span>Traceable sources</span><span>Release {{ releaseTag }}</span></div>
      </div>

      <div class="hero-panel" aria-label="MCP search preview">
        <div class="panel-top"><span class="terminal-dots"><i /><i /><i /></span><span>AION CONTEXT / MCP</span><span class="panel-live">LIVE</span></div>
        <div class="panel-body">
          <p class="prompt"><span>›</span> aion_search_context</p>
          <p class="query">“How does progression work in TW?”</p>
          <div class="result-line"><b>3</b><span> relevant sources</span></div>
          <div class="source-result"><div><span class="result-kind">SOURCE · TW</span><strong>AION 2 — Progression &amp; stats</strong></div><span class="score">0.92</span></div>
          <div class="source-result muted-result"><div><span class="result-kind">THEORY · TW</span><strong>Combat power and item level</strong></div><span class="score">0.81</span></div>
          <p class="prompt bottom"><span>›</span> evidence, scope, and contradictions included</p>
        </div>
      </div>
    </section>

    <section id="connect" class="setup-section">
      <div class="page-width setup-grid">
        <div class="section-intro">
          <p class="eyebrow">GET STARTED</p><h2>Connect AION to your MCP client.</h2>
          <p>Use this address in T3 Code, ChatGPT, or another remote MCP client. OAuth authentication opens on first access.</p>
        </div>
        <div class="endpoint-card">
          <span class="field-label">MCP SERVER URL</span>
          <div class="endpoint-value"><code>{{ endpoint }}</code><button type="button" class="copy-button" @click="copy(endpoint, 'url')">{{ copied === 'url' ? 'Copied' : 'Copy' }}</button></div>
          <p>Streamable HTTP endpoint · authenticated access required</p>
        </div>
      </div>

      <div class="page-width connect-steps">
        <article><span class="step-number">01</span><h3>Add the server</h3><p>In your client’s MCP settings, add a remote server and paste the URL above.</p></article>
        <article><span class="step-number">02</span><h3>Authorize access</h3><p>Your client opens this site for OAuth. Sign in below, then approve the client request.</p></article>
        <article><span class="step-number">03</span><h3>Search first</h3><p>Ask your AI to call <code>aion_search_context</code> before answering an AION 2 question.</p></article>
      </div>

      <div class="page-width client-grid">
        <article class="client-card"><span class="client-label">T3 CODE</span><h3>Add a remote MCP</h3><p>Open MCP settings, add a remote server, and paste the AION URL. Your browser then handles authorization.</p></article>
        <article class="client-card"><span class="client-label">CHATGPT</span><h3>Add the connector</h3><p>Add an MCP connector with this URL, then complete OAuth in the window that opens.</p></article>
        <article class="client-card code-card"><div class="code-header"><span>Generic configuration</span><button type="button" @click="copy(connectionConfig, 'config')">{{ copied === 'config' ? 'Copied' : 'Copy' }}</button></div><pre>{{ connectionConfig }}</pre></article>
      </div>
    </section>

    <section id="sign-in" class="login-section page-width">
      <div>
        <p class="eyebrow">YOUR BROWSER SESSION</p>
        <h2>{{ authenticated ? 'You are ready to authorize a client.' : 'Sign in before authorizing a client.' }}</h2>
        <p>This session stays in this browser only. It makes it easier to authorize T3 Code, ChatGPT, or any client that redirects you here.</p>
      </div>
      <form v-if="!authenticated" class="login-form" @submit.prevent="login">
        <label for="password">Access password</label>
        <div class="login-row"><input id="password" v-model="password" type="password" autocomplete="current-password" required placeholder="Your OAuth password" /><button class="button primary" :disabled="busy" type="submit">{{ busy ? 'Signing in…' : 'Sign in' }}</button></div>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      </form>
      <div v-else class="logged-in"><span class="check">✓</span><div><strong>Session active</strong><p>Return to your client and approve its authorization request.</p></div><button type="button" class="text-button" :disabled="busy" @click="logout">Sign out</button></div>
    </section>

    <section id="capabilities" class="features-section page-width">
      <div class="section-intro centered"><p class="eyebrow">WHAT THE AI CAN USE</p><h2>Context, not a black box.</h2><p>The model reasons; AION MCP makes memory, sources, and disagreements usable.</p></div>
      <div class="features-grid">
        <article class="feature-card featured"><span class="feature-icon">⌕</span><h3>Search context</h3><code>aion_search_context</code><p>Searches sources, knowledge, and open contradictions before an answer is given.</p></article>
        <article class="feature-card"><span class="feature-icon">⌁</span><h3>Preserve evidence</h3><code>aion_record_source</code><p>Records a link, transcript, or notes without claiming that a source is always correct.</p></article>
        <article class="feature-card"><span class="feature-icon">✦</span><h3>Formalize knowledge</h3><code>aion_record_knowledge</code><p>Separates observations, claims, theories, and recommendations by scope.</p></article>
        <article class="feature-card"><span class="feature-icon">↯</span><h3>Make doubt visible</h3><code>aion_record_challenge</code><p>Preserves contradictions and counter-evidence instead of erasing history.</p></article>
        <article class="feature-card"><span class="feature-icon">↗</span><h3>Acquire a URL</h3><code>aion_enqueue_source</code><p>Queues page acquisition in the background without blocking the conversation.</p></article>
        <article class="feature-card"><span class="feature-icon">◌</span><h3>Inspect the server</h3><code>aion_get_server_info</code><p>Shows the version and deployed tag—the release source of truth.</p></article>
      </div>
    </section>

    <section id="security" class="security-section"><div class="page-width security-content"><div><p class="eyebrow">CONTROLLED ACCESS</p><h2>Every client needs your approval.</h2></div><div class="security-points"><p><span>01</span>OAuth 2.1 with PKCE: no MCP secret is pasted into a client.</p><p><span>02</span>Clients declare their callback URI or publish client metadata.</p><p><span>03</span>Tokens are restricted to AION MCP and expire.</p></div></div></section>

    <footer class="footer page-width"><a class="brand" href="#top"><span class="brand-mark">A</span><span>AION <em>MCP</em></span></a><span>Context infrastructure for AION 2 · {{ releaseTag }}</span><a :href="`${endpoint.replace('/mcp', '')}/health`" target="_blank" rel="noreferrer">Server status</a></footer>
  </main>
</template>

<style scoped>
.page-width { width: min(1180px, calc(100% - 48px)); margin-inline: auto; }.nav { min-height: 84px; display: flex; align-items: center; justify-content: space-between; gap: 24px; }.brand { color: #fbfbf7; text-decoration: none; display: inline-flex; align-items: center; gap: 10px; font-size: .92rem; letter-spacing: .13em; font-weight: 800; }.brand em { color: #d8b96a; font-style: normal; }.brand-mark { display: grid; place-items: center; width: 28px; height: 28px; background: #d8b96a; color: #0d1010; clip-path: polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%); font-family: Georgia,serif; font-size: 1rem; }.nav-links { display: flex; gap: 28px; }.nav-links a,.nav-status { color: #a8b0a9; text-decoration: none; font-size: .84rem; }.nav-links a:hover { color: #f9f7ee; }.nav-status { display: flex; gap: 8px; align-items: center; }.status-dot { width: 7px; height: 7px; border-radius: 50%; background: #c49555; box-shadow: 0 0 0 4px rgba(196,149,85,.12); }.status-dot.active { background: #7dd5a1; box-shadow: 0 0 0 4px rgba(125,213,161,.12); }.hero { display: grid; grid-template-columns: 1.06fr .94fr; gap: 80px; padding: 100px 0 128px; align-items: center; }.eyebrow { color: #d8b96a; font-size: .68rem; letter-spacing: .2em; font-weight: 800; margin: 0 0 18px; }h1,h2,h3,p { margin-top: 0; }h1,h2 { color: #f7f8f2; font-family: Georgia,'Times New Roman',serif; font-weight: 400; letter-spacing: -.045em; }h1 { max-width: 680px; margin-bottom: 24px; font-size: clamp(3.3rem,6vw,5.8rem); line-height: .93; }.lede { max-width: 620px; color: #aeb6ad; font-size: 1.1rem; line-height: 1.7; }.hero-actions { display: flex; gap: 12px; margin: 34px 0 29px; }.button { border: 1px solid transparent; padding: 12px 17px; min-height: 45px; display: inline-flex; align-items: center; justify-content: center; gap: 12px; font: inherit; font-weight: 700; font-size: .83rem; cursor: pointer; text-decoration: none; transition: transform .15s ease,background .15s ease; }.button:hover:not(:disabled) { transform: translateY(-2px); }.button:disabled { opacity: .65; cursor: wait; }.primary { background: #d8b96a; color: #10140f; border-color: #d8b96a; }.primary span { font-size: 1.1rem; }.quiet { color: #e4e6dd; border-color: #3b423c; }.trust-row { display: flex; flex-wrap: wrap; gap: 16px; color: #8d968d; font-size: .74rem; }.trust-row span { display: inline-flex; align-items: center; gap: 7px; }.trust-row span::before { content: '•'; color: #d8b96a; }.hero-panel { background: #111713; border: 1px solid #354038; box-shadow: 22px 24px 0 #1e271f,0 32px 80px rgba(0,0,0,.26); }.panel-top { height: 47px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #303a31; padding: 0 18px; color: #879187; font-size: .66rem; font-weight: 800; letter-spacing: .11em; }.terminal-dots { display: flex; gap: 5px; }.terminal-dots i { width: 6px; height: 6px; border-radius: 100%; background: #485249; }.terminal-dots i:first-child { background: #d8b96a; }.panel-live { margin-left: auto; color: #84cda3; font-size: .58rem; }.panel-body { padding: 28px; }.prompt { color: #d8b96a; font-family: ui-monospace,SFMono-Regular,Menlo,monospace; font-size: .78rem; }.prompt span { color: #7dd5a1; margin-right: 8px; }.query { padding: 12px 0 24px; color: #f3f4ec; font-family: Georgia,serif; font-size: 1.3rem; border-bottom: 1px solid #29332b; }.result-line { display: flex; align-items: baseline; gap: 9px; color: #8f998f; font-size: .76rem; margin: 22px 0 13px; }.result-line b { font-size: 1.65rem; font-family: Georgia,serif; color: #f5f5ee; font-weight: 400; }.source-result { display: flex; justify-content: space-between; gap: 15px; padding: 13px 0; border-top: 1px solid #29332b; }.source-result div { display: grid; gap: 6px; }.result-kind { color: #89b99c; font-size: .58rem; letter-spacing: .12em; font-weight: 800; }.source-result strong { color: #dce2d9; font-size: .79rem; font-weight: 600; }.score { color: #d8b96a; font-family: ui-monospace,monospace; font-size: .7rem; }.muted-result { opacity: .63; }.prompt.bottom { margin: 24px 0 0; color: #899288; font-size: .65rem; }.setup-section { background: #e9e8de; color: #171b17; padding: 108px 0 104px; }.setup-grid { display: grid; grid-template-columns: .85fr 1.15fr; gap: 80px; align-items: end; }.setup-section h2,.features-section h2 { font-size: clamp(2.5rem,4vw,4rem); line-height: .99; margin-bottom: 18px; color: #1b201a; }.section-intro > p:not(.eyebrow) { color: #596158; line-height: 1.65; max-width: 490px; }.endpoint-card { padding: 25px; background: #151b16; color: #e8ebe4; box-shadow: 12px 12px 0 #c9c9bd; }.field-label { color: #d8b96a; font-size: .63rem; font-weight: 800; letter-spacing: .16em; }.endpoint-value { display: flex; gap: 14px; align-items: center; justify-content: space-between; margin-top: 11px; }.endpoint-value code { color: #fbfbf7; font-size: clamp(.8rem,2vw,1rem); overflow-wrap: anywhere; }.copy-button,.code-header button { border: 1px solid #677067; color: #e8ebe4; background: transparent; cursor: pointer; font: inherit; padding: 7px 10px; font-size: .7rem; white-space: nowrap; }.endpoint-card p { color: #aeb7ae; margin: 16px 0 0; font-size: .74rem; }.connect-steps { display: grid; grid-template-columns: repeat(3,1fr); gap: 44px; margin-top: 94px; }.connect-steps article { border-top: 1px solid #b9bbae; padding-top: 19px; }.step-number,.client-label { color: #a67e39; font-size: .66rem; letter-spacing: .14em; font-weight: 800; }.connect-steps h3,.client-card h3 { margin: 13px 0 8px; font-size: 1rem; }.connect-steps p,.client-card p { color: #596158; font-size: .85rem; line-height: 1.6; margin-bottom: 0; }.connect-steps code { color: #1d4f35; }.client-grid { display: grid; grid-template-columns: 1fr 1fr 1.25fr; gap: 16px; margin-top: 55px; }.client-card { padding: 23px; border: 1px solid #c5c7bb; }.code-card { background: #1d241e; border-color: #1d241e; color: #ecede8; padding: 0; overflow: hidden; }.code-header { display: flex; align-items: center; justify-content: space-between; padding: 13px 16px; color: #acb5a9; font-size: .7rem; border-bottom: 1px solid #344036; }.code-header button { padding: 4px 7px; }.code-card pre { padding: 16px; margin: 0; overflow-x: auto; color: #cfe3c8; font-size: .7rem; line-height: 1.55; }.login-section { display: grid; grid-template-columns: .85fr 1.15fr; gap: 80px; padding: 104px 0; align-items: center; }.login-section h2 { font-size: clamp(2.2rem,3.6vw,3.5rem); line-height: 1; margin-bottom: 18px; }.login-section > div > p:not(.eyebrow) { color: #98a299; max-width: 480px; line-height: 1.65; }.login-form { padding: 28px; border: 1px solid #374238; background: #121813; }.login-form label { display: block; color: #dbe0d8; font-size: .75rem; margin-bottom: 9px; }.login-row { display: flex; gap: 10px; }.login-row input { min-width: 0; flex: 1; border: 1px solid #3e493f; background: #0c100d; color: #f3f5ef; padding: 12px; font: inherit; outline: none; }.login-row input:focus { border-color: #d8b96a; }.form-error { color: #f4b2a7; font-size: .78rem; margin: 12px 0 0; }.logged-in { display: flex; gap: 15px; align-items: flex-start; padding: 26px; border: 1px solid #365241; background: #101a13; }.check { display: grid; place-items: center; width: 27px; height: 27px; flex: 0 0 auto; border-radius: 50%; background: #7dd5a1; color: #102217; font-weight: 800; }.logged-in strong { color: #e8f0e7; }.logged-in p { color: #a9b8aa; font-size: .8rem; margin: 5px 0 0; line-height: 1.5; }.text-button { margin-left: auto; border: 0; color: #d8b96a; background: none; font: inherit; font-size: .75rem; cursor: pointer; white-space: nowrap; }.features-section { padding: 25px 0 122px; }.centered { text-align: center; }.centered > p:not(.eyebrow) { margin-inline: auto; }.features-grid { display: grid; grid-template-columns: repeat(3,1fr); border: 1px solid #323b33; margin-top: 52px; }.feature-card { min-height: 242px; padding: 28px; border-right: 1px solid #323b33; border-bottom: 1px solid #323b33; }.feature-card:nth-child(3n) { border-right: 0; }.feature-card:nth-last-child(-n + 3) { border-bottom: 0; }.feature-card.featured { background: #1a241c; }.feature-icon { display: block; color: #d8b96a; font-size: 1.45rem; min-height: 37px; }.feature-card h3 { margin: 11px 0 6px; color: #eff1ea; font-size: 1rem; }.feature-card code { color: #82b996; font-size: .7rem; }.feature-card p { color: #9ba69c; margin: 17px 0 0; font-size: .82rem; line-height: 1.6; }.security-section { background: #d8b96a; color: #172018; }.security-content { display: grid; grid-template-columns: .9fr 1.1fr; gap: 80px; padding: 86px 0; }.security-section .eyebrow { color: #4a3b1c; }.security-section h2 { color: #172018; font-size: clamp(2.2rem,3.6vw,3.6rem); line-height: 1; margin-bottom: 0; }.security-points { display: grid; gap: 17px; }.security-points p { margin: 0; display: grid; grid-template-columns: 31px 1fr; gap: 14px; color: #324032; line-height: 1.55; font-size: .9rem; }.security-points span { color: #725b27; font-size: .68rem; font-weight: 800; padding-top: 4px; }.footer { min-height: 108px; display: flex; justify-content: space-between; align-items: center; gap: 20px; color: #889288; font-size: .72rem; }.footer > a:last-child { color: #cbb064; text-decoration: none; }
@media (max-width: 820px) { .page-width { width: min(100% - 32px,620px); }.nav { min-height: 70px; }.nav-links { display: none; }.hero,.setup-grid,.login-section,.security-content { grid-template-columns: 1fr; gap: 42px; }.hero { padding: 72px 0 88px; }.hero-panel { max-width: 520px; width: calc(100% - 12px); }.connect-steps,.client-grid { grid-template-columns: 1fr; gap: 25px; margin-top: 58px; }.client-grid { gap: 12px; }.login-section { padding: 74px 0; }.features-section { padding-bottom: 78px; }.features-grid { grid-template-columns: 1fr; }.feature-card,.feature-card:nth-child(3n),.feature-card:nth-last-child(-n + 3) { border-right: 0; border-bottom: 1px solid #323b33; }.feature-card:last-child { border-bottom: 0; }.security-content { padding: 68px 0; }.footer { padding: 30px 0; min-height: 0; flex-wrap: wrap; }.endpoint-value { align-items: flex-start; flex-direction: column; }.login-row { flex-direction: column; }.login-row .button { width: 100%; }.text-button { margin-left: 0; } }
</style>
