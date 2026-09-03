<script setup lang="ts">
type Scope = 'GLOBAL' | 'TW' | 'KR' | 'UNKNOWN'

interface ContextBundle {
  query: string
  sources: Array<{
    id: string
    title: string
    scope: Scope
    kind: string
    url?: string | null
    excerpt: string
    score: number
  }>
  knowledge: Array<{
    id: string
    kind: string
    statement: string
    scope: Scope
    confidence: string
    status: string
    applicability?: string | null
    tags: string[]
    sourceIds: string[]
    score: number
  }>
  openChallenges: Array<{
    id: string
    knowledgeId: string
    objection: string
  }>
}

const scopes: Scope[] = ['GLOBAL', 'TW', 'KR', 'UNKNOWN']
const token = ref('')
const query = ref('')
const scope = ref<Scope | ''>('')
const result = ref<ContextBundle | null>(null)
const busy = ref(false)
const error = ref('')

const sourceForm = reactive({
  kind: 'YOUTUBE',
  url: '',
  title: '',
  scope: 'TW' as Scope,
  content: '',
  notes: ''
})

const knowledgeForm = reactive({
  kind: 'OBSERVATION',
  statement: '',
  scope: 'TW' as Scope,
  confidence: 'UNKNOWN',
  applicability: '',
  tags: '',
  sourceIds: ''
})

const challengeForm = reactive({
  knowledgeId: '',
  objection: '',
  sourceId: ''
})

onMounted(() => {
  token.value = localStorage.getItem('aion-admin-token') ?? ''
})

watch(token, value => {
  if (import.meta.client) localStorage.setItem('aion-admin-token', value)
})

function headers(): HeadersInit | undefined {
  const value = token.value.trim()
  return value ? { Authorization: `Bearer ${value}` } : undefined
}

async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
  busy.value = true
  error.value = ''
  try {
    return await action()
  } catch (e: any) {
    error.value = e?.data?.statusMessage || e?.message || 'Request failed'
  } finally {
    busy.value = false
  }
}

async function search() {
  if (!query.value.trim()) return
  const data = await run(() =>
    $fetch<ContextBundle>('/api/context', {
      headers: headers(),
      query: {
        q: query.value,
        scope: scope.value || undefined
      }
    })
  )
  if (data) result.value = data
}

async function saveSource() {
  const saved = await run(() =>
    $fetch('/api/sources', {
      method: 'POST',
      headers: headers(),
      body: {
        ...sourceForm,
        url: sourceForm.url || null
      }
    })
  )
  if (saved) {
    sourceForm.title = ''
    sourceForm.content = ''
    sourceForm.notes = ''
  }
}

async function queueSource() {
  if (!sourceForm.url) {
    error.value = 'A URL is required to queue acquisition.'
    return
  }
  await run(() =>
    $fetch('/api/acquisition', {
      method: 'POST',
      headers: headers(),
      body: {
        url: sourceForm.url,
        title: sourceForm.title || undefined,
        scope: sourceForm.scope,
        content: sourceForm.content || undefined,
        notes: sourceForm.notes || undefined
      }
    })
  )
}

async function saveKnowledge() {
  const saved = await run(() =>
    $fetch('/api/knowledge', {
      method: 'POST',
      headers: headers(),
      body: {
        ...knowledgeForm,
        tags: knowledgeForm.tags.split(',').map(v => v.trim()).filter(Boolean),
        sourceIds: knowledgeForm.sourceIds.split(',').map(v => v.trim()).filter(Boolean)
      }
    })
  )
  if (saved) {
    knowledgeForm.statement = ''
    knowledgeForm.applicability = ''
    knowledgeForm.tags = ''
    knowledgeForm.sourceIds = ''
  }
}

async function saveChallenge() {
  const saved = await run(() =>
    $fetch('/api/challenges', {
      method: 'POST',
      headers: headers(),
      body: {
        knowledgeId: challengeForm.knowledgeId,
        objection: challengeForm.objection,
        sourceId: challengeForm.sourceId || null
      }
    })
  )
  if (saved) {
    challengeForm.objection = ''
    challengeForm.sourceId = ''
  }
}
</script>

<template>
  <main class="shell">
    <header class="hero">
      <div>
        <p class="eyebrow">AION 2 · Context Infrastructure</p>
        <h1>Keep the intelligence in the model.</h1>
        <p class="subtitle">
          MCP persists sources, knowledge and contradictions. The AI decides what matters.
        </p>
      </div>

      <label class="token">
        <span>Admin token</span>
        <input v-model="token" type="password" placeholder="NUXT_ADMIN_TOKEN" />
      </label>
    </header>

    <p v-if="error" class="error">{{ error }}</p>

    <section class="search-panel card">
      <div class="section-title">
        <div>
          <small>RETRIEVAL</small>
          <h2>Search context</h2>
        </div>
      </div>
      <div class="search-row">
        <input
          v-model="query"
          placeholder="e.g. difference between ILVL and Combat Power"
          @keyup.enter="search"
        />
        <select v-model="scope">
          <option value="">All scopes</option>
          <option v-for="item in scopes" :key="item" :value="item">{{ item }}</option>
        </select>
        <button :disabled="busy" @click="search">Search</button>
      </div>
    </section>

    <section v-if="result" class="results">
      <article class="card">
        <div class="section-title">
          <div>
            <small>SOURCES</small>
            <h2>{{ result.sources.length }} hits</h2>
          </div>
        </div>
        <div v-if="!result.sources.length" class="empty">No source found.</div>
        <div v-for="item in result.sources" :key="item.id" class="item">
          <div class="meta">
            <span>{{ item.kind }}</span>
            <span>{{ item.scope }}</span>
            <code>{{ item.id }}</code>
          </div>
          <h3>{{ item.title }}</h3>
          <p>{{ item.excerpt || 'No stored content yet.' }}</p>
          <a v-if="item.url" :href="item.url" target="_blank" rel="noreferrer">open source</a>
        </div>
      </article>

      <article class="card">
        <div class="section-title">
          <div>
            <small>KNOWLEDGE</small>
            <h2>{{ result.knowledge.length }} hits</h2>
          </div>
        </div>
        <div v-if="!result.knowledge.length" class="empty">No knowledge found.</div>
        <div v-for="item in result.knowledge" :key="item.id" class="item">
          <div class="meta">
            <span>{{ item.kind }}</span>
            <span>{{ item.scope }}</span>
            <span>{{ item.confidence }}</span>
            <span>{{ item.status }}</span>
          </div>
          <h3>{{ item.statement }}</h3>
          <p v-if="item.applicability">{{ item.applicability }}</p>
          <code>{{ item.id }}</code>
        </div>

        <div v-if="result.openChallenges.length" class="challenge-box">
          <strong>Open challenges</strong>
          <p v-for="challenge in result.openChallenges" :key="challenge.id">
            {{ challenge.objection }}
          </p>
        </div>
      </article>
    </section>

    <section class="forms">
      <article class="card">
        <small>SOURCE</small>
        <h2>Record or queue</h2>
        <div class="grid">
          <select v-model="sourceForm.kind">
            <option>YOUTUBE</option>
            <option>WEB</option>
            <option>MANUAL</option>
          </select>
          <select v-model="sourceForm.scope">
            <option v-for="item in scopes" :key="item">{{ item }}</option>
          </select>
        </div>
        <input v-model="sourceForm.url" placeholder="URL (optional for manual)" />
        <input v-model="sourceForm.title" placeholder="Title" />
        <textarea v-model="sourceForm.content" rows="7" placeholder="Transcript, notes or source content" />
        <textarea v-model="sourceForm.notes" rows="3" placeholder="Provenance notes" />
        <div class="actions">
          <button :disabled="busy || !sourceForm.title" @click="saveSource">Save now</button>
          <button class="secondary" :disabled="busy || !sourceForm.url" @click="queueSource">
            Queue URL
          </button>
        </div>
      </article>

      <article class="card">
        <small>KNOWLEDGE</small>
        <h2>Record an explicit belief</h2>
        <div class="grid">
          <select v-model="knowledgeForm.kind">
            <option>OBSERVATION</option>
            <option>CLAIM</option>
            <option>THEORY</option>
            <option>RECOMMENDATION</option>
          </select>
          <select v-model="knowledgeForm.scope">
            <option v-for="item in scopes" :key="item">{{ item }}</option>
          </select>
        </div>
        <select v-model="knowledgeForm.confidence">
          <option>UNKNOWN</option>
          <option>LOW</option>
          <option>MEDIUM</option>
          <option>HIGH</option>
        </select>
        <textarea v-model="knowledgeForm.statement" rows="5" placeholder="Statement" />
        <input v-model="knowledgeForm.applicability" placeholder="Applicability / patch / caveat" />
        <input v-model="knowledgeForm.tags" placeholder="tags, comma, separated" />
        <input v-model="knowledgeForm.sourceIds" placeholder="source UUIDs, comma separated" />
        <button :disabled="busy || !knowledgeForm.statement" @click="saveKnowledge">Record knowledge</button>
      </article>

      <article class="card">
        <small>CHALLENGE</small>
        <h2>Keep contradictions visible</h2>
        <input v-model="challengeForm.knowledgeId" placeholder="Knowledge UUID" />
        <textarea v-model="challengeForm.objection" rows="5" placeholder="What contradicts or limits this knowledge?" />
        <input v-model="challengeForm.sourceId" placeholder="Optional counter-source UUID" />
        <button :disabled="busy || !challengeForm.knowledgeId || !challengeForm.objection" @click="saveChallenge">
          Record challenge
        </button>
      </article>
    </section>
  </main>
</template>

<style scoped>
.shell {
  width: min(1440px, calc(100% - 40px));
  margin: 0 auto;
  padding: 56px 0 100px;
}

.hero {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 32px;
  margin-bottom: 28px;
}

.eyebrow,
small {
  color: #c8a96a;
  letter-spacing: 0.18em;
  font-weight: 700;
  font-size: 0.72rem;
}

h1 {
  margin: 8px 0 12px;
  max-width: 800px;
  font-family: Georgia, "Times New Roman", serif;
  font-weight: 500;
  font-size: clamp(2.4rem, 5vw, 5.5rem);
  line-height: 0.96;
}

.subtitle {
  color: #a4a9b8;
  max-width: 720px;
  font-size: 1.05rem;
}

.token {
  width: min(340px, 100%);
}

.token span {
  display: block;
  margin-bottom: 8px;
  color: #8f94a5;
  font-size: 0.8rem;
}

.card {
  border: 1px solid #242938;
  background: rgba(14, 17, 26, 0.9);
  box-shadow: 0 22px 60px rgba(0, 0, 0, 0.18);
  padding: 24px;
}

.search-panel {
  margin-bottom: 20px;
}

.search-row,
.grid,
.actions {
  display: flex;
  gap: 10px;
}

.search-row input {
  flex: 1;
}

.results {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
}

.forms {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 20px;
}

.forms .card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.grid > * {
  flex: 1;
}

input,
textarea,
select {
  width: 100%;
  border: 1px solid #2d3242;
  background: #0a0d14;
  color: #eef0f7;
  border-radius: 3px;
  padding: 12px 13px;
  outline: none;
}

input:focus,
textarea:focus,
select:focus {
  border-color: #866cab;
}

button {
  border: 1px solid #c7a462;
  background: #c7a462;
  color: #101116;
  border-radius: 3px;
  padding: 11px 16px;
  font-weight: 800;
}

button.secondary {
  background: transparent;
  color: #d8bf89;
}

button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.section-title h2,
.forms h2 {
  margin: 4px 0 18px;
  font-size: 1.25rem;
}

.item {
  border-top: 1px solid #242938;
  padding: 18px 0;
}

.item:first-of-type {
  border-top: 0;
}

.item h3 {
  margin: 8px 0;
  font-size: 1rem;
}

.item p,
.empty {
  color: #a4a9b8;
  line-height: 1.55;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  color: #7f8494;
  font-size: 0.72rem;
}

.meta span {
  border: 1px solid #303646;
  padding: 3px 6px;
}

code {
  color: #7f8494;
  font-size: 0.72rem;
  word-break: break-all;
}

.challenge-box {
  margin-top: 18px;
  border-left: 2px solid #9b6d6d;
  padding: 12px 16px;
  background: #151015;
}

.error {
  border: 1px solid #7f4848;
  background: #261313;
  color: #efb3b3;
  padding: 12px 15px;
}

@media (max-width: 1000px) {
  .hero {
    align-items: stretch;
    flex-direction: column;
  }

  .results,
  .forms {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 680px) {
  .shell {
    width: min(100% - 22px, 1440px);
    padding-top: 28px;
  }

  .search-row,
  .grid,
  .actions {
    flex-direction: column;
  }
}
</style>
