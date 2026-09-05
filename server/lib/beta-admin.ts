import { createError, defineEventHandler, getQuery, getRouterParam, readBody } from 'h3'
import { ZodError } from 'zod'
import { BetaAccessDecisionReasonRequiredError } from '../../core/application/BetaAccessDecisionReasonRequiredError.js'
import { BetaAccessRequestNotFoundError } from '../../core/application/BetaAccessRequestNotFoundError.js'
import { BetaAdminApplication } from '../../core/application/BetaAdminApplication.js'
import type {
  BetaAccessReviewFilter,
  BetaAccessReviewRecord,
  DiscordBetaStore,
  DiscordIdentityRecord
} from '../../core/application/ports.js'
import { InvalidBetaAccessTransitionError } from '../../core/application/InvalidBetaAccessTransitionError.js'
import { resolveAuthenticatedDiscordIdentity } from './discord-beta.js'

export interface BetaAdminControllerDeps {
  application: BetaAdminApplication
  discordStore: DiscordBetaStore
}

function mapAdminIdentity(identity: DiscordIdentityRecord) {
  return {
    id: identity.id,
    discordUserId: identity.discordUserId,
    displayName: identity.displayName
  }
}

function mapRequest(record: BetaAccessReviewRecord) {
  return record
}

function parseAllowedDiscordIds(value: string): Set<string> {
  return new Set(
    value
      .split(/[\s,]+/)
      .map(entry => entry.trim())
      .filter(Boolean)
  )
}

async function requireBetaAdminIdentity(event: any, store: DiscordBetaStore) {
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

function parseFilter(value: unknown): BetaAccessReviewFilter {
  const normalized = String(value ?? 'PENDING').trim().toUpperCase()
  if (normalized === 'ALL') return 'ALL'
  if (normalized === 'PENDING' || normalized === 'APPROVED' || normalized === 'REJECTED' || normalized === 'REVOKED') {
    return normalized
  }

  return 'PENDING'
}

function readReason(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const value = (body as Record<string, unknown>).reason
  if (value == null) return null
  const reason = String(value).trim()
  return reason || null
}

function mapDecisionError(cause: unknown): never {
  if (cause instanceof ZodError) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid beta admin decision'
    })
  }

  if (cause instanceof BetaAccessDecisionReasonRequiredError) {
    throw createError({
      statusCode: 400,
      statusMessage: 'reason_required'
    })
  }

  if (cause instanceof BetaAccessRequestNotFoundError) {
    throw createError({
      statusCode: 404,
      statusMessage: 'beta_access_request_not_found'
    })
  }

  if (cause instanceof InvalidBetaAccessTransitionError) {
    throw createError({
      statusCode: 409,
      statusMessage: 'invalid_beta_access_transition'
    })
  }

  throw cause instanceof Error
    ? cause
    : new Error('Unexpected beta admin decision failure')
}

export function createBetaAdminController(deps: BetaAdminControllerDeps) {
  const list = defineEventHandler(async event => {
    const admin = await requireBetaAdminIdentity(event, deps.discordStore)
    const filter = parseFilter(getQuery(event).status)
    const requests = await deps.application.listBetaAccessRequests(filter)
    return {
      admin: mapAdminIdentity(admin),
      filter,
      requests
    }
  })

  const get = defineEventHandler(async event => {
    const admin = await requireBetaAdminIdentity(event, deps.discordStore)
    const id = String(getRouterParam(event, 'id') ?? '').trim()
    if (!id) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing beta access request id'
      })
    }

    const request = await deps.application.getBetaAccessRequestForReview(id)
    if (!request) {
      throw createError({
        statusCode: 404,
        statusMessage: 'beta_access_request_not_found'
      })
    }

    return {
      admin: mapAdminIdentity(admin),
      request: mapRequest(request)
    }
  })

  const approve = defineEventHandler(async event => {
    const admin = await requireBetaAdminIdentity(event, deps.discordStore)
    const id = String(getRouterParam(event, 'id') ?? '').trim()
    if (!id) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing beta access request id'
      })
    }

    try {
      const result = await deps.application.approveBetaAccessRequest({
        requestId: id,
        adminIdentity: admin,
        reason: null
      })

      return {
        admin: mapAdminIdentity(admin),
        request: result.request,
        decision: result.decision
      }
    } catch (cause) {
      mapDecisionError(cause)
    }
  })

  const reject = defineEventHandler(async event => {
    const admin = await requireBetaAdminIdentity(event, deps.discordStore)
    const id = String(getRouterParam(event, 'id') ?? '').trim()
    if (!id) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing beta access request id'
      })
    }

    const body = await readBody(event)
    const reason = readReason(body)

    try {
      const result = await deps.application.rejectBetaAccessRequest({
        requestId: id,
        adminIdentity: admin,
        reason
      })

      return {
        admin: mapAdminIdentity(admin),
        request: result.request,
        decision: result.decision
      }
    } catch (cause) {
      mapDecisionError(cause)
    }
  })

  const revoke = defineEventHandler(async event => {
    const admin = await requireBetaAdminIdentity(event, deps.discordStore)
    const id = String(getRouterParam(event, 'id') ?? '').trim()
    if (!id) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing beta access request id'
      })
    }

    const body = await readBody(event)
    const reason = readReason(body)

    try {
      const result = await deps.application.revokeBetaAccess({
        requestId: id,
        adminIdentity: admin,
        reason
      })

      return {
        admin: mapAdminIdentity(admin),
        request: result.request,
        decision: result.decision
      }
    } catch (cause) {
      mapDecisionError(cause)
    }
  })

  return {
    list,
    get,
    approve,
    reject,
    revoke
  }
}
