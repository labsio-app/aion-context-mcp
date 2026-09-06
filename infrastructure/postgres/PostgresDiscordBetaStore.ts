import { randomUUID } from 'node:crypto'
import type { Pool } from 'pg'
import type {
  DiscordBetaStore,
  DiscordBrowserSessionRecord,
  DiscordIdentityRecord
} from '../../core/application/ports.js'

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

function mapIdentity(row: Record<string, unknown>): DiscordIdentityRecord {
  return {
    id: String(row.id),
    discordUserId: String(row.discord_user_id),
    username: String(row.username),
    globalName: row.global_name == null ? null : String(row.global_name),
    avatar: row.avatar == null ? null : String(row.avatar),
    displayName: String(row.display_name),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  }
}

function mapSession(row: Record<string, unknown>): DiscordBrowserSessionRecord {
  return {
    id: String(row.id),
    identityId: String(row.identity_id),
    tokenHash: String(row.token_hash),
    expiresAt: toIso(row.expires_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  }
}

export class PostgresDiscordBetaStore implements DiscordBetaStore {
  constructor(private readonly pool: Pool) {}

  async upsertIdentity(input: {
    discordUserId: string
    username: string
    globalName: string | null
    avatar: string | null
  }): Promise<DiscordIdentityRecord> {
    const id = randomUUID()
    const displayName = input.globalName?.trim() || input.username.trim()
    const result = await this.pool.query(
      `INSERT INTO discord_identities
        (id, discord_user_id, username, global_name, avatar, display_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (discord_user_id) DO UPDATE
         SET username = EXCLUDED.username,
             global_name = EXCLUDED.global_name,
             avatar = EXCLUDED.avatar,
             display_name = EXCLUDED.display_name,
             updated_at = now()
       RETURNING id, discord_user_id, username, global_name, avatar, display_name, created_at, updated_at`,
      [id, input.discordUserId, input.username, input.globalName, input.avatar, displayName]
    )

    return mapIdentity(result.rows[0] as Record<string, unknown>)
  }

  async getIdentityById(identityId: string): Promise<DiscordIdentityRecord | null> {
    const result = await this.pool.query(
      `SELECT id, discord_user_id, username, global_name, avatar, display_name, created_at, updated_at
       FROM discord_identities
       WHERE id = $1
       LIMIT 1`,
      [identityId]
    )

    const row = result.rows[0] as Record<string, unknown> | undefined
    if (!row) return null

    return mapIdentity(row)
  }

  async createSession(input: {
    identityId: string
    tokenHash: string
    expiresAt: string
  }): Promise<DiscordBrowserSessionRecord> {
    const id = randomUUID()
    const result = await this.pool.query(
      `INSERT INTO discord_browser_sessions
        (id, identity_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id, identity_id, token_hash, expires_at, created_at, updated_at`,
      [id, input.identityId, input.tokenHash, input.expiresAt]
    )

    return mapSession(result.rows[0] as Record<string, unknown>)
  }

  async getSession(tokenHash: string): Promise<{
    session: DiscordBrowserSessionRecord
    identity: DiscordIdentityRecord
  } | null> {
    const result = await this.pool.query(
      `SELECT
         s.id AS session_id,
         s.identity_id,
         s.token_hash,
         s.expires_at,
         s.created_at AS session_created_at,
         s.updated_at AS session_updated_at,
         i.id AS identity_id_value,
         i.discord_user_id,
         i.username,
         i.global_name,
         i.avatar,
         i.display_name,
         i.created_at AS identity_created_at,
         i.updated_at AS identity_updated_at
       FROM discord_browser_sessions s
       JOIN discord_identities i ON i.id = s.identity_id
       WHERE s.token_hash = $1
         AND s.expires_at > now()
       LIMIT 1`,
      [tokenHash]
    )

    const row = result.rows[0] as Record<string, unknown> | undefined
    if (!row) return null

    return {
      session: {
        id: String(row.session_id),
        identityId: String(row.identity_id),
        tokenHash,
        expiresAt: toIso(row.expires_at),
        createdAt: toIso(row.session_created_at),
        updatedAt: toIso(row.session_updated_at)
      },
      identity: {
        id: String(row.identity_id_value),
        discordUserId: String(row.discord_user_id),
        username: String(row.username),
        globalName: row.global_name == null ? null : String(row.global_name),
        avatar: row.avatar == null ? null : String(row.avatar),
        displayName: String(row.display_name),
        createdAt: toIso(row.identity_created_at),
        updatedAt: toIso(row.identity_updated_at)
      }
    }
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.pool.query(`DELETE FROM discord_browser_sessions WHERE token_hash = $1`, [tokenHash])
  }
}
