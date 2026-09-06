<script setup lang="ts">
import {
  type ComponentPublicInstance,
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref
} from 'vue'
import { AION_MCP_AUTH, AION_MCP_ENDPOINT, clientGuides } from '../lib/client-guides.js'

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

type SectionId = 'overview' | 'connect' | 'tools' | 'activity' | 'account'

const sectionIds: SectionId[] = ['overview', 'connect', 'tools', 'activity', 'account']

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

const recentActivityItems = computed(() => activityItems.value.slice(0, 5))
const latestActivity = computed(() => recentActivityItems.value[0] ?? null)
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

const activeSection = ref<SectionId>('overview')
const selectedGuideId = ref<string | null>(null)
const selectedToolName = ref('aion_search_context')
const sectionRefs = reactive<Record<SectionId, HTMLElement | null>>({
  overview: null,
  connect: null,
  tools: null,
  activity: null,
  account: null
})
let sectionObserver: IntersectionObserver | null = null

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
    summary: 'Search persistent context before answering.',
    useWhen: 'Use first for AION questions that depend on existing sources, knowledge, or open challenges.'
  },
  {
    name: 'aion_get_source',
    summary: 'Inspect a single source record.',
    useWhen: 'Use when provenance, excerpts, or stored source details matter.'
  },
  {
    name: 'aion_record_source',
    summary: 'Persist source material and provenance.',
    useWhen: 'Use when you have a URL, transcript, note, or other durable evidence material.'
  },
  {
    name: 'aion_record_knowledge',
    summary: 'Persist durable observations, claims, theories, or recommendations.',
    useWhen: 'Use when evidence supports a stable statement that should survive beyond the current session.'
  },
  {
    name: 'aion_record_challenge',
    summary: 'Record contradictions or objections.',
    useWhen: 'Use when new evidence conflicts with existing knowledge instead of silently replacing it.'
  },
  {
    name: 'aion_list_open_challenges',
    summary: 'List unresolved contradictions.',
    useWhen: 'Use when you need to audit what still needs reconciliation.'
  },
  {
    name: 'aion_enqueue_source',
    summary: 'Queue deterministic source acquisition.',
    useWhen: 'Use when a URL should be fetched before durable processing.'
  }
] as const

const reasoningScopes = [
  { label: 'GLOBAL', text: 'Use only with GLOBAL evidence or explicit analogy.' },
  { label: 'KR', text: 'Keep regional evidence scoped to KR.' },
  { label: 'TW', text: 'Keep regional evidence scoped to TW.' },
  { label: 'UNKNOWN', text: 'Leave scope unresolved when the evidence is unclear.' }
] as const

const reasoningKinds = [
  { label: 'OBSERVATION', text: 'Directly observed evidence.' },
  { label: 'CLAIM', text: 'A statement that can still be challenged.' },
  { label: 'THEORY', text: 'An explanatory synthesis.' },
  { label: 'RECOMMENDATION', text: 'Advice derived from evidence and assumptions.' }
] as const

function bindSectionRef(id: SectionId) {
  return (el: Element | ComponentPublicInstance | null) => {
    sectionRefs[id] = el as HTMLElement | null
  }
}

function setActiveSection(id: SectionId) {
  activeSection.value = id
}

function selectGuide(id: string) {
  selectedGuideId.value = id
}

function selectTool(name: string) {
  selectedToolName.value = name
}

const selectedTool = computed(
  () => toolDocs.find(tool => tool.name === selectedToolName.value) ?? toolDocs[0]
)

const selectedGuide = computed(() => {
  if (!selectedGuideId.value) return null
  return clientGuides.find(guide => guide.id === selectedGuideId.value) ?? null
})

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

function formatActivityLabel(value: string): string {
  return value.replaceAll('_', ' ').toLowerCase()
}

function scrollToSection(id: SectionId) {
  setActiveSection(id)
  const target = sectionRefs[id]
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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

onMounted(async () => {
  await nextTick()

  sectionObserver = new IntersectionObserver(
    entries => {
      const visibleEntries = entries
        .filter(entry => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio)

      if (!visibleEntries[0]) return

      const nextSection = visibleEntries[0].target.getAttribute('id') as SectionId | null
      if (nextSection) {
        activeSection.value = nextSection
      }
    },
    {
      root: null,
      threshold: [0.18, 0.35, 0.5, 0.75],
      rootMargin: '-18% 0px -58% 0px'
    }
  )

  for (const id of sectionIds) {
    const element = sectionRefs[id]
    if (element) {
      sectionObserver.observe(element)
    }
  }
})

onBeforeUnmount(() => {
  sectionObserver?.disconnect()
  sectionObserver = null

  if (connectCopyReset) {
    clearTimeout(connectCopyReset)
    connectCopyReset = null
  }
})
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

      <nav class="portal-mobile-nav" aria-label="Portal navigation">
        <button
          v-for="item in navigation"
          :key="item.id"
          type="button"
          class="nav-link nav-link--mobile"
          :class="{ active: activeSection === item.id }"
          :aria-current="activeSection === item.id ? 'page' : undefined"
          @click="scrollToSection(item.id)"
        >
          <span class="nav-label">{{ item.label }}</span>
        </button>
      </nav>

      <div class="portal-layout">
        <aside class="portal-nav" aria-label="Portal navigation">
          <button
            v-for="item in navigation"
            :key="item.id"
            type="button"
            class="nav-link"
            :class="{ active: activeSection === item.id }"
            :aria-current="activeSection === item.id ? 'page' : undefined"
            @click="scrollToSection(item.id)"
          >
            <span class="nav-label">{{ item.label }}</span>
          </button>
        </aside>

        <div class="portal-content">
          <section id="overview" :ref="bindSectionRef('overview')" class="panel overview-panel">
            <div class="section-heading section-heading--tight">
              <div>
                <p class="eyebrow">OVERVIEW</p>
                <h1>Approved-user portal.</h1>
              </div>
              <p class="section-copy">
                Compact status for the current identity, beta access, MCP readiness, and the latest
                activity.
              </p>
            </div>

            <div class="summary-grid">
              <article class="summary-card">
                <p class="card-label">Beta access</p>
                <strong>{{ account?.betaStatus.status }}</strong>
                <span>{{ approvedAt ? `Updated ${formatTimestamp(approvedAt)}` : 'Approved access required' }}</span>
              </article>
              <article class="summary-card">
                <p class="card-label">MCP status</p>
                <strong>Ready</strong>
                <span>{{ AION_MCP_AUTH }} · Remote endpoint active</span>
              </article>
              <article class="summary-card">
                <p class="card-label">Recent activity</p>
                <strong>{{ recentActivityItems.length }}</strong>
                <span v-if="latestActivity">
                  {{ formatActivityLabel(latestActivity.toolName) }} ·
                  {{ formatTimestamp(latestActivity.createdAt) }}
                </span>
                <span v-else>No activity recorded yet.</span>
              </article>
            </div>

            <div class="mini-activity">
              <div v-for="item in recentActivityItems" :key="item.id" class="mini-activity-row">
                <span>{{ formatTimestamp(item.createdAt) }}</span>
                <strong>{{ item.toolName }}</strong>
                <span>{{ item.outcome }}</span>
              </div>
            </div>
          </section>

          <section id="connect" :ref="bindSectionRef('connect')" class="panel connect-panel">
            <div class="section-heading section-heading--tight">
              <div>
                <p class="eyebrow">CONNECT</p>
                <h2>Client setup and verified guides.</h2>
              </div>
              <p class="section-copy">
                Start with the endpoint and auth state. Then open exactly one client guide at a time.
              </p>
            </div>

            <div class="connect-core">
              <div class="summary-grid connect-summary-grid">
                <article class="summary-card summary-card--compact">
                  <p class="card-label">MCP endpoint</p>
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
                </article>
                <article class="summary-card summary-card--compact">
                  <p class="card-label">Authentication</p>
                  <strong>{{ AION_MCP_AUTH }}</strong>
                  <span>OAuth 2.1 + PKCE with server-side access enforcement.</span>
                </article>
              </div>

              <div class="client-matrix" aria-label="Choose your client">
                <button
                  v-for="guide in clientGuides"
                  :key="guide.id"
                  type="button"
                  class="client-chip"
                  :class="{ active: selectedGuideId === guide.id }"
                  @click="selectGuide(guide.id)"
                >
                  <span>{{ guide.name }}</span>
                  <strong>{{ guide.status }}</strong>
                </button>
              </div>

              <div class="client-detail-shell">
                <p v-if="!selectedGuide" class="empty-state">
                  Choose your client to expand one guide at a time.
                </p>
                <ClientGuideCard v-else :guide="selectedGuide" />
              </div>
            </div>
          </section>

          <section id="tools" :ref="bindSectionRef('tools')" class="panel tools-panel">
            <div class="section-heading section-heading--tight">
              <div>
                <p class="eyebrow">TOOLS</p>
                <h2>Compact tool index.</h2>
              </div>
              <p class="section-copy">
                Core tools stay visible. Open one tool at a time for the full usage note.
              </p>
            </div>

            <div class="tool-table" role="list" aria-label="AION MCP tools">
              <button
                v-for="tool in toolDocs"
                :key="tool.name"
                type="button"
                class="tool-row"
                :class="{ active: selectedToolName === tool.name }"
                :aria-expanded="selectedToolName === tool.name"
                @click="selectTool(tool.name)"
              >
                <span class="tool-name">{{ tool.name }}</span>
                <span class="tool-summary">{{ tool.summary }}</span>
                <span class="tool-arrow">›</span>
              </button>
            </div>

            <div class="tool-detail-panel">
              <div class="tool-detail-header">
                <div>
                  <p class="card-label">Selected tool</p>
                  <h3>{{ selectedTool.name }}</h3>
                </div>
                <span class="tool-detail-hint">One detail panel at a time</span>
              </div>
              <p class="tool-detail-summary">{{ selectedTool.summary }}</p>
              <p class="tool-detail-copy">{{ selectedTool.useWhen }}</p>
            </div>

            <div class="rule-grid">
              <article class="rule-card">
                <p class="card-label">Reasoning scope</p>
                <div class="rule-chip-row">
                  <span v-for="scope in reasoningScopes" :key="scope.label" class="rule-chip">
                    <strong>{{ scope.label }}</strong>
                    <small>{{ scope.text }}</small>
                  </span>
                </div>
              </article>
              <article class="rule-card">
                <p class="card-label">Knowledge kinds</p>
                <div class="rule-chip-row">
                  <span v-for="kind in reasoningKinds" :key="kind.label" class="rule-chip muted">
                    <strong>{{ kind.label }}</strong>
                    <small>{{ kind.text }}</small>
                  </span>
                </div>
              </article>
            </div>
          </section>

          <section id="activity" :ref="bindSectionRef('activity')" class="panel">
            <ActivityList
              title="Activity"
              description="Latest activity rows for the current identity."
              :items="activityItems"
              :loading="portalLoading"
              :error="portalErrorMessage"
              empty-message="No activity recorded yet."
              :max-visible="6"
              compact
            />
          </section>

          <section id="account" :ref="bindSectionRef('account')" class="panel account-panel">
            <div class="section-heading section-heading--tight">
              <div>
                <p class="eyebrow">ACCOUNT</p>
                <h2>Identity, access, and lifecycle controls.</h2>
              </div>
              <p class="section-copy">
                Discord identity <code>{{ account?.identity.discordUserId }}</code>. Credentials and
                account actions stay scoped to this identity.
              </p>
            </div>

            <div class="account-summary">
              <article class="summary-card summary-card--compact">
                <p class="card-label">Identity</p>
                <strong>{{ account?.identity.displayName }}</strong>
                <span>Discord user id {{ account?.identity.discordUserId }}</span>
              </article>
              <article class="summary-card summary-card--compact">
                <p class="card-label">Beta access</p>
                <strong>{{ account?.betaStatus.status }}</strong>
                <span>{{ approvedAt ? `Request updated ${formatTimestamp(approvedAt)}` : 'No beta request recorded yet.' }}</span>
              </article>
              <article class="summary-card summary-card--compact">
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
  padding: 24px 0 48px;
  background:
    radial-gradient(ellipse 70% 48% at 88% 23%, rgba(98, 80, 197, 0.17), transparent 70%),
    radial-gradient(ellipse 55% 38% at 13% 13%, rgba(38, 159, 219, 0.12), transparent 70%),
    var(--ink);
  color: var(--text);
}

.portal-shell {
  position: relative;
  z-index: 1;
  width: min(1240px, calc(100% - 40px));
  margin: 0 auto;
}

.portal-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 28px;
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
.section-copy,
.tool-summary,
.tool-detail,
.activity-description {
  margin: 0;
}

.brand-lockup p {
  font-size: 0.94rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.brand-lockup p small {
  display: block;
  margin-top: 4px;
  font-size: 0.52em;
  letter-spacing: 0.52em;
  text-align: center;
}

.brand-lockup span {
  color: var(--muted);
  font-size: 0.8rem;
}

.brand-mark {
  width: 36px;
  height: 36px;
  filter: drop-shadow(0 0 11px rgba(75, 195, 255, 0.55));
}

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
  border-left: 1px solid rgba(107, 213, 255, 0.32);
  min-width: 132px;
}

.status-chip span {
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
}

.status-chip strong {
  font-size: 0.88rem;
}

.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  padding: 0 14px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text);
  font-weight: 700;
}

.button.subtle:hover,
.button.subtle:focus-visible {
  background: rgba(56, 165, 255, 0.12);
  outline: none;
}

.button:disabled {
  opacity: 0.58;
  cursor: not-allowed;
}

.portal-layout {
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
  gap: 18px;
}

.portal-nav {
  position: sticky;
  top: 18px;
  align-self: start;
  display: grid;
  gap: 8px;
  padding-right: 18px;
  border-right: 1px solid rgba(159, 192, 245, 0.16);
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px 9px 0;
  border: 0;
  border-left: 2px solid transparent;
  background: transparent;
  color: var(--text);
  text-align: left;
  font: inherit;
  transition:
    color 140ms ease,
    border-color 140ms ease,
    background 140ms ease,
    transform 140ms ease;
}

.nav-label {
  font-size: 0.9rem;
  font-weight: 650;
}

.nav-link:hover,
.nav-link:focus-visible,
.nav-link.active {
  border-left-color: #61d9ff;
  color: #d9f8ff;
  background: rgba(56, 165, 255, 0.06);
  outline: none;
  transform: translateX(2px);
}

.portal-content {
  display: grid;
  gap: 14px;
}

.panel {
  padding: 0 0 28px;
  border-bottom: 1px solid rgba(159, 192, 245, 0.12);
  scroll-margin-top: 24px;
}

.overview-panel {
  display: grid;
  gap: 14px;
}

.section-heading {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 16px;
}

.section-heading--tight {
  margin-bottom: 8px;
}

.eyebrow {
  margin: 0 0 8px;
  font-size: 0.7rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--aion-accent-2, #6bd5ff);
}

.hero-copy h1,
.section-heading h2 {
  margin: 0;
  line-height: 1.08;
  letter-spacing: -0.05em;
}

.hero-copy h1 {
  max-width: 12ch;
  font-size: clamp(2rem, 3vw, 2.55rem);
}

.section-heading h2 {
  max-width: 16ch;
  font-size: clamp(1.32rem, 1.9vw, 1.85rem);
}

.section-copy {
  max-width: 36ch;
  color: var(--muted);
  line-height: 1.55;
  text-align: right;
  font-size: 0.9rem;
}

.summary-grid,
.account-summary,
.rule-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.summary-card,
.rule-card {
  display: grid;
  gap: 8px;
  padding: 14px;
  border-top: 1px solid rgba(159, 192, 245, 0.14);
  background: rgba(255, 255, 255, 0.015);
}

.summary-card strong {
  font-size: 1.04rem;
}

.summary-card span,
.rule-card span {
  color: var(--muted);
  line-height: 1.55;
}

.summary-card--compact {
  padding-block: 12px;
}

.card-label {
  font-size: 0.7rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--aion-accent-2, #6bd5ff);
}

.mini-activity {
  display: grid;
  gap: 8px;
  padding-top: 2px;
}

.mini-activity-row {
  display: grid;
  grid-template-columns: 132px minmax(0, 1fr) 74px;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.03);
  color: var(--muted);
}

.mini-activity-row strong {
  color: var(--text);
  font-size: 0.88rem;
}

.connect-panel {
  display: grid;
  gap: 16px;
}

.connect-core {
  display: grid;
  gap: 14px;
}

.connect-summary-grid {
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
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
  color: var(--text);
  font: inherit;
  font-size: 0.86rem;
  font-weight: 700;
}

.copy-button:hover,
.copy-button:focus-visible {
  outline: none;
  background: rgba(56, 165, 255, 0.12);
}

.client-matrix {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.client-chip {
  display: grid;
  gap: 4px;
  padding: 12px 12px 11px;
  border-radius: 16px;
  border: 1px solid rgba(159, 192, 245, 0.12);
  background: rgba(255, 255, 255, 0.03);
  color: var(--text);
  text-align: left;
}

.client-chip span {
  font-size: 0.9rem;
  font-weight: 650;
}

.client-chip strong {
  font-size: 0.7rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
}

.client-chip.active {
  border-color: rgba(97, 217, 255, 0.44);
  background: rgba(56, 165, 255, 0.1);
}

.client-detail-shell {
  display: grid;
  gap: 10px;
}

.empty-state {
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px dashed rgba(159, 192, 245, 0.18);
  color: var(--muted);
}

.tools-panel {
  display: grid;
  gap: 14px;
}

.tool-table {
  display: grid;
  gap: 8px;
}

.tool-row {
  display: grid;
  grid-template-columns: minmax(0, 240px) minmax(0, 1fr) auto;
  gap: 14px;
  align-items: center;
  width: 100%;
  padding: 11px 0;
  border: 0;
  border-top: 1px solid rgba(159, 192, 245, 0.14);
  background: transparent;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}

.tool-name {
  font-size: 0.9rem;
  font-weight: 700;
}

.tool-summary {
  color: var(--muted);
  line-height: 1.45;
}

.tool-row:first-child {
  border-top: 0;
}

.tool-row:hover,
.tool-row:focus-visible,
.tool-row.active {
  outline: none;
  background: rgba(56, 165, 255, 0.04);
}

.tool-arrow {
  color: var(--aion-accent-2, #6bd5ff);
  font-size: 1.2rem;
  line-height: 1;
}

.tool-detail-panel {
  display: grid;
  gap: 8px;
  padding: 14px 16px;
  border-top: 1px solid rgba(159, 192, 245, 0.14);
  background: rgba(255, 255, 255, 0.02);
}

.tool-detail-header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 12px;
}

.tool-detail-header h3 {
  margin: 4px 0 0;
  font-size: 1rem;
}

.tool-detail-hint {
  color: var(--muted);
  font-size: 0.75rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  text-align: right;
}

.tool-detail-summary,
.tool-detail-copy {
  margin: 0;
  color: var(--muted);
  line-height: 1.55;
}

.rule-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.rule-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.rule-chip {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.04);
}

.rule-chip strong {
  font-size: 0.72rem;
  letter-spacing: 0.1em;
}

.rule-chip small {
  color: var(--muted);
  max-width: 24ch;
}

.rule-chip.muted {
  background: rgba(255, 255, 255, 0.025);
}

.account-panel {
  display: grid;
  gap: 16px;
}

code {
  padding: 0.15rem 0.38rem;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  color: #d2f6ff;
  font-size: 0.92em;
}

:deep(.activity-card),
:deep(.credential-card),
:deep(.danger-zone),
:deep(.client-guide-card) {
  border-radius: 18px;
}

:deep(.activity-card),
:deep(.credential-card) {
  padding: 16px;
}

:deep(.activity-header),
:deep(.credential-header) {
  margin-bottom: 12px;
}

:deep(.activity-row) {
  grid-template-columns: 132px minmax(0, 1fr) 116px 76px;
}

:deep(.activity-row strong) {
  font-size: 0.88rem;
}

:deep(.activity-list.compact .activity-row) {
  padding-block: 10px;
}

:deep(.activity-actions) {
  display: flex;
  gap: 10px;
  align-items: center;
}

:deep(.client-guide-card) {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid rgba(82, 239, 217, 0.14);
  background:
    linear-gradient(180deg, rgba(11, 17, 32, 0.94), rgba(7, 11, 20, 0.98)),
    radial-gradient(circle at top left, rgba(56, 165, 255, 0.07), transparent 42%);
}

:deep(.guide-header) {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 12px;
}

:deep(.guide-header h3) {
  margin: 4px 0 0;
  font-size: 1rem;
  line-height: 1.1;
}

:deep(.guide-meta-chip) {
  display: grid;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.05);
  min-width: 128px;
  text-align: right;
}

:deep(.guide-summary) {
  color: var(--muted);
  line-height: 1.55;
}

:deep(.guide-matrix) {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
}

:deep(.guide-matrix div) {
  min-width: 0;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.03);
}

:deep(.guide-matrix .wide) {
  grid-column: 1 / -1;
}

:deep(.guide-matrix dt) {
  margin: 0 0 6px;
  font-size: 0.7rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--aion-accent-2, #6bd5ff);
}

:deep(.guide-matrix dd) {
  margin: 0;
  color: var(--text);
  line-height: 1.5;
  overflow-wrap: anywhere;
}

:deep(.guide-accordion) {
  display: grid;
  gap: 8px;
}

:deep(.guide-accordion details) {
  border-top: 1px solid rgba(159, 192, 245, 0.12);
  padding-top: 8px;
}

:deep(.guide-accordion summary) {
  cursor: pointer;
  list-style: none;
  font-size: 0.76rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--aion-accent-2, #6bd5ff);
}

:deep(.guide-accordion summary::-webkit-details-marker) {
  display: none;
}

:deep(.guide-accordion .guide-step-list),
:deep(.guide-accordion .guide-bullets) {
  margin: 8px 0 0;
  padding-left: 18px;
  color: var(--muted);
  line-height: 1.55;
}

:deep(.guide-accordion .guide-text) {
  margin: 8px 0 0;
  color: var(--muted);
  line-height: 1.55;
}

:deep(.guide-footer) {
  display: grid;
  gap: 8px;
}

:deep(.guide-source-label) {
  font-size: 0.7rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--aion-accent-2, #6bd5ff);
}

:deep(.source-list) {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  padding-left: 0;
  margin: 0;
  list-style: none;
}

:deep(.source-list a) {
  color: var(--text);
  text-decoration: underline;
  text-decoration-color: rgba(82, 239, 217, 0.35);
}

:deep(.credential-card) {
  display: grid;
  gap: 12px;
}

:deep(.credential-row) {
  grid-template-columns: minmax(0, 0.65fr) minmax(0, 1fr) auto;
  padding: 12px 14px;
}

:deep(.credential-main strong) {
  font-size: 0.92rem;
}

:deep(.credential-meta) {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

:deep(.danger-zone) {
  padding: 14px;
}

:deep(.danger-header) {
  gap: 10px;
  margin-bottom: 12px;
}

:deep(.danger-copy) {
  max-width: 58ch;
}

:deep(.danger-form) {
  display: grid;
  gap: 12px;
}

:deep(.field) {
  display: grid;
  gap: 8px;
}

:deep(.field input) {
  min-height: 42px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text);
}

:deep(.field input:focus) {
  outline: 1px solid rgba(97, 217, 255, 0.45);
  outline-offset: 1px;
}

:deep(.error) {
  margin: 0;
  color: #ffd7dc;
}

.portal-mobile-nav {
  position: sticky;
  top: 12px;
  z-index: 2;
  display: none;
  gap: 8px;
  margin-bottom: 14px;
  padding: 8px 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.portal-mobile-nav::-webkit-scrollbar {
  display: none;
}

.nav-link--mobile {
  flex: 0 0 auto;
  min-height: 38px;
  padding: 0 2px 6px 0;
}

@media (max-width: 1080px) {
  .portal-layout {
    grid-template-columns: 184px minmax(0, 1fr);
  }

  .client-matrix {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .summary-grid,
  .account-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .rule-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .portal-topbar {
    align-items: start;
    gap: 12px;
  }

  .statusline {
    justify-content: start;
  }

  .portal-nav {
    display: none;
  }

  .portal-mobile-nav {
    display: flex;
  }

  .portal-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .section-heading,
  .connect-summary-grid,
  .summary-grid,
  .account-summary,
  .rule-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .section-heading {
    display: grid;
  }

  .section-copy {
    text-align: left;
    max-width: none;
  }

  .client-matrix {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .tool-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
  }

  .tool-arrow {
    display: none;
  }

  .mini-activity-row,
  :deep(.activity-row),
  :deep(.credential-row) {
    grid-template-columns: minmax(0, 1fr);
  }

  :deep(.activity-head),
  :deep(.credential-head) {
    display: none;
  }

  :deep(.activity-card),
  :deep(.credential-card),
  :deep(.danger-zone),
  :deep(.client-guide-card),
  .tool-detail-panel {
    padding-inline: 14px;
  }

  :deep(.guide-header),
  :deep(.credential-header),
  :deep(.activity-header),
  :deep(.danger-header),
  .tool-detail-header {
    display: grid;
  }

  :deep(.guide-meta-chip) {
    min-width: 0;
    justify-self: start;
    text-align: left;
  }
}

@media (max-width: 640px) {
  .portal-page {
    padding-top: 14px;
  }

  .portal-shell {
    width: min(100%, calc(100% - 24px));
  }

  .portal-topbar {
    flex-direction: column;
    align-items: start;
  }

  .statusline {
    gap: 8px;
  }

  .status-chip {
    min-width: 112px;
  }

  .brand-lockup p {
    font-size: 0.86rem;
  }

  .brand-lockup span {
    font-size: 0.76rem;
  }

  .summary-grid,
  .account-summary,
  .client-matrix {
    grid-template-columns: minmax(0, 1fr);
  }

  .mini-activity-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .tool-row,
  .tool-detail-panel {
    padding-inline: 0;
  }

  .tool-detail-panel {
    padding-top: 12px;
  }

  :deep(.activity-card),
  :deep(.credential-card),
  :deep(.danger-zone),
  :deep(.client-guide-card) {
    padding: 12px;
  }

  :deep(.guide-matrix) {
    grid-template-columns: minmax(0, 1fr);
  }

  :deep(.guide-matrix .wide) {
    grid-column: auto;
  }

  :deep(.guide-footer .source-list) {
    gap: 6px 10px;
  }
}

:deep(.button.danger) {
  background: rgba(255, 96, 120, 0.16);
  border-color: rgba(255, 96, 120, 0.28);
}

@media (max-width: 1120px) {
  .portal-layout {
    grid-template-columns: 1fr;
  }

  .portal-nav {
    position: sticky;
    top: 16px;
    display: flex;
    overflow-x: auto;
    white-space: nowrap;
    padding: 10px 0 8px;
    border-right: 0;
    border-bottom: 1px solid rgba(159, 192, 245, 0.16);
    background: linear-gradient(180deg, rgba(5, 9, 19, 0.98), rgba(5, 9, 19, 0.9));
    z-index: 3;
  }

  .nav-link {
    flex: 0 0 auto;
    padding: 8px 12px;
    border-left: 0;
    border-bottom: 2px solid transparent;
  }

  .nav-link:hover,
  .nav-link:focus-visible,
  .nav-link.active {
    border-bottom-color: #61d9ff;
    transform: none;
  }

  .client-matrix,
  .summary-grid,
  .account-summary,
  .rule-grid,
  .connect-summary-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .portal-topbar,
  .section-heading {
    flex-direction: column;
    align-items: start;
  }

  .section-copy {
    text-align: left;
  }

  .tool-disclosure summary {
    grid-template-columns: 1fr;
  }

  .tool-detail {
    padding-left: 0;
  }
}

@media (max-width: 720px) {
  .portal-page {
    padding-top: 16px;
  }

  .portal-shell {
    width: calc(100% - 28px);
  }

  .panel {
    padding-bottom: 30px;
  }

  .mini-activity-row,
  :deep(.activity-row) {
    grid-template-columns: 1fr;
  }

  :deep(.credential-row) {
    grid-template-columns: 1fr;
  }

  :deep(.credential-meta) {
    grid-template-columns: 1fr;
  }

  :deep(.guide-header) {
    flex-direction: column;
  }

  :deep(.guide-meta-chip) {
    width: 100%;
    text-align: left;
    min-width: 0;
  }
}
</style>
