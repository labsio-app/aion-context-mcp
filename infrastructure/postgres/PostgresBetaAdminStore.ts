import { randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import type {
  BetaAccessDecisionRecord,
  BetaAccessReviewFilter,
  BetaAccessReviewRecord,
  BetaAdminStore
} from '../../core/application/ports.js'
import { BetaAccessRequestNotFoundError } from '../../core/application/BetaAccessRequestNotFoundError.js'
import { InvalidBetaAccessTransitionError } from '../../core/application/InvalidBetaAccessTransitionError.js'

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

function mapReviewRecord(row: Record<string, unknown>): BetaAccessReviewRecord {
  return {
    request: {
      id: String(row.request_id),
      discordIdentityId: String(row.request_discord_identity_id),
      displayName: String(row.request_display_name),
      motivation: String(row.request_motivation),
      intendedUsage: String(row.request_intended_usage),
      aionProfile: row.request_aion_profile == null ? null : String(row.request_aion_profile),
      expectedClients: Array.isArray(row.request_expected_clients)
        ? row.request_expected_clients.filter((item): item is string => typeof item === 'string')
        : [],
      status: String(row.request_status) as BetaAccessReviewRecord['request']['status'],
      createdAt: toIso(row.request_created_at),
      updatedAt: toIso(row.request_updated_at)
    },
    identity: {
      id: String(row.identity_id),
      discordUserId: String(row.identity_discord_user_id),
      username: String(row.identity_username),
      globalName: row.identity_global_name == null ? null : String(row.identity_global_name),
      avatar: row.identity_avatar == null ? null : String(row.identity_avatar),
      displayName: String(row.identity_display_name),
      createdAt: toIso(row.identity_created_at),
      updatedAt: toIso(row.identity_updated_at)
    }
  }
}

function mapDecisionRecord(row: Record<string, unknown>): BetaAccessDecisionRecord {
  return {
    id: String(row.id),
    betaAccessRequestId: String(row.beta_access_request_id),
    adminDiscordIdentityId: String(row.admin_discord_identity_id),
    fromStatus: String(row.from_status) as BetaAccessDecisionRecord['fromStatus'],
    toStatus: String(row.to_status) as BetaAccessDecisionRecord['toStatus'],
    reason: row.reason == null ? null : String(row.reason),
    createdAt: toIso(row.created_at)
  }
}

async function queryReviewRecords(
  client: Pool | PoolClient,
  filter: BetaAccessReviewFilter,
  limit: number,
  id?: string
): Promise<BetaAccessReviewRecord[]> {
  const result = await client.query(
    `SELECT
       r.id AS request_id,
       r.discord_identity_id AS request_discord_identity_id,
       r.display_name AS request_display_name,
       r.motivation AS request_motivation,
       r.intended_usage AS request_intended_usage,
       r.aion_profile AS request_aion_profile,
       r.expected_clients AS request_expected_clients,
       r.status AS request_status,
       r.created_at AS request_created_at,
       r.updated_at AS request_updated_at,
       i.id AS identity_id,
       i.discord_user_id AS identity_discord_user_id,
       i.username AS identity_username,
       i.global_name AS identity_global_name,
       i.avatar AS identity_avatar,
       i.display_name AS identity_display_name,
       i.created_at AS identity_created_at,
       i.updated_at AS identity_updated_at
     FROM beta_access_requests r
     JOIN discord_identities i ON i.id = r.discord_identity_id
     WHERE ($1::text = 'ALL' OR r.status = $1)
       AND ($3::uuid IS NULL OR r.id = $3::uuid)
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT $2`,
    [filter, limit, id ?? null]
  )

  return (result.rows as Record<string, unknown>[]).map(mapReviewRecord)
}

async function rollbackQuietly(client: PoolClient) {
  try {
    await client.query('ROLLBACK')
  } catch {
    // Ignore rollback failures during cleanup.
  }
}

function isStatusMismatch(clientState: { status?: unknown } | null | undefined): boolean {
  return Boolean(clientState && clientState.status)
}

export class PostgresBetaAdminStore implements BetaAdminStore {
  constructor(private readonly pool: Pool) {}

  async listBetaAccessRequests(filter: BetaAccessReviewFilter): Promise<BetaAccessReviewRecord[]> {
    const result = await this.pool.query(
      `SELECT
         r.id AS request_id,
         r.discord_identity_id AS request_discord_identity_id,
         r.display_name AS request_display_name,
         r.motivation AS request_motivation,
         r.intended_usage AS request_intended_usage,
         r.aion_profile AS request_aion_profile,
         r.expected_clients AS request_expected_clients,
         r.status AS request_status,
         r.created_at AS request_created_at,
         r.updated_at AS request_updated_at,
         i.id AS identity_id,
         i.discord_user_id AS identity_discord_user_id,
         i.username AS identity_username,
         i.global_name AS identity_global_name,
         i.avatar AS identity_avatar,
         i.display_name AS identity_display_name,
         i.created_at AS identity_created_at,
         i.updated_at AS identity_updated_at
       FROM beta_access_requests r
       JOIN discord_identities i ON i.id = r.discord_identity_id
       WHERE ($1::text = 'ALL' OR r.status = $1)
       ORDER BY r.created_at DESC, r.id DESC
       LIMIT 100`,
      [filter]
    )

    return (result.rows as Record<string, unknown>[]).map(mapReviewRecord)
  }

  async getBetaAccessRequestById(id: string): Promise<BetaAccessReviewRecord | null> {
    const result = await this.pool.query(
      `SELECT
         r.id AS request_id,
         r.discord_identity_id AS request_discord_identity_id,
         r.display_name AS request_display_name,
         r.motivation AS request_motivation,
         r.intended_usage AS request_intended_usage,
         r.aion_profile AS request_aion_profile,
         r.expected_clients AS request_expected_clients,
         r.status AS request_status,
         r.created_at AS request_created_at,
         r.updated_at AS request_updated_at,
         i.id AS identity_id,
         i.discord_user_id AS identity_discord_user_id,
         i.username AS identity_username,
         i.global_name AS identity_global_name,
         i.avatar AS identity_avatar,
         i.display_name AS identity_display_name,
         i.created_at AS identity_created_at,
         i.updated_at AS identity_updated_at
       FROM beta_access_requests r
       JOIN discord_identities i ON i.id = r.discord_identity_id
       WHERE r.id = $1
       LIMIT 1`,
      [id]
    )

    const row = result.rows[0] as Record<string, unknown> | undefined
    return row ? mapReviewRecord(row) : null
  }

  async transitionBetaAccessRequest(input: {
    requestId: string
    adminDiscordIdentityId: string
    fromStatus: BetaAccessReviewRecord['request']['status']
    toStatus: BetaAccessReviewRecord['request']['status']
    reason: string | null
  }): Promise<{
    request: BetaAccessReviewRecord
    decision: BetaAccessDecisionRecord
  }> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const update = await client.query(
        `UPDATE beta_access_requests
            SET status = $2,
                updated_at = now()
          WHERE id = $1
            AND status = $3
          RETURNING
            id,
            discord_identity_id,
            display_name,
            motivation,
            intended_usage,
            aion_profile,
            expected_clients,
            status,
            created_at,
            updated_at`,
        [input.requestId, input.toStatus, input.fromStatus]
      )

      const row = update.rows[0] as Record<string, unknown> | undefined
      if (!row) {
        const current = await client.query(
          `SELECT status
             FROM beta_access_requests
            WHERE id = $1
            LIMIT 1`,
          [input.requestId]
        )

        await rollbackQuietly(client)
        if (!(current.rows[0] as { status?: unknown } | undefined)) {
          throw new BetaAccessRequestNotFoundError()
        }

        throw new InvalidBetaAccessTransitionError()
      }

      const identity = await client.query(
        `SELECT
           i.id AS identity_id,
           i.discord_user_id AS identity_discord_user_id,
           i.username AS identity_username,
           i.global_name AS identity_global_name,
           i.avatar AS identity_avatar,
           i.display_name AS identity_display_name,
           i.created_at AS identity_created_at,
           i.updated_at AS identity_updated_at
         FROM discord_identities i
         WHERE i.id = $1
         LIMIT 1`,
        [row.discord_identity_id]
      )

      const identityRow = identity.rows[0] as Record<string, unknown> | undefined
      if (!identityRow) {
        throw new Error('Discord identity missing for beta access request')
      }

      const decision = await client.query(
        `INSERT INTO beta_access_decisions
          (id, beta_access_request_id, admin_discord_identity_id, from_status, to_status, reason)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, beta_access_request_id, admin_discord_identity_id, from_status, to_status, reason, created_at`,
        [
          randomUUID(),
          input.requestId,
          input.adminDiscordIdentityId,
          input.fromStatus,
          input.toStatus,
          input.reason
        ]
      )

      await client.query('COMMIT')

      const review = mapReviewRecord({
        request_id: row.id,
        request_discord_identity_id: row.discord_identity_id,
        request_display_name: row.display_name,
        request_motivation: row.motivation,
        request_intended_usage: row.intended_usage,
        request_aion_profile: row.aion_profile,
        request_expected_clients: row.expected_clients,
        request_status: row.status,
        request_created_at: row.created_at,
        request_updated_at: row.updated_at,
        identity_id: identityRow.identity_id,
        identity_discord_user_id: identityRow.identity_discord_user_id,
        identity_username: identityRow.identity_username,
        identity_global_name: identityRow.identity_global_name,
        identity_avatar: identityRow.identity_avatar,
        identity_display_name: identityRow.identity_display_name,
        identity_created_at: identityRow.identity_created_at,
        identity_updated_at: identityRow.identity_updated_at
      })

      return {
        request: review,
        decision: mapDecisionRecord(decision.rows[0] as Record<string, unknown>)
      }
    } catch (cause) {
      await rollbackQuietly(client)
      throw cause
    } finally {
      client.release()
    }
  }
}
