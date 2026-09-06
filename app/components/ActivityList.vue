<script setup lang="ts">
interface ActivityItem {
  id: string
  createdAt: string
  toolName: string
  outcome: 'SUCCESS' | 'FAILURE'
  durationMs: number | null
  credentialId: string | null
  credentialLabel?: string | null
}

const props = withDefaults(
  defineProps<{
    title: string
    description?: string
    items: ActivityItem[]
    loading?: boolean
    error?: string
    emptyMessage?: string
    compact?: boolean
  }>(),
  {
    description: '',
    loading: false,
    error: '',
    emptyMessage: 'No activity yet.',
    compact: false
  }
)

function formatTimestamp(value: string): string {
  return value.replace('T', ' ').replace('.000Z', ' UTC')
}

function formatDuration(value: number | null): string {
  if (value == null) return '—'
  return `${value} ms`
}
</script>

<template>
  <section class="activity-card">
    <header class="activity-header">
      <div>
        <p class="eyebrow">ACTIVITY</p>
        <h3>{{ title }}</h3>
      </div>
      <p v-if="description" class="activity-description">{{ description }}</p>
    </header>

    <div v-if="loading" class="state" aria-live="polite">Loading activity…</div>
    <div v-else-if="error" class="state error" role="alert">{{ error }}</div>
    <div v-else-if="!items.length" class="state empty">{{ emptyMessage }}</div>
    <ul v-else class="activity-list" :class="{ compact }">
      <li v-for="item in items" :key="item.id" class="activity-row">
        <div class="activity-timestamp">{{ formatTimestamp(item.createdAt) }}</div>
        <div class="activity-main">
          <strong>{{ item.toolName }}</strong>
          <span class="activity-meta">
            {{ item.outcome }}
            <template v-if="item.credentialLabel || item.credentialId">
              <span class="dot" aria-hidden="true">·</span>
              <span>
                {{
                  item.credentialLabel ??
                  (item.credentialId ? `credential ${item.credentialId.slice(0, 8)}` : 'credential unavailable')
                }}
              </span>
            </template>
          </span>
        </div>
        <div class="activity-duration">{{ formatDuration(item.durationMs) }}</div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.activity-card {
  padding: 20px;
  border: 1px solid rgba(82, 239, 217, 0.16);
  border-radius: 22px;
  background:
    linear-gradient(180deg, rgba(11, 17, 32, 0.9), rgba(7, 11, 20, 0.94)),
    radial-gradient(circle at top left, rgba(56, 165, 255, 0.08), transparent 40%);
}

.activity-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.activity-description {
  max-width: 32ch;
  margin: 0;
  color: var(--aion-muted);
  font-size: 0.86rem;
  line-height: 1.5;
  text-align: right;
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

.activity-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.activity-row {
  display: grid;
  grid-template-columns: 140px minmax(0, 1fr) 96px;
  gap: 12px;
  align-items: center;
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.03);
}

.activity-list.compact .activity-row {
  padding-block: 12px;
}

.activity-timestamp,
.activity-duration,
.activity-meta {
  font-size: 0.82rem;
  color: var(--aion-muted);
}

.activity-main {
  display: grid;
  gap: 4px;
}

.activity-main strong {
  font-size: 0.95rem;
  font-weight: 700;
}

.activity-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.dot {
  color: var(--aion-accent-2);
}

@media (max-width: 800px) {
  .activity-header {
    flex-direction: column;
    align-items: start;
  }

  .activity-description {
    text-align: left;
  }

  .activity-row {
    grid-template-columns: 1fr;
    gap: 8px;
  }
}
</style>
