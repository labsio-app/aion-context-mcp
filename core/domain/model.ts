export const sourceKinds = ['YOUTUBE', 'WEB', 'MANUAL'] as const
export type SourceKind = (typeof sourceKinds)[number]

export const gameScopes = ['GLOBAL', 'TW', 'KR', 'UNKNOWN'] as const
export type GameScope = (typeof gameScopes)[number]

export const knowledgeKinds = [
  'OBSERVATION',
  'CLAIM',
  'THEORY',
  'RECOMMENDATION'
] as const
export type KnowledgeKind = (typeof knowledgeKinds)[number]

export const knowledgeStatuses = ['ACTIVE', 'CHALLENGED', 'SUPERSEDED'] as const
export type KnowledgeStatus = (typeof knowledgeStatuses)[number]

export const confidenceLevels = ['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN'] as const
export type ConfidenceLevel = (typeof confidenceLevels)[number]

export const challengeStatuses = ['OPEN', 'RESOLVED', 'DISMISSED'] as const
export type ChallengeStatus = (typeof challengeStatuses)[number]

export interface Source {
  id: string
  kind: SourceKind
  url: string | null
  title: string
  scope: GameScope
  content: string
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface SourceSearchHit extends Omit<Source, 'content'> {
  excerpt: string
  score: number
}

export interface KnowledgeItem {
  id: string
  kind: KnowledgeKind
  statement: string
  scope: GameScope
  confidence: ConfidenceLevel
  status: KnowledgeStatus
  applicability: string | null
  notes: string | null
  tags: string[]
  sourceIds: string[]
  createdAt: string
  updatedAt: string
}

export interface KnowledgeSearchHit extends KnowledgeItem {
  score: number
}

export interface Challenge {
  id: string
  knowledgeId: string
  objection: string
  sourceId: string | null
  status: ChallengeStatus
  resolution: string | null
  createdAt: string
  updatedAt: string
}

export interface ContextBundle {
  query: string
  scope: GameScope | null
  sources: SourceSearchHit[]
  knowledge: KnowledgeSearchHit[]
  openChallenges: Challenge[]
}
