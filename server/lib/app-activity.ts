import { defineEventHandler, getQuery } from 'h3'
import type { ListMcpActivityForUser } from '../../core/application/ListMcpActivityForUser.js'
import type {
  BetaAccessStore,
  DiscordBetaStore,
  McpActivityRecord
} from '../../core/application/ports.js'
import { requireApprovedPortalIdentity } from './portal-access.js'

export interface AppActivityControllerDeps {
  application: ListMcpActivityForUser
  discordStore: DiscordBetaStore
  betaAccessStore: Pick<BetaAccessStore, 'getLatestRequestByDiscordIdentityId'>
}

export interface AppActivityPayload {
  authenticated: true
  identity: {
    id: string
    discordUserId: string
    displayName: string
  }
  activities: McpActivityRecord[]
}

function mapIdentity(identity: { id: string; discordUserId: string; displayName: string }) {
  return {
    id: identity.id,
    discordUserId: identity.discordUserId,
    displayName: identity.displayName
  }
}

function parseLimit(value: unknown): number | undefined {
  const limit = Number(value)
  return Number.isFinite(limit) ? limit : undefined
}

export function createAppActivityController(deps: AppActivityControllerDeps) {
  const get = defineEventHandler(async event => {
    const identity = await requireApprovedPortalIdentity(event, deps)
    const activities = await deps.application.execute({
      userId: identity.id,
      limit: parseLimit(getQuery(event).limit)
    })

    const payload: AppActivityPayload = {
      authenticated: true,
      identity: mapIdentity(identity),
      activities
    }

    return payload
  })

  return {
    get
  }
}
