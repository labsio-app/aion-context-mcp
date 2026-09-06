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
    <ul v-else class="credential-list">
      <li v-for="credential in credentials" :key="credential.id" class="credential-row">
        <div class="credential-main">
          <strong>{{ credential.oauthClientId }}</strong>
          <span>{{ credential.status }}</span>
        </div>
        <dl class="credential-meta">
          <div>
            <dt>Issued</dt>
            <dd>{{ formatTimestamp(credential.issuedAt) }}</dd>
          </div>
          <div>
            <dt>Last used</dt>
            <dd>{{ formatTimestamp(credential.lastUsedAt) }}</dd>
          </div>
          <div>
            <dt>Revoked</dt>
            <dd>{{ formatTimestamp(credential.revokedAt) }}</dd>
          </div>
        </dl>
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
  </section>
</template>

<style scoped>
.credential-card {
  padding: 20px;
  border: 1px solid rgba(82, 239, 217, 0.16);
  border-radius: 22px;
  background:
    linear-gradient(180deg, rgba(11, 17, 32, 0.9), rgba(7, 11, 20, 0.94)),
    radial-gradient(circle at top left, rgba(82, 239, 217, 0.08), transparent 40%);
}

.credential-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.state {
  padding: 18px;
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

.credential-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 12px;
}

.credential-row {
  display: grid;
  grid-template-columns: minmax(0, 0.7fr) minmax(0, 1fr) auto;
  gap: 14px;
  align-items: center;
  padding: 16px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.03);
}

.credential-main {
  display: grid;
  gap: 4px;
}

.credential-main strong {
  font-size: 0.95rem;
}

.credential-main span {
  font-size: 0.8rem;
  color: var(--aion-muted);
}

.credential-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
}

.credential-meta div {
  min-width: 0;
}

.credential-meta dt {
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--aion-accent-2);
}

.credential-meta dd {
  margin: 4px 0 0;
  font-size: 0.82rem;
  color: var(--aion-muted);
}

@media (max-width: 900px) {
  .credential-header {
    flex-direction: column;
    align-items: start;
  }

  .credential-row {
    grid-template-columns: 1fr;
  }

  .credential-meta {
    grid-template-columns: 1fr;
  }
}
</style>
