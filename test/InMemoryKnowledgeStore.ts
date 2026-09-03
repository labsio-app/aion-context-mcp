import type {
  Challenge,
  ChallengeStatus,
  GameScope,
  KnowledgeItem,
  KnowledgeSearchHit,
  Source,
  SourceSearchHit
} from '../core/domain/model.js'
import type { KnowledgeStore } from '../core/application/ports.js'

export class InMemoryKnowledgeStore implements KnowledgeStore {
  sources: Source[] = []
  knowledge: KnowledgeItem[] = []
  challenges: Challenge[] = []

  async saveSource(source: Source) {
    this.sources.push(source)
    return source
  }

  async getSource(id: string) {
    return this.sources.find(item => item.id === id) ?? null
  }

  async searchSources(query: string, scope: GameScope | null, limit: number): Promise<SourceSearchHit[]> {
    const q = query.toLowerCase()
    return this.sources
      .filter(item => !scope || item.scope === scope)
      .filter(item => !q || `${item.title} ${item.content}`.toLowerCase().includes(q))
      .slice(0, limit)
      .map(item => ({
        id: item.id,
        kind: item.kind,
        url: item.url,
        title: item.title,
        scope: item.scope,
        notes: item.notes,
        excerpt: item.content.slice(0, 700),
        score: 1,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      }))
  }

  async saveKnowledge(item: KnowledgeItem) {
    this.knowledge.push(item)
    return item
  }

  async getKnowledge(id: string) {
    return this.knowledge.find(item => item.id === id) ?? null
  }

  async searchKnowledge(query: string, scope: GameScope | null, limit: number): Promise<KnowledgeSearchHit[]> {
    const q = query.toLowerCase()
    return this.knowledge
      .filter(item => !scope || item.scope === scope)
      .filter(item => !q || item.statement.toLowerCase().includes(q))
      .slice(0, limit)
      .map(item => ({ ...item, score: 1 }))
  }

  async saveChallenge(challenge: Challenge) {
    this.challenges.push(challenge)
    const item = this.knowledge.find(value => value.id === challenge.knowledgeId)
    if (item && item.status === 'ACTIVE') item.status = 'CHALLENGED'
    return challenge
  }

  async listChallenges(input: {
    knowledgeIds?: string[]
    status?: ChallengeStatus
    limit: number
  }) {
    return this.challenges
      .filter(item => !input.status || item.status === input.status)
      .filter(item => !input.knowledgeIds || input.knowledgeIds.includes(item.knowledgeId))
      .slice(0, input.limit)
  }
}
