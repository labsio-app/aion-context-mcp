import { randomUUID } from 'node:crypto'
import type { Pool } from 'pg'
import type { McpCredentialRecord, McpCredentialStore } from '../../core/application/ports.js'

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

function mapCredential(row: Record<string, unknown>): McpCredentialRecord {
  return {
    id: String(row.id),
    discordIdentityId: String(row.discord_identity_id),
    oauthClientId: String(row.oauth_client_id),
    status: String(row.status) as McpCredentialRecord['status'],
    issuedAt: toIso(row.issued_at),
    revokedAt: row.revoked_at == null ? null : toIso(row.revoked_at),
    lastUsedAt: row.last_used_at == null ? null : toIso(row.last_used_at)
  }
}

export class PostgresMcpCredentialStore implements McpCredentialStore {
  constructor(private readonly pool: Pool) {}

  async createCredential(credential: McpCredentialRecord): Promise<McpCredentialRecord> {
    const id = credential.id || randomUUID()
    const result = await this.pool.query(
      `INSERT INTO mcp_credentials
        (id, discord_identity_id, oauth_client_id, status, issued_at, revoked_at, last_used_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, discord_identity_id, oauth_client_id, status, issued_at, revoked_at, last_used_at`,
      [
        id,
        credential.discordIdentityId,
        credential.oauthClientId,
        credential.status,
        credential.issuedAt,
        credential.revokedAt,
        credential.lastUsedAt
      ]
    )

    return mapCredential(result.rows[0] as Record<string, unknown>)
  }

  async getCredentialById(id: string): Promise<McpCredentialRecord | null> {
    const result = await this.pool.query(
      `SELECT id, discord_identity_id, oauth_client_id, status, issued_at, revoked_at, last_used_at
       FROM mcp_credentials
       WHERE id = $1
       LIMIT 1`,
      [id]
    )

    const row = result.rows[0] as Record<string, unknown> | undefined
    return row ? mapCredential(row) : null
  }

  async revokeCredential(id: string): Promise<McpCredentialRecord | null> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const current = await client.query(
        `SELECT id, discord_identity_id, oauth_client_id, status, issued_at, revoked_at, last_used_at
         FROM mcp_credentials
         WHERE id = $1
         FOR UPDATE`,
        [id]
      )

      const row = current.rows[0] as Record<string, unknown> | undefined
      if (!row) {
        await client.query('ROLLBACK')
        return null
      }

      if (String(row.status) === 'REVOKED') {
        await client.query('COMMIT')
        return mapCredential(row)
      }

      const revokedAt = new Date().toISOString()
      const updated = await client.query(
        `UPDATE mcp_credentials
            SET status = 'REVOKED',
                revoked_at = $2
          WHERE id = $1
          RETURNING id, discord_identity_id, oauth_client_id, status, issued_at, revoked_at, last_used_at`,
        [id, revokedAt]
      )

      await client.query('COMMIT')
      return mapCredential(updated.rows[0] as Record<string, unknown>)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
}
