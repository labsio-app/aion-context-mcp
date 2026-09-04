import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { ZodError } from 'zod'
import { ActiveBetaAccessRequestAlreadyExistsError } from '../../core/application/ActiveBetaAccessRequestAlreadyExistsError.js'
import { BetaAccessResubmissionNotAllowedError } from '../../core/application/BetaAccessResubmissionNotAllowedError.js'
import type { BetaAccessApplication } from '../../core/application/BetaAccessApplication.js'
import type { DiscordBetaStore, DiscordIdentityRecord } from '../../core/application/ports.js'
import { resolveAuthenticatedDiscordIdentity } from './discord-beta.js'

export interface BetaAccessControllerDeps {
  application: BetaAccessApplication
  discordStore: DiscordBetaStore
}

export interface BetaAccessSessionPayload {
  authenticated: true
  identity: {
    id: string
    discordUserId: string
    displayName: string
  }
  canSubmit: boolean
  request: {
    id: string
    discordIdentityId: string
    displayName: string
    motivation: string
    intendedUsage: string
    aionProfile: string | null
    expectedClients: string[]
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED'
    createdAt: string
    updatedAt: string
  } | null
}

function mapIdentity(identity: DiscordIdentityRecord) {
  return {
    id: identity.id,
    discordUserId: identity.discordUserId,
    displayName: identity.displayName
  }
}

function jsonBody(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function normalizeExpectedClients(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

export function createBetaAccessController(deps: BetaAccessControllerDeps) {
  const get = defineEventHandler(async event => {
    const identity = await resolveAuthenticatedDiscordIdentity(event, deps.discordStore)
    if (!identity) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Unauthorized'
      })
    }

    const status = await deps.application.getBetaAccessStatus(identity.id)
    const payload: BetaAccessSessionPayload = {
      authenticated: true,
      identity: mapIdentity(identity),
      canSubmit: status.canSubmit,
      request: status.request
    }

    return payload
  })

  const post = defineEventHandler(async event => {
    const identity = await resolveAuthenticatedDiscordIdentity(event, deps.discordStore)
    if (!identity) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Unauthorized'
      })
    }

    const body = jsonBody(await readBody(event))
    let result
    try {
      result = await deps.application.requestBetaAccess(identity, {
        displayName: String(body.displayName ?? ''),
        motivation: String(body.motivation ?? ''),
        intendedUsage: String(body.intendedUsage ?? ''),
        aionProfile:
          body.aionProfile == null || String(body.aionProfile).trim() === ''
            ? undefined
            : String(body.aionProfile),
        expectedClients: normalizeExpectedClients(body.expectedClients)
      })
    } catch (cause) {
      if (cause instanceof ZodError) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Invalid beta access request'
        })
      }

      if (cause instanceof ActiveBetaAccessRequestAlreadyExistsError) {
        throw createError({
          statusCode: 409,
          statusMessage: 'active_request_exists'
        })
      }

      if (cause instanceof BetaAccessResubmissionNotAllowedError) {
        throw createError({
          statusCode: 409,
          statusMessage: 'resubmission_not_allowed'
        })
      }

      throw cause
    }

    if (result.kind === 'request_exists') {
      throw createError({
        statusCode: 409,
        statusMessage: 'active_request_exists'
      })
    }

    const status = await deps.application.getBetaAccessStatus(identity.id)
    const payload: BetaAccessSessionPayload = {
      authenticated: true,
      identity: mapIdentity(identity),
      canSubmit: status.canSubmit,
      request: status.request
    }

    setResponseStatus(event, 201)
    return payload
  })

  return {
    get,
    post
  }
}
