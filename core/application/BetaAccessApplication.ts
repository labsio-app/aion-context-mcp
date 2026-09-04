import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type {
  BetaAccessRequestRecord,
  BetaAccessStore,
  DiscordIdentityRecord
} from './ports.js'
import { BetaAccessResubmissionNotAllowedError } from './BetaAccessResubmissionNotAllowedError.js'

export const betaAccessClientOptions = [
  'T3 Code',
  'Codex',
  'Claude',
  'ChatGPT',
  'Custom MCP client',
  'Other'
] as const

const requestBetaAccessSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  motivation: z.string().trim().min(1).max(2000),
  intendedUsage: z.string().trim().min(1).max(2000),
  aionProfile: z.string().trim().max(2000).optional().transform(value => value?.trim() || null),
  expectedClients: z.array(z.enum(betaAccessClientOptions)).max(8).default([])
})

export interface RequestBetaAccessInput {
  displayName: string
  motivation: string
  intendedUsage: string
  aionProfile?: string | null
  expectedClients?: string[]
}

export interface BetaAccessStatus {
  canSubmit: boolean
  request: BetaAccessRequestRecord | null
}

export type RequestBetaAccessResult =
  | {
      kind: 'created'
      request: BetaAccessRequestRecord
    }
  | {
      kind: 'request_exists'
      request: BetaAccessRequestRecord
    }

export class BetaAccessApplication {
  constructor(private readonly store: BetaAccessStore) {}

  async getBetaAccessStatus(discordIdentityId: string): Promise<BetaAccessStatus> {
    const request = await this.store.getLatestRequestByDiscordIdentityId(discordIdentityId)
    return {
      canSubmit: !request,
      request
    }
  }

  async requestBetaAccess(
    identity: DiscordIdentityRecord,
    input: RequestBetaAccessInput
  ): Promise<RequestBetaAccessResult> {
    const activeRequest = await this.store.getActiveRequestByDiscordIdentityId(identity.id)
    if (activeRequest) {
      return {
        kind: 'request_exists',
        request: activeRequest
      }
    }

    const existingRequest = await this.store.getLatestRequestByDiscordIdentityId(identity.id)
    if (existingRequest) {
      throw new BetaAccessResubmissionNotAllowedError()
    }

    const parsed = requestBetaAccessSchema.parse(input)
    const now = new Date().toISOString()
    const request: BetaAccessRequestRecord = {
      id: randomUUID(),
      discordIdentityId: identity.id,
      displayName: parsed.displayName,
      motivation: parsed.motivation,
      intendedUsage: parsed.intendedUsage,
      aionProfile: parsed.aionProfile ?? null,
      expectedClients: [...new Set(parsed.expectedClients)],
      status: 'PENDING',
      createdAt: now,
      updatedAt: now
    }

    return {
      kind: 'created',
      request: await this.store.saveBetaAccessRequest(request)
    }
  }
}
