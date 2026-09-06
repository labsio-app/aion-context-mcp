<script setup lang="ts">
type AdminFilter = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED' | 'ALL'

interface AdminIdentity {
  id: string
  discordUserId: string
  displayName: string
}

interface ReviewRecord {
  request: {
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
  identity: {
    id: string
    discordUserId: string
    username: string
    globalName: string | null
    avatar: string | null
    displayName: string
    createdAt: string
    updatedAt: string
  }
}

interface AdminListResponse {
  admin: AdminIdentity
  filter: AdminFilter
  requests: ReviewRecord[]
}

interface AdminDetailResponse {
  admin: AdminIdentity
  request: ReviewRecord
}

interface AdminActionResponse {
  admin: AdminIdentity
  request: ReviewRecord
  decision: {
    id: string
    betaAccessRequestId: string
    adminDiscordIdentityId: string
    fromStatus: ReviewRecord['request']['status']
    toStatus: ReviewRecord['request']['status']
    reason: string | null
    createdAt: string
  }
}

interface McpLogFileRecord {
  name: string
  sizeBytes: number
  modifiedAt: string
  downloadUrl: string
}

const filters: AdminFilter[] = ['PENDING', 'APPROVED', 'REJECTED', 'REVOKED', 'ALL']
const filter = ref<AdminFilter>('PENDING')
const admin = ref<AdminIdentity | null>(null)
const requests = ref<ReviewRecord[]>([])
const selected = ref<ReviewRecord | null>(null)
const loading = ref(false)
const detailLoading = ref(false)
const actionBusy = ref(false)
const error = ref('')
const success = ref('')
const accessDenied = ref(false)
const decisionReason = ref('')
const pendingDecision = ref<null | 'reject' | 'revoke'>(null)
const mcpLogs = ref<McpLogFileRecord[]>([])
const mcpLogsLoading = ref(false)
const mcpLogsError = ref('')

function setSelected(next: ReviewRecord | null) {
  selected.value = next
  decisionReason.value = ''
  pendingDecision.value = null
}

function normalizeError(cause: any, fallback: string): string {
  const statusMessage = String(cause?.data?.statusMessage ?? '')
  if (statusMessage === 'reason_required') return 'A reason is required for this decision.'
  if (statusMessage === 'beta_access_request_not_found') return 'The selected request no longer exists.'
  if (statusMessage === 'invalid_beta_access_transition') {
    return 'This decision is no longer valid for the current status.'
  }
  if (statusMessage === 'Forbidden') return 'You are not authorized to access the admin review.'
  if (statusMessage === 'Unauthorized') return 'You must sign in with Discord first.'
  return statusMessage || fallback
}

async function loadRequests() {
  loading.value = true
  error.value = ''
  accessDenied.value = false
  success.value = ''
  try {
    const payload = await $fetch<AdminListResponse>('/api/admin/beta-requests', {
      query: { status: filter.value }
    })
    admin.value = payload.admin
    requests.value = payload.requests

    if (selected.value) {
      const nextSelected = requests.value.find(item => item.request.id === selected.value?.request.id)
      if (nextSelected) {
        setSelected(nextSelected)
      } else if (requests.value[0]) {
        await loadDetail(requests.value[0].request.id)
      }
    } else if (requests.value[0]) {
      await loadDetail(requests.value[0].request.id)
    } else {
      setSelected(null)
    }
  } catch (cause: any) {
    const status = Number(cause?.statusCode ?? cause?.response?.status ?? cause?.data?.statusCode ?? 0)
    if (status === 401 || status === 403) {
      accessDenied.value = true
      return
    }

    error.value = normalizeError(cause, 'Could not load the admin queue.')
  } finally {
    loading.value = false
  }
}

async function loadDetail(id: string) {
  if (!id) {
    setSelected(null)
    return
  }

  detailLoading.value = true
  error.value = ''
  try {
    const payload = await $fetch<AdminDetailResponse>(`/api/admin/beta-requests/${id}`)
    admin.value = payload.admin
    setSelected(payload.request)
  } catch (cause: any) {
    error.value = normalizeError(cause, 'Could not load the selected request.')
  } finally {
    detailLoading.value = false
  }
}

async function performDecision(action: 'approve' | 'reject' | 'revoke') {
  if (!selected.value || actionBusy.value) return

  const currentId = selected.value.request.id
  const target =
    action === 'approve'
      ? `/api/admin/beta-requests/${currentId}/approve`
      : action === 'reject'
        ? `/api/admin/beta-requests/${currentId}/reject`
        : `/api/admin/beta-requests/${currentId}/revoke`

  if ((action === 'reject' || action === 'revoke') && !decisionReason.value.trim()) {
    error.value = 'A reason is required.'
    return
  }

  actionBusy.value = true
  error.value = ''
  success.value = ''
  try {
    const payload = await $fetch<AdminActionResponse>(target, {
      method: 'POST',
      body:
        action === 'approve'
          ? undefined
          : {
              reason: decisionReason.value
            }
    })

    admin.value = payload.admin
    success.value = `Decision saved. Status is now ${payload.request.request.status}.`
    decisionReason.value = ''
    await loadRequests()
    setSelected(payload.request)
  } catch (cause: any) {
    error.value = normalizeError(cause, 'Could not save the decision.')
  } finally {
    actionBusy.value = false
    if (action === 'reject' || action === 'revoke') {
      pendingDecision.value = null
    }
  }
}

function beginDecision(action: 'reject' | 'revoke') {
  pendingDecision.value = action
  error.value = ''
  success.value = ''
}

function cancelDecision() {
  pendingDecision.value = null
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${index === 0 || value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[index]}`
}

async function loadMcpLogs() {
  mcpLogsLoading.value = true
  mcpLogsError.value = ''
  try {
    const payload = await $fetch<{ files: McpLogFileRecord[] }>('/api/admin/mcp-logs')
    mcpLogs.value = payload.files
  } catch (cause: any) {
    const status = Number(cause?.statusCode ?? cause?.response?.status ?? cause?.data?.statusCode ?? 0)
    if (status === 401 || status === 403) {
      accessDenied.value = true
      return
    }

    mcpLogsError.value = normalizeError(cause, 'Could not load MCP log files.')
  } finally {
    mcpLogsLoading.value = false
  }
}

watch(filter, async () => {
  await loadRequests()
})

onMounted(() => {
  void loadRequests()
  void loadMcpLogs()
})
</script>

<template>
  <main class="admin-shell">
    <div class="atmosphere atmosphere-cyan" aria-hidden="true" />
    <div class="atmosphere atmosphere-violet" aria-hidden="true" />
    <section class="admin-surface">
      <header class="admin-header">
        <div>
          <NuxtLink class="brand" to="/" aria-label="Aion Theory MCP home">
            <img class="brand-mark" src="/mark/aion-theory-mark-small.png" alt="" />
            <span class="brand-name">AION THEORY <small>MCP</small></span>
          </NuxtLink>
          <p class="eyebrow">PRIVATE BETA · ADMIN</p>
          <h1>Beta review console</h1>
          <p class="lede">
            Discord-authenticated review only. Manual decisions are persisted and audited.
          </p>
        </div>

        <div class="admin-chip" aria-label="Current admin">
          <span>Signed in as</span>
          <strong>{{ admin?.displayName ?? 'Loading…' }}</strong>
          <small>{{ admin?.discordUserId ?? 'Awaiting identity' }}</small>
        </div>
      </header>

      <p v-if="accessDenied" class="notice" role="alert">
        Access denied. Sign in with an approved Discord identity to view private beta requests.
      </p>
      <p v-else-if="error" class="notice error" role="alert">{{ error }}</p>
      <p v-else-if="success" class="notice success" role="status">{{ success }}</p>

      <div class="toolbar">
        <label class="field">
          <span>Filter</span>
          <select v-model="filter">
            <option v-for="item in filters" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>

        <div class="toolbar-actions">
          <button class="ghost" type="button" :disabled="loading" @click="loadRequests">
            {{ loading ? 'Refreshing…' : 'Refresh' }}
          </button>
          <button class="ghost" type="button" :disabled="mcpLogsLoading" @click="loadMcpLogs">
            {{ mcpLogsLoading ? 'Refreshing logs…' : 'Refresh logs' }}
          </button>
        </div>
      </div>

      <section class="logs-panel">
        <div class="panel-title">
          <span>MCP logs</span>
          <strong>{{ mcpLogs.length }}</strong>
        </div>

        <p class="logs-copy">
          Structured JSONL files written on disk by the MCP server. Download them for debugging and
          perf analysis.
        </p>

        <p v-if="mcpLogsError" class="notice error inline" role="alert">{{ mcpLogsError }}</p>
        <div v-else-if="mcpLogsLoading" class="empty">Loading MCP log files…</div>
        <div v-else-if="!mcpLogs.length" class="empty neutral">No MCP log files yet.</div>
        <div v-else class="logs-list">
          <a
            v-for="file in mcpLogs"
            :key="file.name"
            class="log-row"
            :href="file.downloadUrl"
          >
            <strong>{{ file.name }}</strong>
            <span>{{ formatBytes(file.sizeBytes) }}</span>
            <small>{{ file.modifiedAt }}</small>
            <em>Download</em>
          </a>
        </div>
      </section>

      <div class="grid">
        <aside class="list-panel">
          <div class="panel-title">
            <span>Requests</span>
            <strong>{{ requests.length }}</strong>
          </div>

          <div v-if="loading" class="empty">Loading beta requests…</div>
          <div v-else-if="!requests.length" class="empty">No requests for this filter.</div>
          <button
            v-for="item in requests"
            :key="item.request.id"
            type="button"
            class="request-item"
            :class="{ active: selected?.request.id === item.request.id }"
            @click="loadDetail(item.request.id)"
          >
            <div class="request-item-top">
              <strong>{{ item.request.displayName }}</strong>
              <span>{{ item.request.status }}</span>
            </div>
            <p>{{ item.identity.displayName }} · {{ item.identity.discordUserId }}</p>
            <small>{{ item.request.createdAt }}</small>
          </button>
        </aside>

        <section class="detail-panel">
          <div class="panel-title">
            <span>Detail</span>
            <strong>{{ selected?.request.status ?? 'None' }}</strong>
          </div>

          <div v-if="detailLoading" class="empty">Loading request detail…</div>
          <div v-else-if="!selected" class="empty">Select a request to review.</div>

          <template v-else>
            <dl class="detail-grid">
              <div>
                <dt>Identity</dt>
                <dd>{{ selected.identity.displayName }}</dd>
              </div>
              <div>
                <dt>Discord user</dt>
                <dd><code>{{ selected.identity.discordUserId }}</code></dd>
              </div>
              <div>
                <dt>Request date</dt>
                <dd>{{ selected.request.createdAt }}</dd>
              </div>
              <div>
                <dt>Current status</dt>
                <dd>{{ selected.request.status }}</dd>
              </div>
              <div class="span-2">
                <dt>Why join</dt>
                <dd>{{ selected.request.motivation }}</dd>
              </div>
              <div class="span-2">
                <dt>Intended usage</dt>
                <dd>{{ selected.request.intendedUsage }}</dd>
              </div>
              <div class="span-2">
                <dt>AION profile / experience</dt>
                <dd>{{ selected.request.aionProfile || 'Not provided' }}</dd>
              </div>
              <div class="span-2">
                <dt>Expected MCP clients</dt>
                <dd>
                  <span v-if="selected.request.expectedClients.length">
                    {{ selected.request.expectedClients.join(', ') }}
                  </span>
                  <span v-else>Not provided</span>
                </dd>
              </div>
            </dl>

            <div class="actions">
              <button
                v-if="selected.request.status === 'PENDING'"
                type="button"
                class="primary"
                :disabled="actionBusy"
                @click="performDecision('approve')"
              >
                Approve
              </button>
              <button
                v-if="selected.request.status === 'PENDING'"
                type="button"
                class="ghost danger"
                :disabled="actionBusy"
                @click="beginDecision('reject')"
              >
                Reject
              </button>
              <button
                v-if="selected.request.status === 'APPROVED'"
                type="button"
                class="ghost danger"
                :disabled="actionBusy"
                @click="beginDecision('revoke')"
              >
                Revoke access
              </button>
            </div>

            <div
              v-if="selected.request.status === 'PENDING' || selected.request.status === 'APPROVED'"
              class="decision-box"
            >
              <p v-if="pendingDecision === 'reject'" class="confirm-copy">
                Confirm rejection for this request. A reason is required before saving the decision.
              </p>
              <p v-else-if="pendingDecision === 'revoke'" class="confirm-copy">
                Confirm revocation for this request. A reason is required before saving the decision.
              </p>
              <label class="field">
                <span>Decision reason</span>
                <textarea
                  v-model="decisionReason"
                  rows="4"
                  maxlength="2000"
                  placeholder="Required for reject / revoke. Leave empty for approve."
                />
              </label>

              <div v-if="pendingDecision" class="confirm-actions">
                <button
                  type="button"
                  class="primary"
                  :disabled="actionBusy"
                  @click="performDecision(pendingDecision)"
                >
                  {{ pendingDecision === 'reject' ? 'Confirm reject' : 'Confirm revoke' }}
                </button>
                <button type="button" class="ghost" :disabled="actionBusy" @click="cancelDecision">
                  Cancel
                </button>
              </div>
            </div>

            <p
              v-if="selected.request.status === 'REJECTED' || selected.request.status === 'REVOKED'"
              class="empty neutral"
            >
              No further actions are available for this request.
            </p>
          </template>
        </section>
      </div>
    </section>
  </main>
</template>

<style scoped>
.admin-shell {
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

.atmosphere { position: absolute; width: 38rem; height: 38rem; border-radius: 50%; pointer-events: none; filter: blur(34px); opacity: 0.55; }
.atmosphere-cyan { top: 8rem; left: -24rem; background: radial-gradient(circle, rgba(52, 200, 255, 0.3), transparent 68%); }
.atmosphere-violet { top: 5rem; right: -20rem; background: radial-gradient(circle, rgba(128, 91, 255, 0.31), transparent 68%); }

.admin-surface {
  position: relative;
  z-index: 1;
  width: min(1200px, calc(100% - 48px));
  margin: 0 auto;
  padding: 0;
}

.admin-header {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  align-items: flex-start;
  margin-bottom: 52px;
}

.brand { display: inline-flex; align-items: center; gap: 10px; margin-bottom: 58px; color: #ddecff; text-decoration: none; }
.brand-mark { width: 38px; height: 38px; filter: drop-shadow(0 0 11px rgba(75, 195, 255, 0.6)); }
.brand-name { display: grid; font-family: Georgia, serif; font-size: 0.92rem; letter-spacing: 0.13em; line-height: 0.9; }
.brand-name small { margin-top: 4px; font-family: inherit; font-size: 0.52em; letter-spacing: 0.52em; text-align: center; }

.admin-header h1 {
  margin: 8px 0 12px;
  font-size: clamp(2.2rem, 4vw, 4rem);
  line-height: 0.95;
}

.lede {
  margin: 0;
  max-width: 68ch;
  color: var(--aion-muted);
  line-height: 1.65;
}

.admin-chip {
  min-width: 240px;
  padding: 12px 0 0 24px;
  border-left: 1px solid rgba(107, 213, 255, 0.4);
  background: transparent;
  color: var(--aion-muted);
  display: grid;
  gap: 6px;
}

.admin-chip strong {
  color: var(--aion-text);
  font-size: 1rem;
}

.notice {
  margin: 0 0 16px;
  padding: 14px 0;
  border-left: 1px solid rgba(107, 213, 255, 0.55);
  background: transparent;
  color: var(--aion-muted);
}

.notice.error {
  color: #ffb6b6;
}

.notice.success {
  color: #b8ffe9;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: end;
  margin-bottom: 26px;
  padding-bottom: 18px;
  border-bottom: 1px solid rgba(159, 192, 245, 0.14);
}

.toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}

.field {
  display: grid;
  gap: 8px;
}

.field span {
  color: var(--aion-text);
  font-size: 0.88rem;
  font-weight: 700;
}

.field select,
.field textarea {
  width: 100%;
  border: 0;
  border-bottom: 1px solid rgba(81, 176, 255, 0.24);
  border-radius: 0;
  background: rgba(4, 7, 16, 0.35);
  color: var(--aion-text);
  padding: 12px 14px;
}

.ghost,
.primary {
  border-radius: 0;
  padding: 12px 16px;
  border: 0;
  border-bottom: 1px solid rgba(81, 176, 255, 0.35);
  background: transparent;
  color: var(--aion-text);
}

.primary {
  border-color: rgba(82, 239, 217, 0.7);
  background: linear-gradient(135deg, rgba(56, 165, 255, 0.92), rgba(82, 239, 217, 0.9));
  color: #04111c;
  font-weight: 800;
}

.danger {
  border-color: rgba(255, 101, 101, 0.32);
}

.ghost:disabled,
.primary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.logs-panel {
  margin-bottom: 18px;
  padding: 16px 0 18px;
  border-top: 1px solid rgba(159, 192, 245, 0.14);
  border-bottom: 1px solid rgba(159, 192, 245, 0.14);
}

.logs-copy {
  margin: 8px 0 14px;
  max-width: 72ch;
  color: var(--aion-muted);
  line-height: 1.55;
}

.notice.inline {
  margin-bottom: 14px;
}

.logs-list {
  display: grid;
  gap: 8px;
}

.log-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 96px 220px auto;
  gap: 12px;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid rgba(159, 192, 245, 0.12);
  color: var(--aion-text);
  text-decoration: none;
}

.log-row:last-child {
  border-bottom: 0;
}

.log-row strong {
  font-size: 0.98rem;
}

.log-row span,
.log-row small,
.log-row em {
  color: var(--aion-muted);
  font-style: normal;
}

.log-row em {
  justify-self: end;
}

.grid {
  display: grid;
  grid-template-columns: 0.9fr 1.1fr;
  gap: 18px;
}

.list-panel,
.detail-panel {
  min-height: 620px;
  padding: 0 24px 0 0;
  border: 0;
  background: transparent;
}

.detail-panel { padding: 0 0 0 34px; border-left: 1px solid rgba(159, 192, 245, 0.16); }

.panel-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  color: var(--aion-muted);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 0.75rem;
}

.panel-title strong {
  color: var(--aion-text);
  letter-spacing: 0.06em;
}

.request-item {
  display: grid;
  gap: 8px;
  width: 100%;
  margin: 0;
  padding: 16px 0;
  border: 0;
  border-bottom: 1px solid rgba(159, 192, 245, 0.14);
  background: transparent;
  color: var(--aion-text);
  text-align: left;
}

.request-item.active {
  border-bottom-color: rgba(82, 239, 217, 0.7);
  background: linear-gradient(90deg, rgba(56, 165, 255, 0.1), transparent);
}

.request-item-top {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.request-item p,
.request-item small {
  margin: 0;
  color: var(--aion-muted);
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin: 0;
}

.detail-grid dt {
  color: var(--aion-muted);
  font-size: 0.74rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  margin-bottom: 8px;
}

.detail-grid dd {
  margin: 0;
  color: var(--aion-text);
  line-height: 1.6;
  word-break: break-word;
}

.span-2 {
  grid-column: span 2;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 18px;
}

.decision-box {
  margin-top: 18px;
}

.confirm-copy {
  margin: 0 0 12px;
  color: var(--aion-muted);
  line-height: 1.6;
}

.confirm-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 14px;
}

.empty {
  padding: 18px 0;
  border-bottom: 1px dashed rgba(81, 176, 255, 0.2);
  color: var(--aion-muted);
  line-height: 1.6;
}

.neutral {
  margin-top: 18px;
}

@media (max-width: 1080px) {
  .admin-header,
  .toolbar,
  .grid {
    grid-template-columns: 1fr;
    display: grid;
  }

  .admin-header {
    justify-content: stretch;
  }

  .admin-chip {
    min-width: 0;
  }

  .detail-grid {
    grid-template-columns: 1fr;
  }

  .span-2 {
    grid-column: span 1;
  }

  .detail-panel {
    padding: 28px 0 0;
    border-top: 1px solid rgba(159, 192, 245, 0.16);
    border-left: 0;
  }

  .log-row {
    grid-template-columns: 1fr;
    gap: 6px;
  }

  .log-row em {
    justify-self: start;
  }
}

@media (max-width: 560px) {
  .admin-shell { padding-top: 18px; }
  .admin-surface { width: min(100% - 32px, 520px); }
  .admin-header { margin-bottom: 36px; }
  .brand { margin-bottom: 42px; }
  .admin-header h1 { font-size: clamp(2.5rem, 13vw, 3.6rem); }
  .admin-chip { padding-left: 14px; }
  .toolbar { align-items: stretch; grid-template-columns: 1fr; }
  .toolbar .ghost { justify-self: start; }
  .list-panel, .detail-panel { min-height: 0; }
}
</style>
