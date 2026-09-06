<script setup lang="ts">
import {
  AION_MCP_AUTH,
  AION_MCP_CONNECT_CONTEXT,
  AION_MCP_CONNECT_FLOW,
  AION_MCP_CONNECT_NOTE,
  AION_MCP_ENDPOINT,
  clientGuides
} from '../lib/client-guides.js'

interface PortalAccountResponse {
  authenticated: true
  identity: {
    id: string
    discordUserId: string
    displayName: string
  }
  betaStatus: {
    status: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED'
    requestId: string | null
    updatedAt: string | null
  }
  mcpCredentials: Array<{
    id: string
    oauthClientId: string
    status: 'ACTIVE' | 'REVOKED'
    issuedAt: string
    revokedAt: string | null
    lastUsedAt: string | null
  }>
}

interface PortalActivityResponse {
  authenticated: true
  identity: {
    id: string
    discordUserId: string
    displayName: string
  }
  activities: Array<{
    id: string
    userId: string
    credentialId: string | null
    authenticationMethod: 'OAUTH'
    toolName: string
    outcome: 'SUCCESS' | 'FAILURE'
    durationMs: number | null
    createdAt: string
  }>
}

interface PortalState {
  account: PortalAccountResponse | null
  activity: PortalActivityResponse | null
  error: string | null
}

const requestHeaders = import.meta.server ? useRequestHeaders(['cookie']) : undefined

function isAuthError(cause: unknown): boolean {
  const record = cause as { statusCode?: unknown; data?: { statusCode?: unknown } } | null
  const statusCode = Number(record?.statusCode ?? record?.data?.statusCode ?? 0)
  return statusCode === 401 || statusCode === 403
}

const portalState = await useAsyncData<PortalState | null>('portal-state', async () => {
  try {
    const [account, activity] = await Promise.all([
      $fetch<PortalAccountResponse>('/api/beta/account', { headers: requestHeaders }),
      $fetch<PortalActivityResponse>('/api/app/activity?limit=20', { headers: requestHeaders })
    ])

    return {
      account,
      activity,
      error: null
    }
  } catch (cause) {
    if (isAuthError(cause)) {
      return null
    }

    const record = cause as { data?: { statusMessage?: unknown }; message?: unknown } | null
    return {
      account: null,
      activity: null,
      error: String(record?.data?.statusMessage ?? record?.message ?? 'Could not load portal data.')
    }
  }
})

if (!portalState.data.value) {
  await navigateTo('/', { replace: true })
}

useHead({
  title: 'AION MCP / App'
})

const portal = computed(() => portalState.data.value)
const account = computed(() => portal.value?.account ?? null)
const activity = computed(() => portal.value?.activity ?? null)
const portalErrorMessage = computed(() => portal.value?.error ?? '')
const portalLoading = computed(() => portalState.pending.value)

const credentialLookup = computed(
  () =>
    new Map(
      (account.value?.mcpCredentials ?? []).map(credential => [credential.id, credential.oauthClientId])
    )
)

const activityItems = computed(() =>
  (activity.value?.activities ?? []).map(item => ({
    ...item,
    credentialLabel: item.credentialId ? credentialLookup.value.get(item.credentialId) ?? null : null
  }))
)

const recentActivityItems = computed(() => activityItems.value.slice(0, 4))
const activeCredentials = computed(
  () => account.value?.mcpCredentials.filter(credential => credential.status === 'ACTIVE') ?? []
)
const hasAnyCredentials = computed(() => (account.value?.mcpCredentials ?? []).length > 0)
const approvedAt = computed(() => account.value?.betaStatus.updatedAt ?? null)
const connectCopyState = ref<'idle' | 'copied' | 'failed'>('idle')
let connectCopyReset: ReturnType<typeof setTimeout> | null = null

const credentialBusyId = ref<string | null>(null)
const revokeAllBusy = ref(false)
const deleteBusy = ref(false)
const signOutBusy = ref(false)
const credentialError = ref('')
const deleteError = ref('')

const navigation = [
  { id: 'overview', label: 'Overview' },
  { id: 'connect', label: 'Connect' },
  { id: 'tools', label: 'Tools' },
  { id: 'activity', label: 'Activity' },
  { id: 'account', label: 'Account' }
] as const

const toolDocs = [
  {
    name: 'aion_search_context',
    purpose: 'Search persistent AION context before reasoning.',
    useWhen: 'The model needs to know what is already established, challenged, or source-backed.'
  },
  {
    name: 'aion_get_source',
    purpose: 'Inspect a single source record with provenance.',
    useWhen: 'The model needs to verify source details or read a specific evidence item.'
  },
  {
    name: 'aion_record_source',
    purpose: 'Persist a new source entry into the durable context store.',
    useWhen: 'The model has a source to anchor future reasoning.'
  },
  {
    name: 'aion_record_knowledge',
    purpose: 'Persist a durable knowledge statement derived from evidence.',
    useWhen: 'The model has a stable claim that should survive sessions.'
  },
  {
    name: 'aion_record_challenge',
    purpose: 'Persist a contradiction or objection against existing knowledge.',
    useWhen: 'The model finds evidence that conflicts with a stored claim.'
  },
  {
    name: 'aion_list_open_challenges',
    purpose: 'List unresolved contradictions that still need attention.',
    useWhen: 'The model needs to audit what remains contested.'
  },
  {
    name: 'aion_enqueue_source',
    purpose: 'Queue a source for acquisition before durable processing.',
    useWhen: 'The model needs to fetch or ingest a source that is not yet stored.'
  }
] as const

const reasoningAxes = [
  { label: 'GLOBAL', text: 'Shared across AION contexts.' },
  { label: 'TW', text: 'Theorycraft or game-specific scope.' },
  { label: 'KR', text: 'Knowledge record with local durability.' },
  { label: 'UNKNOWN', text: 'Scope has not been determined yet.' }
] as const

const reasoningTypes = [
  { label: 'OBSERVATION', text: 'Directly inspected evidence.' },
  { label: 'CLAIM', text: 'A statement that can be challenged.' },
  { label: 'THEORY', text: 'A reasoned but not yet settled synthesis.' },
  { label: 'RECOMMENDATION', text: 'A practical action derived from context.' }
] as const

const workflow = [
  'Question',
  'Search context',
  'Inspect evidence',
  'Research if needed',
  'Reason',
  'Persist durable knowledge',
  'Challenge contradictions',
  'Answer'
] as const

function scheduleConnectCopyReset() {
  if (connectCopyReset) {
    clearTimeout(connectCopyReset)
  }

  connectCopyReset = setTimeout(() => {
    connectCopyState.value = 'idle'
    connectCopyReset = null
  }, 2000)
}

async function copyEndpoint() {
  if (!import.meta.client || !navigator.clipboard?.writeText) {
    connectCopyState.value = 'failed'
    return
  }

  try {
    await navigator.clipboard.writeText(AION_MCP_ENDPOINT)
    connectCopyState.value = 'copied'
    scheduleConnectCopyReset()
  } catch {
    connectCopyState.value = 'failed'
  }
}

function formatTimestamp(value: string | null): string {
  if (!value) return '—'
  return value.replace('T', ' ').replace('.000Z', ' UTC')
}

async function refreshPortal() {
  await portalState.refresh()
}

async function revokeCredential(credentialId: string) {
  credentialBusyId.value = credentialId
  credentialError.value = ''
  try {
    await $fetch(`/api/beta/account/mcp-credentials/${credentialId}/revoke`, {
      method: 'POST'
    })
    await refreshPortal()
  } catch (cause: any) {
    const message = String(cause?.data?.statusMessage ?? '')
    credentialError.value = message || 'Could not revoke the credential.'
  } finally {
    credentialBusyId.value = null
  }
}

async function revokeAllCredentials() {
  revokeAllBusy.value = true
  credentialError.value = ''
  try {
    await $fetch('/api/beta/account/mcp-credentials/revoke-all', {
      method: 'POST'
    })
    await refreshPortal()
  } catch (cause: any) {
    const message = String(cause?.data?.statusMessage ?? '')
    credentialError.value = message || 'Could not revoke the credentials.'
  } finally {
    revokeAllBusy.value = false
  }
}

async function signOut() {
  if (signOutBusy.value) return
  signOutBusy.value = true
  try {
    await $fetch('/api/beta/session', {
      method: 'DELETE'
    })
  } finally {
    await navigateTo('/', { replace: true })
  }
}

async function deleteAccount(confirmationPhrase: string) {
  deleteBusy.value = true
  deleteError.value = ''
  try {
    await $fetch('/api/beta/account/delete', {
      method: 'POST',
      body: { confirmationPhrase }
    })
    await navigateTo('/', { replace: true })
  } catch (cause: any) {
    const message = String(cause?.data?.statusMessage ?? '')
    deleteError.value = message || 'Could not delete the account.'
  } finally {
    deleteBusy.value = false
  }
}
</script>

<template>
  <main class="portal-page">
    <section class="portal-shell">
      <header class="portal-topbar">
        <div class="brand-lockup">
          <img class="brand-mark" src="/mark/aion-theory-mark-small.png" alt="" />
          <div>
            <p>AION THEORY <small>MCP</small></p>
            <span>Approved user portal</span>
          </div>
        </div>

        <div class="statusline">
          <div class="status-chip">
            <span>Identity</span>
            <strong>{{ account?.identity.displayName }}</strong>
          </div>
          <div class="status-chip">
            <span>Beta access</span>
            <strong>{{ account?.betaStatus.status }}</strong>
          </div>
          <button class="button subtle" type="button" :disabled="signOutBusy" @click="signOut">
            {{ signOutBusy ? 'Signing out…' : 'Sign out' }}
          </button>
        </div>
      </header>

      <div class="portal-layout">
        <aside class="portal-nav" aria-label="Portal navigation">
          <a v-for="item in navigation" :key="item.id" :href="`#${item.id}`" class="nav-link">
            [ {{ item.label }} ]
          </a>
        </aside>

        <div class="portal-content">
          <section id="overview" class="panel overview-panel">
            <p v-if="portalErrorMessage" class="notice error" role="alert">{{ portalErrorMessage }}</p>
            <div class="hero-copy">
              <p class="eyebrow">AION THEORY MCP</p>
              <h1>Your AI reasons. AION THEORY remembers.</h1>
              <p class="lede">
                The portal documents the system as it exists: sources, durable knowledge,
                contradictions, and the evidence trail behind every answer.
              </p>
            </div>

            <div class="overview-grid">
              <article class="card">
                <p class="card-label">Beta access</p>
                <strong>{{ account?.betaStatus.status }}</strong>
                <span>{{ approvedAt ? `Updated ${formatTimestamp(approvedAt)}` : 'Approved access required' }}</span>
              </article>
              <article class="card">
                <p class="card-label">MCP status</p>
                <strong>Ready</strong>
                <span>Connected conceptually through OAuth 2.1 + PKCE.</span>
              </article>
            </div>

            <div class="diagram" aria-label="System diagram">
              <div>AI Client</div>
              <div class="arrow">↓</div>
              <div>AION MCP</div>
              <div class="arrow">↓</div>
              <div class="diagram-sinks">
                <span>Sources</span>
                <span>Knowledge</span>
                <span>Theories</span>
                <span>Challenges</span>
              </div>
            </div>

              <ActivityList
              title="Recent activity"
              description="Latest entries for the current identity."
              :items="recentActivityItems"
              :loading="portalLoading"
              :error="portalErrorMessage"
              empty-message="No recent activity yet."
              compact
            />
          </section>

          <section id="connect" class="panel connect-panel">
            <div class="section-heading connect-heading">
              <div>
                <p class="eyebrow">CONNECT</p>
                <h2>Verified MCP client guides.</h2>
              </div>
              <div class="section-copy connect-summary">
                <div class="summary-block">
                  <span>MCP endpoint</span>
                  <div class="endpoint-row">
                    <code>{{ AION_MCP_ENDPOINT }}</code>
                    <button
                      class="copy-button"
                      type="button"
                      :aria-label="`Copy the AION MCP endpoint ${AION_MCP_ENDPOINT}`"
                      @click="copyEndpoint"
                    >
                      {{ connectCopyState === 'copied' ? 'Copied' : connectCopyState === 'failed' ? 'Copy failed' : 'Copy endpoint' }}
                    </button>
                  </div>
                </div>
                <div class="summary-block">
                  <span>Authentication</span>
                  <code>{{ AION_MCP_AUTH }}</code>
                </div>
                <div class="summary-block">
                  <span>Connection flow</span>
                  <ol class="flow-list">
                    <li v-for="step in AION_MCP_CONNECT_FLOW" :key="step">{{ step }}</li>
                  </ol>
                </div>
                <p class="connect-note">
                  {{ AION_MCP_CONNECT_NOTE }}
                </p>
                <p class="connect-note subtle">
                  {{ AION_MCP_CONNECT_CONTEXT }}
                </p>
              </div>
            </div>

            <nav class="guide-tabs" aria-label="Client guides">
              <a
                v-for="guide in clientGuides"
                :key="guide.id"
                class="nav-link guide-tab"
                :href="`#${guide.id}`"
              >
                {{ guide.name }}
              </a>
            </nav>

            <div class="guide-grid">
              <ClientGuideCard v-for="guide in clientGuides" :key="guide.id" :guide="guide" />
            </div>
          </section>

          <section id="tools" class="panel">
            <div class="section-heading">
              <div>
                <p class="eyebrow">TOOLS</p>
                <h2>What the MCP actually does.</h2>
              </div>
              <p class="section-copy">
                The portal documents the real execution model, not a marketing abstraction.
              </p>
            </div>

            <div class="tool-grid">
              <article v-for="tool in toolDocs" :key="tool.name" class="tool-card">
                <p class="tool-name">{{ tool.name }}</p>
                <p class="tool-purpose">{{ tool.purpose }}</p>
                <p class="tool-use">
                  <span>Use when</span>
                  {{ tool.useWhen }}
                </p>
              </article>
            </div>

            <div class="reasoning-grid">
              <article class="reasoning-card">
                <p class="eyebrow">REASONING MODEL</p>
                <div class="chip-row">
                  <span v-for="axis in reasoningAxes" :key="axis.label" class="chip">
                    <strong>{{ axis.label }}</strong>
                    <small>{{ axis.text }}</small>
                  </span>
                </div>
                <div class="chip-row">
                  <span v-for="type in reasoningTypes" :key="type.label" class="chip muted">
                    <strong>{{ type.label }}</strong>
                    <small>{{ type.text }}</small>
                  </span>
                </div>
              </article>

              <article class="reasoning-card">
                <p class="eyebrow">WORKFLOW</p>
                <ol class="workflow">
                  <li v-for="step in workflow" :key="step">{{ step }}</li>
                </ol>
              </article>
            </div>
          </section>

          <section id="activity" class="panel">
            <ActivityList
              title="Activity"
              description="Latest user activity only."
              :items="activityItems"
              :loading="portalLoading"
              :error="portalErrorMessage"
              empty-message="No activity recorded yet."
            />
          </section>

          <section id="account" class="panel account-panel">
            <div class="section-heading">
              <div>
                <p class="eyebrow">ACCOUNT</p>
                <h2>Identity, credentials, and lifecycle actions.</h2>
              </div>
              <p class="section-copy">
                Discord identity
                <code>{{ account?.identity.discordUserId }}</code>
                <br />
                MCP credentials are scoped to this identity only.
              </p>
            </div>

            <div class="account-summary">
              <article class="summary-card">
                <p class="card-label">Identity</p>
                <strong>{{ account?.identity.displayName }}</strong>
                <span>Discord user id {{ account?.identity.discordUserId }}</span>
              </article>
              <article class="summary-card">
                <p class="card-label">Credentials</p>
                <strong>{{ activeCredentials.length }} active</strong>
                <span>{{ hasAnyCredentials ? 'Issued credentials are listed below.' : 'No credential issued yet.' }}</span>
              </article>
            </div>

            <CredentialList
              :credentials="account?.mcpCredentials ?? []"
              :loading="portalLoading"
              :error="credentialError"
              :busy-credential-id="credentialBusyId"
              :revoke-all-busy="revokeAllBusy"
              @revoke="revokeCredential"
              @revoke-all="revokeAllCredentials"
            />

            <DangerZone :busy="deleteBusy" :error="deleteError" @delete="deleteAccount" />
          </section>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.portal-page {
  --ink: #050913;
  --text: #eff5ff;
  --muted: #9aa9c1;
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  padding: 30px 0 54px;
  background:
    radial-gradient(ellipse 70% 48% at 88% 23%, rgba(98, 80, 197, 0.17), transparent 70%),
    radial-gradient(ellipse 55% 38% at 13% 13%, rgba(38, 159, 219, 0.12), transparent 70%),
    var(--ink);
  color: var(--text);
}

.portal-shell {
  position: relative;
  z-index: 1;
  width: min(1200px, calc(100% - 48px));
  margin: 0 auto;
}

.portal-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 52px;
}

.brand-lockup {
  display: inline-flex;
  align-items: center;
  gap: 12px;
}

.brand-lockup p,
.brand-lockup span,
.status-chip span,
.eyebrow,
.card-label,
.card span,
.section-copy,
.tool-use,
.tool-purpose,
.activity-description {
  margin: 0;
}

.brand-lockup p {
  font-size: 0.96rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.brand-lockup span {
  color: var(--aion-muted);
  font-size: 0.82rem;
}

.brand-mark {
  width: 38px;
  height: 38px;
  filter: drop-shadow(0 0 11px rgba(75, 195, 255, 0.6));
}
.brand-lockup p small { display: block; margin-top: 4px; font-size: 0.52em; letter-spacing: 0.52em; text-align: center; }

.statusline {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: end;
}

.status-chip {
  display: grid;
  gap: 2px;
  padding: 8px 0 8px 16px;
  border-left: 1px solid rgba(107, 213, 255, 0.35);
  background: transparent;
  min-width: 140px;
}

.status-chip span {
  font-size: 0.72rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--aion-muted);
}

.status-chip strong {
  font-size: 0.9rem;
}

.portal-layout {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 22px;
}

.portal-nav {
  position: sticky;
  top: 24px;
  display: grid;
  gap: 10px;
  align-self: start;
  padding: 0 24px 0 0;
  border-right: 1px solid rgba(159, 192, 245, 0.16);
  background: transparent;
}

.nav-link {
  display: block;
  padding: 10px 0;
  text-decoration: none;
  color: var(--aion-text);
  background: transparent;
  transition:
    transform 140ms ease,
    background 140ms ease,
    border-color 140ms ease;
}

.nav-link:hover,
.nav-link:focus-visible {
  transform: translateX(2px);
  color: #6bd5ff;
  background: transparent;
  outline: none;
}

.portal-content {
  display: grid;
  gap: 20px;
}

.panel {
  padding: 0 0 54px;
  border-bottom: 1px solid rgba(159, 192, 245, 0.14);
  background: transparent;
}

.overview-panel {
  display: grid;
  gap: 22px;
}

.hero-copy h1,
.section-heading h2 {
  margin: 0;
  line-height: 1.04;
  letter-spacing: -0.05em;
}

.hero-copy h1 {
  max-width: 14ch;
  font-size: clamp(2.8rem, 5vw, 5rem);
}

.section-heading h2 {
  max-width: 18ch;
  font-size: clamp(1.5rem, 2.2vw, 2.4rem);
}

.lede {
  max-width: 70ch;
  margin: 18px 0 0;
  color: var(--aion-muted);
  line-height: 1.7;
  font-size: 1.02rem;
}

.overview-grid,
.account-summary,
.reasoning-grid,
.info-grid,
.tool-grid {
  display: grid;
  gap: 14px;
}

.overview-grid,
.account-summary,
.reasoning-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.card,
.summary-card,
.info-card,
.tool-card,
.reasoning-card {
  padding: 18px 0;
  border-top: 1px solid rgba(159, 192, 245, 0.14);
  background: transparent;
}

.card {
  min-height: 120px;
  display: grid;
  gap: 10px;
  align-content: start;
}

.card strong,
.summary-card strong {
  font-size: 1.4rem;
}

.card span,
.summary-card span {
  color: var(--aion-muted);
  line-height: 1.5;
}

.card-label {
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--aion-accent-2);
}

.diagram {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 20px;
  border-radius: 22px;
  border: 1px solid rgba(56, 165, 255, 0.16);
  background: rgba(255, 255, 255, 0.02);
  text-align: center;
}

.diagram-sinks {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
}

.diagram-sinks span,
.chip {
  padding: 8px 11px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.arrow {
  color: var(--aion-accent-2);
  font-size: 1.3rem;
}

.section-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 18px;
}

.section-copy {
  max-width: 36ch;
  color: var(--aion-muted);
  line-height: 1.6;
  text-align: right;
}

.connect-panel {
  display: grid;
  gap: 18px;
}

.connect-heading {
  align-items: start;
}

.connect-summary {
  display: grid;
  gap: 14px;
  max-width: min(44rem, 100%);
  text-align: left;
}

.summary-block {
  display: grid;
  gap: 8px;
}

.summary-block > span {
  font-size: 0.74rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--aion-accent-2);
}

.endpoint-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.copy-button {
  min-height: 40px;
  padding: 0 14px;
  border-radius: 12px;
  border: 1px solid rgba(82, 239, 217, 0.18);
  background: rgba(255, 255, 255, 0.04);
  color: var(--aion-text);
  font: inherit;
  font-size: 0.86rem;
  font-weight: 700;
}

.copy-button:hover,
.copy-button:focus-visible {
  outline: none;
  background: rgba(56, 165, 255, 0.12);
}

.flow-list {
  margin: 0;
  padding-left: 20px;
  display: grid;
  gap: 6px;
  color: var(--aion-text);
}

.connect-note {
  margin: 0;
  color: var(--aion-muted);
  line-height: 1.6;
}

.connect-note.subtle {
  font-size: 0.92rem;
}

.guide-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.guide-tab {
  flex: 0 0 auto;
  min-width: 0;
}

.guide-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.guide-grid :deep(.client-guide-card) {
  scroll-margin-top: 24px;
}

.info-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.info-card h3,
.tool-name,
.reasoning-card .eyebrow,
.overview-panel .eyebrow,
.section-heading .eyebrow {
  margin: 0 0 10px;
  font-size: 0.74rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--aion-accent-2);
}

.info-card p,
.tool-purpose,
.tool-use {
  color: var(--aion-muted);
  line-height: 1.65;
}

.info-card ul {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 10px;
}

.info-card li span {
  display: block;
  margin-top: 4px;
  color: var(--aion-muted);
  font-size: 0.82rem;
}

.tool-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-bottom: 16px;
}

.tool-card {
  display: grid;
  gap: 10px;
}

.tool-name {
  margin-bottom: 0;
}

.tool-purpose {
  margin: 0;
  color: var(--aion-text);
  font-weight: 600;
}

.tool-use {
  margin: 0;
}

.tool-use span {
  display: block;
  margin-bottom: 4px;
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--aion-accent-2);
}

.reasoning-grid {
  margin-top: 14px;
}

.reasoning-card {
  display: grid;
  gap: 12px;
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.chip {
  display: grid;
  gap: 3px;
}

.chip strong {
  font-size: 0.74rem;
  letter-spacing: 0.1em;
}

.chip small {
  color: var(--aion-muted);
  max-width: 24ch;
}

.chip.muted {
  background: rgba(255, 255, 255, 0.03);
}

.workflow {
  margin: 0;
  padding-left: 20px;
  display: grid;
  gap: 8px;
  color: var(--aion-text);
}

.account-panel {
  display: grid;
  gap: 18px;
}

.summary-card {
  display: grid;
  gap: 8px;
}

.summary-card strong {
  font-size: 1.2rem;
}

.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0 16px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: var(--aion-text);
  font-weight: 700;
}

.button.subtle:hover,
.button.subtle:focus-visible {
  background: rgba(56, 165, 255, 0.12);
}

.button:disabled {
  opacity: 0.58;
  cursor: not-allowed;
}

:deep(.eyebrow.danger) {
  color: #ff8f9c;
}

:deep(.button.danger) {
  background: rgba(255, 96, 120, 0.16);
  border-color: rgba(255, 96, 120, 0.28);
}

code {
  padding: 0.15rem 0.38rem;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  color: #d2f6ff;
  font-size: 0.92em;
}

@media (max-width: 1120px) {
  .portal-layout {
    grid-template-columns: 1fr;
  }

  .portal-nav {
    position: static;
    display: flex;
    overflow-x: auto;
    white-space: nowrap;
  }

  .nav-link {
    flex: 0 0 auto;
  }
}

@media (max-width: 960px) {
  .portal-topbar,
  .section-heading {
    flex-direction: column;
    align-items: start;
  }

  .statusline {
    justify-content: start;
  }

  .section-copy {
    text-align: left;
  }

  .overview-grid,
  .account-summary,
  .reasoning-grid,
  .info-grid,
  .tool-grid,
  .guide-grid {
    grid-template-columns: 1fr;
  }

  .guide-grid {
    gap: 14px;
  }
}

@media (max-width: 720px) {
  .portal-page {
    padding-top: 16px;
  }

  .portal-shell {
    width: calc(100% - 32px);
  }

  .panel {
    padding: 0 0 38px;
  }

  .connect-summary {
    width: 100%;
  }

  .endpoint-row {
    align-items: start;
  }

  .endpoint-row code {
    flex: 1 1 100%;
    min-width: 0;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .copy-button {
    width: 100%;
  }

  .guide-tabs {
    gap: 8px;
  }

  .hero-copy h1 {
    font-size: clamp(2.2rem, 12vw, 3.2rem);
  }
}
</style>
