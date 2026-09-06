<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ClientGuide } from '../lib/client-guides.js'

const props = defineProps<{
  guide: ClientGuide
}>()

const activePanel = ref<'setup' | 'requirements' | 'verification' | 'troubleshooting'>('setup')

const panels = [
  { id: 'setup', label: 'Setup' },
  { id: 'requirements', label: 'Requirements' },
  { id: 'verification', label: 'Verification' },
  { id: 'troubleshooting', label: 'Troubleshooting' }
] as const

const activeLabel = computed(() => panels.find(panel => panel.id === activePanel.value)?.label ?? 'Setup')
</script>

<template>
  <article :id="guide.id" class="client-guide-card" :data-status="guide.status">
    <header class="guide-header">
      <div>
        <p class="eyebrow">{{ guide.name }}</p>
        <h3>{{ guide.status }}</h3>
      </div>
      <div class="guide-meta-chip">
        <span>Verified on</span>
        <strong>{{ guide.verifiedOn }}</strong>
      </div>
    </header>

    <p class="guide-summary">
      {{ guide.summary }}
    </p>

    <dl class="guide-matrix" aria-label="Client requirements">
      <div>
        <dt>Transport</dt>
        <dd>{{ guide.transport }}</dd>
      </div>
      <div>
        <dt>Auth</dt>
        <dd>{{ guide.authentication }}</dd>
      </div>
      <div>
        <dt>Read</dt>
        <dd>{{ guide.readTools }}</dd>
      </div>
      <div>
        <dt>Write</dt>
        <dd>{{ guide.writeTools }}</dd>
      </div>
    </dl>

    <div class="guide-tabs" role="tablist" aria-label="Client guide sections">
      <button
        v-for="panel in panels"
        :key="panel.id"
        type="button"
        class="guide-tab"
        :class="{ active: activePanel === panel.id }"
        :aria-selected="activePanel === panel.id"
        :aria-controls="`${guide.id}-${panel.id}`"
        role="tab"
        @click="activePanel = panel.id"
      >
        {{ panel.label }}
      </button>
    </div>

    <div class="guide-panel-stack">
      <section
        v-show="activePanel === 'setup'"
        :id="`${guide.id}-setup`"
        class="guide-panel"
        role="tabpanel"
      >
        <ol class="guide-step-list">
          <li v-for="step in guide.connectionSteps" :key="step">{{ step }}</li>
        </ol>
      </section>

      <section
        v-show="activePanel === 'requirements'"
        :id="`${guide.id}-requirements`"
        class="guide-panel"
        role="tabpanel"
      >
        <p class="guide-text">{{ guide.planRestrictions }}</p>
        <p class="guide-text">{{ guide.authentication }}</p>
      </section>

      <section
        v-show="activePanel === 'verification'"
        :id="`${guide.id}-verification`"
        class="guide-panel"
        role="tabpanel"
      >
        <p class="guide-text">{{ guide.verification }}</p>
      </section>

      <section
        v-show="activePanel === 'troubleshooting'"
        :id="`${guide.id}-troubleshooting`"
        class="guide-panel"
        role="tabpanel"
      >
        <ul class="guide-bullets">
          <li v-for="item in guide.troubleshooting" :key="item">{{ item }}</li>
        </ul>
      </section>
    </div>

    <details class="guide-sources">
      <summary>Sources</summary>
      <ul class="source-list">
        <li v-for="source in guide.sourceLinks" :key="source.url">
          <a :href="source.url" rel="noreferrer noopener" target="_blank">{{ source.label }}</a>
        </li>
      </ul>
    </details>

    <footer class="guide-footer">
      <span class="guide-source-label">Current focus</span>
      <strong>{{ activeLabel }}</strong>
    </footer>
  </article>
</template>

<style scoped>
.client-guide-card {
  display: grid;
  gap: 10px;
  padding: 14px;
  border: 1px solid rgba(82, 239, 217, 0.14);
  background:
    linear-gradient(180deg, rgba(11, 17, 32, 0.94), rgba(7, 11, 20, 0.98)),
    radial-gradient(circle at top left, rgba(56, 165, 255, 0.07), transparent 42%);
}

.client-guide-card[data-status='PARTIAL'] {
  border-color: rgba(255, 205, 102, 0.22);
}

.client-guide-card[data-status='NOT VERIFIED'] {
  border-color: rgba(255, 124, 139, 0.24);
}

.guide-header {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 14px;
}

.guide-header h3 {
  margin: 4px 0 0;
  font-size: 1rem;
  line-height: 1.1;
}

.guide-meta-chip {
  display: grid;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.05);
  min-width: 108px;
  text-align: right;
}

.guide-meta-chip span,
.guide-source-label {
  font-size: 0.68rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--aion-accent-2);
}

.guide-meta-chip strong,
.guide-footer strong {
  font-size: 0.82rem;
}

.guide-summary {
  margin: 0;
  color: var(--aion-muted);
  line-height: 1.55;
}

.guide-matrix {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}

.guide-matrix div {
  min-width: 0;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.03);
}

.guide-matrix dt {
  margin: 0 0 4px;
  font-size: 0.68rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--aion-accent-2);
}

.guide-matrix dd {
  margin: 0;
  color: var(--aion-text);
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.guide-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.guide-tab {
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(159, 192, 245, 0.14);
  background: rgba(255, 255, 255, 0.03);
  color: var(--aion-muted);
  font: inherit;
  font-size: 0.78rem;
}

.guide-tab.active {
  border-color: rgba(97, 217, 255, 0.4);
  background: rgba(56, 165, 255, 0.1);
  color: var(--aion-text);
}

.guide-panel-stack {
  display: grid;
}

.guide-panel {
  padding-top: 8px;
  border-top: 1px solid rgba(159, 192, 245, 0.12);
}

.guide-step-list,
.guide-bullets {
  margin: 0;
  padding-left: 18px;
  color: var(--aion-muted);
  line-height: 1.55;
}

.guide-step-list {
  display: grid;
  gap: 8px;
}

.guide-text {
  margin: 0;
  color: var(--aion-muted);
  line-height: 1.55;
}

.guide-sources {
  padding-top: 8px;
  border-top: 1px solid rgba(159, 192, 245, 0.12);
}

.guide-sources summary {
  cursor: pointer;
  list-style: none;
  font-size: 0.74rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--aion-accent-2);
}

.guide-sources summary::-webkit-details-marker {
  display: none;
}

.source-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  padding-left: 0;
  margin: 10px 0 0;
  list-style: none;
}

.source-list a {
  color: var(--aion-text);
  text-decoration: underline;
  text-decoration-color: rgba(82, 239, 217, 0.35);
}

.guide-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

@media (max-width: 700px) {
  .guide-header,
  .guide-footer {
    display: grid;
  }

  .guide-meta-chip {
    min-width: 0;
    justify-self: start;
    text-align: left;
  }

  .guide-matrix {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
