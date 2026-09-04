import type {
  Challenge,
  ChallengeStatus,
  ContextBundle,
  GameScope,
  KnowledgeItem,
  KnowledgeSearchHit,
  Source,
  SourceSearchHit
} from '../domain/model.js'

export interface KnowledgeStore {
  saveSource(source: Source): Promise<Source>
  getSource(id: string): Promise<Source | null>
  searchSources(query: string, scope: GameScope | null, limit: number): Promise<SourceSearchHit[]>

  saveKnowledge(item: KnowledgeItem): Promise<KnowledgeItem>
  getKnowledge(id: string): Promise<KnowledgeItem | null>
  searchKnowledge(query: string, scope: GameScope | null, limit: number): Promise<KnowledgeSearchHit[]>

  saveChallenge(challenge: Challenge): Promise<Challenge>
  listChallenges(input: {
    knowledgeIds?: string[]
    status?: ChallengeStatus
    limit: number
  }): Promise<Challenge[]>
}

export interface AcquisitionJobInput {
  url: string
  title?: string
  scope: GameScope
  content?: string
  notes?: string
}

export interface AcquisitionJob {
  id: string
  type: 'FETCH_SOURCE'
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
  payload: AcquisitionJobInput
  error: string | null
  createdAt: string
  updatedAt: string
}

export interface AcquisitionQueue {
  enqueue(input: AcquisitionJobInput): Promise<AcquisitionJob>
  claimNext(): Promise<AcquisitionJob | null>
  complete(id: string): Promise<void>
  fail(id: string, error: string): Promise<void>
}

export interface DiscordIdentityRecord {
  id: string
  discordUserId: string
  username: string
  globalName: string | null
  avatar: string | null
  displayName: string
  createdAt: string
  updatedAt: string
}

export interface DiscordBrowserSessionRecord {
  id: string
  identityId: string
  tokenHash: string
  expiresAt: string
  createdAt: string
  updatedAt: string
}

export interface DiscordBetaStore {
  upsertIdentity(input: {
    discordUserId: string
    username: string
    globalName: string | null
    avatar: string | null
  }): Promise<DiscordIdentityRecord>

  createSession(input: {
    identityId: string
    tokenHash: string
    expiresAt: string
  }): Promise<DiscordBrowserSessionRecord>

  getSession(tokenHash: string): Promise<{
    session: DiscordBrowserSessionRecord
    identity: DiscordIdentityRecord
  } | null>

  deleteSession(tokenHash: string): Promise<void>
}
