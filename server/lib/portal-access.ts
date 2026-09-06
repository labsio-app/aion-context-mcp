import { createError } from 'h3'
import type { H3Event } from 'h3'
import type {
  BetaAccessStore,
  DiscordBetaStore,
  DiscordIdentityRecord
} from '../../core/application/ports.js'
import { resolveAuthenticatedDiscordIdentity } from './discord-beta.js'

export interface PortalAccessDeps {
  discordStore: DiscordBetaStore
  betaAccessStore: Pick<BetaAccessStore, 'getLatestRequestByDiscordIdentityId'>
}

export async function requireApprovedPortalIdentity(
  event: H3Event,
  deps: PortalAccessDeps
): Promise<DiscordIdentityRecord> {
  const identity = await resolveAuthenticatedDiscordIdentity(event, deps.discordStore)
  if (!identity) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    })
  }

  const betaAccess = await deps.betaAccessStore.getLatestRequestByDiscordIdentityId(identity.id)
  if (!betaAccess || betaAccess.status !== 'APPROVED') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden'
    })
  }

  return identity
}
