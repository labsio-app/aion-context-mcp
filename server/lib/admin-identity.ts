import { createError } from 'h3'
import { resolveAuthenticatedDiscordIdentity } from './discord-beta.js'
import type { DiscordBetaStore } from '../../core/application/ports.js'

function parseAllowedDiscordIds(value: string): Set<string> {
  return new Set(
    value
      .split(/[\s,]+/)
      .map(entry => entry.trim())
      .filter(Boolean)
  )
}

export async function requireBetaAdminIdentity(event: any, store: DiscordBetaStore) {
  const identity = await resolveAuthenticatedDiscordIdentity(event, store)
  if (!identity) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    })
  }

  const allowed = parseAllowedDiscordIds(String(process.env.BETA_ADMIN_DISCORD_IDS ?? ''))
  if (!allowed.size && process.env.NODE_ENV === 'production') {
    throw createError({
      statusCode: 500,
      statusMessage: 'BETA_ADMIN_DISCORD_IDS is required in production'
    })
  }

  if (!allowed.has(identity.discordUserId)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden'
    })
  }

  return identity
}

