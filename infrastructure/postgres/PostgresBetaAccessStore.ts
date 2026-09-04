import { randomUUID } from 'node:crypto'
import type { Pool } from 'pg'
import type {
  BetaAccessRequestRecord,
  BetaAccessStore
} from '../../core/application/ports.js'
import { ActiveBetaAccessRequestAlreadyExistsError } from '../../core/application/ActiveBetaAccessRequestAlreadyExistsError.js'

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

function mapRequest(row: Record<string, unknown>): BetaAccessRequestRecord {
  return {
    id: String(row.id),
    discordIdentityId: String(row.discord_identity_id),
    displayName: String(row.display_name),
    motivation: String(row.motivation),
    intendedUsage: String(row.intended_usage),
    aionProfile: row.aion_profile == null ? null : String(row.aion_profile),
    expectedClients: Array.isArray(row.expected_clients)
      ? row.expected_clients.filter((item): item is string => typeof item === 'string')
      : [],
    status: String(row.status) as BetaAccessRequestRecord['status'],
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  }
}

function isExpectedActiveRequestUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false

  const record = error as Record<string, unknown>
  return (
    record.code === '23505' &&
    record.constraint === 'ux_beta_access_requests_active_identity'
  )
}

export class PostgresBetaAccessStore implements BetaAccessStore {
  constructor(private readonly pool: Pool) {}

  async getLatestRequestByDiscordIdentityId(
    discordIdentityId: string
  ): Promise<BetaAccessRequestRecord | null> {
      const result = await this.pool.query(
        `SELECT id, discord_identity_id, display_name, motivation, intended_usage,
              aion_profile, expected_clients, status, created_at, updated_at
         FROM beta_access_requests
        WHERE discord_identity_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT 1`,
      [discordIdentityId]
    )

    const row = result.rows[0] as Record<string, unknown> | undefined
    return row ? mapRequest(row) : null
  }

  async getActiveRequestByDiscordIdentityId(
    discordIdentityId: string
  ): Promise<BetaAccessRequestRecord | null> {
      const result = await this.pool.query(
        `SELECT id, discord_identity_id, display_name, motivation, intended_usage,
              aion_profile, expected_clients, status, created_at, updated_at
         FROM beta_access_requests
        WHERE discord_identity_id = $1
          AND status IN ('PENDING', 'APPROVED')
        ORDER BY created_at DESC, id DESC
        LIMIT 1`,
      [discordIdentityId]
    )

    const row = result.rows[0] as Record<string, unknown> | undefined
    return row ? mapRequest(row) : null
  }

  async saveBetaAccessRequest(request: BetaAccessRequestRecord): Promise<BetaAccessRequestRecord> {
    try {
      const result = await this.pool.query(
        `INSERT INTO beta_access_requests
          (id, discord_identity_id, display_name, motivation, intended_usage, aion_profile, expected_clients, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8, $9, $10)
         RETURNING id, discord_identity_id, display_name, motivation, intended_usage, aion_profile, expected_clients, status, created_at, updated_at`,
        [
          request.id || randomUUID(),
          request.discordIdentityId,
          request.displayName,
          request.motivation,
          request.intendedUsage,
          request.aionProfile,
          request.expectedClients,
          request.status,
          request.createdAt,
          request.updatedAt
        ]
      )

      return mapRequest(result.rows[0] as Record<string, unknown>)
    } catch (cause) {
      if (isExpectedActiveRequestUniqueViolation(cause)) {
        throw new ActiveBetaAccessRequestAlreadyExistsError()
      }

      throw cause
    }
  }
}
