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

export type BetaAccessRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED'

export interface BetaAccessRequestRecord {
  id: string
  discordIdentityId: string
  displayName: string
  motivation: string
  intendedUsage: string
  aionProfile: string | null
  expectedClients: string[]
  status: BetaAccessRequestStatus
  createdAt: string
  updatedAt: string
}

export interface BetaAccessStore {
  getLatestRequestByDiscordIdentityId(discordIdentityId: string): Promise<BetaAccessRequestRecord | null>
  getActiveRequestByDiscordIdentityId(discordIdentityId: string): Promise<BetaAccessRequestRecord | null>
  saveBetaAccessRequest(request: BetaAccessRequestRecord): Promise<BetaAccessRequestRecord>
}

export type BetaAccessReviewFilter = BetaAccessRequestStatus | 'ALL'

export interface BetaAccessReviewRecord {
  request: BetaAccessRequestRecord
  identity: DiscordIdentityRecord
}

export interface BetaAccessDecisionRecord {
  id: string
  betaAccessRequestId: string
  adminDiscordIdentityId: string
  fromStatus: BetaAccessRequestStatus
  toStatus: BetaAccessRequestStatus
  reason: string | null
  createdAt: string
}

export interface BetaAdminStore {
  listBetaAccessRequests(filter: BetaAccessReviewFilter): Promise<BetaAccessReviewRecord[]>
  getBetaAccessRequestById(id: string): Promise<BetaAccessReviewRecord | null>
  transitionBetaAccessRequest(input: {
    requestId: string
    adminDiscordIdentityId: string
    fromStatus: BetaAccessRequestStatus
    toStatus: BetaAccessRequestStatus
    reason: string | null
  }): Promise<{
    request: BetaAccessReviewRecord
    decision: BetaAccessDecisionRecord
  }>
}

export const mcpCredentialStatuses = ['ACTIVE', 'REVOKED'] as const
export type McpCredentialStatus = (typeof mcpCredentialStatuses)[number]

export interface McpCredentialRecord {
  id: string
  discordIdentityId: string
  oauthClientId: string
  status: McpCredentialStatus
  issuedAt: string
  revokedAt: string | null
  lastUsedAt: string | null
}

export interface McpCredentialStore {
  createCredential(credential: McpCredentialRecord): Promise<McpCredentialRecord>
  getCredentialById(id: string): Promise<McpCredentialRecord | null>
  revokeCredential(id: string): Promise<McpCredentialRecord | null>
}

export const mcpActivityOutcomes = ['SUCCESS', 'FAILURE'] as const
export type McpActivityOutcome = (typeof mcpActivityOutcomes)[number]

export interface McpActivityRecord {
  id: string
  userId: string
  credentialId: string | null
  authenticationMethod: 'OAUTH'
  toolName: string
  outcome: McpActivityOutcome
  durationMs: number | null
  createdAt: string
}

export interface McpActivityStore {
  saveActivity(activity: McpActivityRecord): Promise<McpActivityRecord>
  listActivityForUser(userId: string, limit: number): Promise<McpActivityRecord[]>
}

export interface MyMcpCredentialRecord {
  id: string
  oauthClientId: string
  status: McpCredentialStatus
  issuedAt: string
  revokedAt: string | null
  lastUsedAt: string | null
}

export interface MyBetaAccessStatusRecord {
  status: BetaAccessRequestStatus | 'NONE'
  requestId: string | null
  updatedAt: string | null
}

export interface MyAccountRecord {
  identity: {
    id: string
    discordUserId: string
    displayName: string
  }
  betaStatus: MyBetaAccessStatusRecord
  mcpCredentials: MyMcpCredentialRecord[]
}

export interface AccountLifecycleStore {
  getMyAccount(identityId: string): Promise<MyAccountRecord | null>
  listMyMcpCredentials(identityId: string): Promise<MyMcpCredentialRecord[]>
  revokeMyMcpCredential(identityId: string, credentialId: string): Promise<MyMcpCredentialRecord | null>
  revokeAllMyMcpCredentials(identityId: string): Promise<MyMcpCredentialRecord[]>
  deleteMyBetaAccount(identityId: string): Promise<void>
}
