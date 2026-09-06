<script setup lang="ts">
import type { ClientGuide } from '../lib/client-guides.js'

defineProps<{
  guide: ClientGuide
}>()
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
      <div class="wide">
        <dt>Restrictions</dt>
        <dd>{{ guide.planRestrictions }}</dd>
      </div>
    </dl>

    <section class="guide-section">
      <h4>Connection</h4>
      <ol class="guide-steps">
        <li v-for="step in guide.connectionSteps" :key="step">{{ step }}</li>
      </ol>
    </section>

    <section class="guide-section">
      <h4>Verification</h4>
      <p class="guide-text">{{ guide.verification }}</p>
    </section>

    <section class="guide-section">
      <h4>Troubleshooting</h4>
      <ul class="guide-list">
        <li v-for="item in guide.troubleshooting" :key="item">{{ item }}</li>
      </ul>
    </section>

    <footer class="guide-footer">
      <span class="guide-source-label">Official sources</span>
      <ul class="source-list">
        <li v-for="source in guide.sourceLinks" :key="source.url">
          <a :href="source.url" rel="noreferrer noopener" target="_blank">{{ source.label }}</a>
        </li>
      </ul>
    </footer>
  </article>
</template>

<style scoped>
.client-guide-card {
  display: grid;
  gap: 16px;
  padding: 20px;
  border-radius: 22px;
  border: 1px solid rgba(82, 239, 217, 0.14);
  background:
    linear-gradient(180deg, rgba(11, 17, 32, 0.94), rgba(7, 11, 20, 0.98)),
    radial-gradient(circle at top left, rgba(56, 165, 255, 0.07), transparent 40%);
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
  gap: 16px;
}

.guide-header h3 {
  margin: 4px 0 0;
  font-size: 1.5rem;
  line-height: 1.1;
}

.guide-meta-chip {
  display: grid;
  gap: 2px;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.05);
  min-width: 128px;
  text-align: right;
}

.guide-meta-chip span {
  font-size: 0.7rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--aion-muted);
}

.guide-meta-chip strong {
  font-size: 0.86rem;
}

.guide-summary {
  margin: 0;
  color: var(--aion-muted);
  line-height: 1.65;
}

.guide-matrix {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
}

.guide-matrix div {
  min-width: 0;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.03);
}

.guide-matrix .wide {
  grid-column: 1 / -1;
}

.guide-matrix dt {
  margin: 0 0 6px;
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--aion-accent-2);
}

.guide-matrix dd {
  margin: 0;
  color: var(--aion-text);
  line-height: 1.55;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.guide-section {
  display: grid;
  gap: 10px;
}

.guide-section h4 {
  margin: 0;
  font-size: 0.88rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--aion-accent-2);
}

.guide-steps,
.guide-list,
.source-list {
  margin: 0;
  padding-left: 1.2rem;
  color: var(--aion-muted);
  line-height: 1.6;
}

.guide-steps li,
.guide-list li,
.source-list li {
  overflow-wrap: anywhere;
  word-break: break-word;
}

.guide-steps {
  display: grid;
  gap: 8px;
}

.guide-text {
  margin: 0;
  color: var(--aion-muted);
  line-height: 1.6;
}

.guide-footer {
  display: grid;
  gap: 8px;
}

.guide-source-label {
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--aion-accent-2);
}

.source-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  padding-left: 0;
  list-style: none;
}

.source-list li {
  margin: 0;
}

.source-list a {
  color: var(--aion-text);
  text-decoration: underline;
  text-decoration-color: rgba(82, 239, 217, 0.35);
}

.source-list a:hover,
.source-list a:focus-visible {
  color: var(--aion-accent-2);
  outline: none;
}

@media (max-width: 900px) {
  .guide-header {
    flex-direction: column;
  }

  .guide-meta-chip {
    text-align: left;
    min-width: 0;
    width: 100%;
  }

  .guide-matrix {
    grid-template-columns: 1fr;
  }

  .guide-steps,
  .guide-list {
    padding-left: 1rem;
  }

  .source-list {
    gap: 8px 12px;
    overflow-wrap: anywhere;
  }
}
</style>
