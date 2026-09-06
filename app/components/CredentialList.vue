<script setup lang="ts">
interface CredentialItem {
  id: string
  oauthClientId: string
  status: 'ACTIVE' | 'REVOKED'
  issuedAt: string
  revokedAt: string | null
  lastUsedAt: string | null
}

const props = withDefaults(
  defineProps<{
    credentials: CredentialItem[]
    loading?: boolean
    error?: string
    busyCredentialId?: string | null
    revokeAllBusy?: boolean
  }>(),
  {
    loading: false,
    error: '',
    busyCredentialId: null,
    revokeAllBusy: false
  }
)

const emit = defineEmits<{
  revoke: [credentialId: string]
  revokeAll: []
}>()

function formatTimestamp(value: string | null): string {
  if (!value) return '—'
  return value.replace('T', ' ').replace('.000Z', ' UTC')
}
</script>

<template>
  <section class="credential-card">
    <header class="credential-header">
      <div>
        <p class="eyebrow">ACCOUNT</p>
        <h3>MCP credentials</h3>
      </div>
      <button
        class="button subtle"
        type="button"
        :disabled="revokeAllBusy || !credentials.some(item => item.status === 'ACTIVE')"
        @click="emit('revokeAll')"
      >
        {{ revokeAllBusy ? 'Revoking…' : 'Revoke all' }}
      </button>
    </header>

    <div v-if="loading" class="state" aria-live="polite">Loading credentials…</div>
    <div v-else-if="error" class="state error" role="alert">{{ error }}</div>
    <div v-else-if="!credentials.length" class="state empty">No MCP credential has been issued yet.</div>
    <div v-else class="credential-table">
      <div class="credential-head">
        <span>Credential</span>
        <span>Status</span>
        <span>Issued</span>
        <span>Last used</span>
        <span>Revoked</span>
        <span>Action</span>
      </div>
      <ul class="credential-list">
        <li v-for="credential in credentials" :key="credential.id" class="credential-row">
          <div class="credential-main">
            <strong>{{ credential.oauthClientId }}</strong>
          </div>
          <div class="credential-status" :data-status="credential.status">{{ credential.status }}</div>
          <div>{{ formatTimestamp(credential.issuedAt) }}</div>
          <div>{{ formatTimestamp(credential.lastUsedAt) }}</div>
          <div>{{ formatTimestamp(credential.revokedAt) }}</div>
          <button
            class="button danger"
            type="button"
            :disabled="busyCredentialId === credential.id || credential.status !== 'ACTIVE'"
            @click="emit('revoke', credential.id)"
          >
            {{ busyCredentialId === credential.id ? 'Revoking…' : 'Revoke' }}
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.credential-card {
  padding: 16px;
  border: 1px solid rgba(82, 239, 217, 0.16);
  border-radius: 20px;
  background:
    linear-gradient(180deg, rgba(11, 17, 32, 0.9), rgba(7, 11, 20, 0.94)),
    radial-gradient(circle at top left, rgba(82, 239, 217, 0.08), transparent 40%);
}

.credential-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.state {
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.03);
  color: var(--aion-muted);
}

.state.error {
  color: #ffd7dc;
  background: rgba(255, 96, 120, 0.12);
}

.state.empty {
  border: 1px dashed rgba(82, 239, 217, 0.18);
}

.credential-table {
  display: grid;
  gap: 10px;
}

.credential-head {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 0.55fr) repeat(3, minmax(0, 0.8fr)) auto;
  gap: 12px;
  padding: 0 14px;
  color: var(--aion-muted);
  font-size: 0.7rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.credential-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.credential-row {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 0.55fr) repeat(3, minmax(0, 0.8fr)) auto;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.03);
}

.credential-main {
  min-width: 0;
}

.credential-main strong {
  font-size: 0.88rem;
  overflow-wrap: anywhere;
}

.credential-status {
  font-size: 0.74rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--aion-accent-2);
}

.credential-status[data-status='REVOKED'] {
  color: #ff8f9c;
}

@media (max-width: 900px) {
  .credential-header {
    flex-direction: column;
    align-items: start;
  }

  .credential-row {
    grid-template-columns: 1fr;
  }

  .credential-head {
    display: none;
  }
}
</style>
