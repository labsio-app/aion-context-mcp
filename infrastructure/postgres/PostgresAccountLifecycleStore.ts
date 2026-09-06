import type { Pool, PoolClient } from 'pg'
import type {
  AccountLifecycleStore,
  MyAccountRecord,
  MyBetaAccessStatusRecord,
  MyMcpCredentialRecord
} from '../../core/application/ports.js'

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

function mapCredential(row: Record<string, unknown>): MyMcpCredentialRecord {
  return {
    id: String(row.id),
    oauthClientId: String(row.oauth_client_id),
    status: String(row.status) as MyMcpCredentialRecord['status'],
    issuedAt: toIso(row.issued_at),
    revokedAt: row.revoked_at == null ? null : toIso(row.revoked_at),
    lastUsedAt: row.last_used_at == null ? null : toIso(row.last_used_at)
  }
}

function mapBetaStatus(row: Record<string, unknown> | undefined): MyBetaAccessStatusRecord {
  if (!row) {
    return {
      status: 'NONE',
      requestId: null,
      updatedAt: null
    }
  }

  return {
    status: String(row.status) as MyBetaAccessStatusRecord['status'],
    requestId: String(row.id),
    updatedAt: toIso(row.updated_at)
  }
}

function mapAccount(row: Record<string, unknown>, betaStatus: MyBetaAccessStatusRecord, credentials: MyMcpCredentialRecord[]): MyAccountRecord {
  return {
    identity: {
      id: String(row.id),
      discordUserId: String(row.discord_user_id),
      displayName: String(row.display_name)
    },
    betaStatus,
    mcpCredentials: credentials
  }
}

async function rollbackQuietly(client: PoolClient) {
  try {
    await client.query('ROLLBACK')
  } catch {
    // Ignore rollback failures during cleanup.
  }
}

export class PostgresAccountLifecycleStore implements AccountLifecycleStore {
  constructor(private readonly pool: Pool) {}

  async getMyAccount(identityId: string): Promise<MyAccountRecord | null> {
    const identityResult = await this.pool.query(
      `SELECT id, discord_user_id, display_name
         FROM discord_identities
        WHERE id = $1
        LIMIT 1`,
      [identityId]
    )

    const identityRow = identityResult.rows[0] as Record<string, unknown> | undefined
    if (!identityRow) return null

    const betaStatusResult = await this.pool.query(
      `SELECT id, status, updated_at
         FROM beta_access_requests
        WHERE discord_identity_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT 1`,
      [identityId]
    )

    const credentialsResult = await this.pool.query(
      `SELECT id, oauth_client_id, status, issued_at, revoked_at, last_used_at
         FROM mcp_credentials
        WHERE discord_identity_id = $1
        ORDER BY issued_at DESC, id DESC`,
      [identityId]
    )

    return mapAccount(
      identityRow,
      mapBetaStatus(betaStatusResult.rows[0] as Record<string, unknown> | undefined),
      credentialsResult.rows.map(row => mapCredential(row as Record<string, unknown>))
    )
  }

  async listMyMcpCredentials(identityId: string): Promise<MyMcpCredentialRecord[]> {
    const result = await this.pool.query(
      `SELECT id, oauth_client_id, status, issued_at, revoked_at, last_used_at
         FROM mcp_credentials
        WHERE discord_identity_id = $1
        ORDER BY issued_at DESC, id DESC`,
      [identityId]
    )

    return result.rows.map(row => mapCredential(row as Record<string, unknown>))
  }

  async revokeMyMcpCredential(
    identityId: string,
    credentialId: string
  ): Promise<MyMcpCredentialRecord | null> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query(
        `UPDATE mcp_credentials
            SET status = 'REVOKED',
                revoked_at = COALESCE(revoked_at, now())
          WHERE id = $1
            AND discord_identity_id = $2
            AND status = 'ACTIVE'
          RETURNING id, oauth_client_id, status, issued_at, revoked_at, last_used_at`,
        [credentialId, identityId]
      )

      const row = result.rows[0] as Record<string, unknown> | undefined
      if (!row) {
        await rollbackQuietly(client)
        return null
      }

      await client.query('COMMIT')
      return mapCredential(row)
    } catch (error) {
      await rollbackQuietly(client)
      throw error
    } finally {
      client.release()
    }
  }

  async revokeAllMyMcpCredentials(identityId: string): Promise<MyMcpCredentialRecord[]> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query(
        `UPDATE mcp_credentials
            SET status = 'REVOKED',
                revoked_at = COALESCE(revoked_at, now())
          WHERE discord_identity_id = $1
            AND status = 'ACTIVE'
          RETURNING id, oauth_client_id, status, issued_at, revoked_at, last_used_at`,
        [identityId]
      )

      await client.query('COMMIT')
      return result.rows.map(row => mapCredential(row as Record<string, unknown>))
    } catch (error) {
      await rollbackQuietly(client)
      throw error
    } finally {
      client.release()
    }
  }

  async deleteMyBetaAccount(identityId: string): Promise<void> {
    const client = await this.pool.connect()
    const deletedAt = new Date().toISOString()
    try {
      await client.query('BEGIN')

      const identityResult = await client.query(
        `SELECT id
           FROM discord_identities
          WHERE id = $1
          FOR UPDATE`,
        [identityId]
      )

      if (!identityResult.rows[0]) {
        await rollbackQuietly(client)
        return
      }

      await client.query(
        `UPDATE mcp_credentials
            SET status = 'REVOKED',
                revoked_at = COALESCE(revoked_at, $2)
          WHERE discord_identity_id = $1
            AND status = 'ACTIVE'`,
        [identityId, deletedAt]
      )

      await client.query(
        `UPDATE beta_access_requests
            SET status = CASE
              WHEN status IN ('PENDING', 'APPROVED') THEN 'REVOKED'
              ELSE status
            END,
                display_name = 'Deleted account',
                motivation = '[deleted]',
                intended_usage = '[deleted]',
                aion_profile = NULL,
                updated_at = CASE
                  WHEN status IN ('PENDING', 'APPROVED') THEN $2
                  ELSE updated_at
                END
          WHERE discord_identity_id = $1`,
        [identityId, deletedAt]
      )

      await client.query(
        `UPDATE discord_identities
            SET discord_user_id = CONCAT('deleted:', id::text),
                username = 'deleted-user',
                global_name = NULL,
                avatar = NULL,
                display_name = 'Deleted account',
                updated_at = $2
          WHERE id = $1`,
        [identityId, deletedAt]
      )

      await client.query(
        `DELETE FROM oauth_authorization_codes
          WHERE discord_identity_id = $1`,
        [identityId]
      )

      await client.query(
        `DELETE FROM discord_browser_sessions
          WHERE identity_id = $1`,
        [identityId]
      )

      await client.query('COMMIT')
    } catch (error) {
      await rollbackQuietly(client)
      throw error
    } finally {
      client.release()
    }
  }
}
