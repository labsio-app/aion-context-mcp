import { randomUUID } from 'node:crypto'
import type {
  Challenge,
  ChallengeStatus,
  ConfidenceLevel,
  ContextBundle,
  GameScope,
  KnowledgeItem,
  KnowledgeKind,
  Source,
  SourceKind
} from '../domain/model.js'
import type { KnowledgeStore } from './ports.js'

export interface RecordSourceInput {
  kind: SourceKind
  url?: string | null
  title: string
  scope: GameScope
  content?: string
  notes?: string | null
}

export interface RecordKnowledgeInput {
  kind: KnowledgeKind
  statement: string
  scope: GameScope
  confidence?: ConfidenceLevel
  applicability?: string | null
  notes?: string | null
  tags?: string[]
  sourceIds?: string[]
}

export interface RecordChallengeInput {
  knowledgeId: string
  objection: string
  sourceId?: string | null
}

export class KnowledgeApplication {
  constructor(private readonly store: KnowledgeStore) {}

  async recordSource(input: RecordSourceInput): Promise<Source> {
    const now = new Date().toISOString()
    return this.store.saveSource({
      id: randomUUID(),
      kind: input.kind,
      url: input.url ?? null,
      title: input.title.trim(),
      scope: input.scope,
      content: input.content?.trim() ?? '',
      notes: input.notes?.trim() || null,
      createdAt: now,
      updatedAt: now
    })
  }

  async recordKnowledge(input: RecordKnowledgeInput): Promise<KnowledgeItem> {
    const now = new Date().toISOString()
    return this.store.saveKnowledge({
      id: randomUUID(),
      kind: input.kind,
      statement: input.statement.trim(),
      scope: input.scope,
      confidence: input.confidence ?? 'UNKNOWN',
      status: 'ACTIVE',
      applicability: input.applicability?.trim() || null,
      notes: input.notes?.trim() || null,
      tags: [...new Set((input.tags ?? []).map(tag => tag.trim()).filter(Boolean))],
      sourceIds: [...new Set(input.sourceIds ?? [])],
      createdAt: now,
      updatedAt: now
    })
  }

  async recordChallenge(input: RecordChallengeInput): Promise<Challenge> {
    const existing = await this.store.getKnowledge(input.knowledgeId)
    if (!existing) {
      throw new Error(`Knowledge item ${input.knowledgeId} does not exist`)
    }

    const now = new Date().toISOString()
    return this.store.saveChallenge({
      id: randomUUID(),
      knowledgeId: input.knowledgeId,
      objection: input.objection.trim(),
      sourceId: input.sourceId ?? null,
      status: 'OPEN',
      resolution: null,
      createdAt: now,
      updatedAt: now
    })
  }

  async searchContext(input: {
    query: string
    scope?: GameScope | null
    limit?: number
  }): Promise<ContextBundle> {
    const limit = Math.min(Math.max(input.limit ?? 8, 1), 25)
    const scope = input.scope ?? null

    const [sources, knowledge] = await Promise.all([
      this.store.searchSources(input.query.trim(), scope, limit),
      this.store.searchKnowledge(input.query.trim(), scope, limit)
    ])

    const openChallenges = knowledge.length
      ? await this.store.listChallenges({
          knowledgeIds: knowledge.map(item => item.id),
          status: 'OPEN',
          limit: 25
        })
      : []

    return {
      query: input.query,
      scope,
      sources,
      knowledge,
      openChallenges
    }
  }

  getSource(id: string) {
    return this.store.getSource(id)
  }

  getKnowledge(id: string) {
    return this.store.getKnowledge(id)
  }

  listChallenges(status: ChallengeStatus = 'OPEN', limit = 50) {
    return this.store.listChallenges({ status, limit })
  }
}
