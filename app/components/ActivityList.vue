<script setup lang="ts">
import { computed, ref, watch } from 'vue'

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
    maxVisible?: number
  }>(),
  {
    description: '',
    loading: false,
    error: '',
    emptyMessage: 'No activity yet.',
    compact: false,
    maxVisible: undefined
  }
)

function formatTimestamp(value: string): string {
  return value.replace('T', ' ').replace('.000Z', ' UTC')
}

function formatDuration(value: number | null): string {
  if (value == null) return '—'
  return `${value} ms`
}

const showAll = ref(false)

const visibleItems = computed(() => {
  if (!props.maxVisible || showAll.value || props.items.length <= props.maxVisible) {
    return props.items
  }

  return props.items.slice(0, props.maxVisible)
})

const canToggle = computed(
  () => Boolean(props.maxVisible) && props.items.length > (props.maxVisible ?? 0)
)

watch(
  () => props.items,
  () => {
    showAll.value = false
  }
)
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
    <div v-else class="activity-table">
      <div class="activity-head" :class="{ compact }">
        <span>Time</span>
        <span>Tool</span>
        <span>Result</span>
        <span>Duration</span>
      </div>
      <ul class="activity-list" :class="{ compact }">
        <li v-for="item in visibleItems" :key="item.id" class="activity-row">
          <div class="activity-timestamp">{{ formatTimestamp(item.createdAt) }}</div>
          <div class="activity-main">
            <strong>{{ item.toolName }}</strong>
            <span v-if="item.credentialLabel || item.credentialId" class="activity-meta">
              {{
                item.credentialLabel ??
                (item.credentialId ? `credential ${item.credentialId.slice(0, 8)}` : 'credential unavailable')
              }}
            </span>
          </div>
          <div class="activity-result" :data-outcome="item.outcome">{{ item.outcome }}</div>
          <div class="activity-duration">{{ formatDuration(item.durationMs) }}</div>
        </li>
      </ul>

      <button v-if="canToggle" class="activity-toggle" type="button" @click="showAll = !showAll">
        {{ showAll ? 'Show less' : `Show more (${items.length - visibleItems.length})` }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.activity-card {
  padding: 16px;
  border: 1px solid rgba(82, 239, 217, 0.16);
  border-radius: 20px;
  background:
    linear-gradient(180deg, rgba(11, 17, 32, 0.9), rgba(7, 11, 20, 0.94)),
    radial-gradient(circle at top left, rgba(56, 165, 255, 0.08), transparent 40%);
}

.activity-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.activity-description {
  max-width: 32ch;
  margin: 0;
  color: var(--aion-muted);
  font-size: 0.82rem;
  line-height: 1.5;
  text-align: right;
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

.activity-table {
  display: grid;
  gap: 10px;
}

.activity-head {
  display: grid;
  grid-template-columns: 128px minmax(0, 1fr) 112px 76px;
  gap: 12px;
  padding: 0 14px;
  color: var(--aion-muted);
  font-size: 0.7rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
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
  grid-template-columns: 128px minmax(0, 1fr) 112px 76px;
  gap: 12px;
  align-items: center;
  padding: 11px 14px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.03);
}

.activity-list.compact .activity-row {
  padding-block: 10px;
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
  font-size: 0.88rem;
  font-weight: 700;
}

.activity-meta {
  overflow-wrap: anywhere;
}

.activity-result {
  font-size: 0.74rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--aion-accent-2);
}

.activity-result[data-outcome='FAILURE'] {
  color: #ff8f9c;
}

.activity-toggle {
  justify-self: start;
  min-height: 36px;
  padding: 0 12px;
  border-radius: 12px;
  border: 0;
  background: transparent;
  color: var(--aion-accent-2);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 700;
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

  .activity-head {
    display: none;
  }
}
</style>
