import { randomUUID } from 'node:crypto'
import type { Pool } from 'pg'
import type { McpActivityRecord, McpActivityStore } from '../../core/application/ports.js'

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

function mapActivity(row: Record<string, unknown>): McpActivityRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    credentialId: row.credential_id == null ? null : String(row.credential_id),
    authenticationMethod: String(row.authentication_method) as McpActivityRecord['authenticationMethod'],
    toolName: String(row.tool_name),
    outcome: String(row.outcome) as McpActivityRecord['outcome'],
    durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
    createdAt: toIso(row.created_at)
  }
}

export class PostgresMcpActivityStore implements McpActivityStore {
  constructor(private readonly pool: Pool) {}

  async saveActivity(activity: McpActivityRecord): Promise<McpActivityRecord> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')

      if (activity.credentialId) {
        await client.query(
          `UPDATE mcp_credentials
              SET last_used_at = $2
            WHERE id = $1`,
          [activity.credentialId, activity.createdAt]
        )
      }

      const result = await client.query(
        `INSERT INTO mcp_activities
          (id, user_id, credential_id, authentication_method, tool_name, outcome, duration_ms, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, user_id, credential_id, authentication_method, tool_name, outcome, duration_ms, created_at`,
        [
          activity.id || randomUUID(),
          activity.userId,
          activity.credentialId,
          activity.authenticationMethod,
          activity.toolName,
          activity.outcome,
          activity.durationMs,
          activity.createdAt
        ]
      )

      await client.query('COMMIT')
      return mapActivity(result.rows[0] as Record<string, unknown>)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async listActivityForUser(userId: string, limit: number): Promise<McpActivityRecord[]> {
    const result = await this.pool.query(
      `SELECT id, user_id, credential_id, authentication_method, tool_name, outcome, duration_ms, created_at
         FROM mcp_activities
        WHERE user_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT $2`,
      [userId, limit]
    )

    return result.rows.map(row => mapActivity(row as Record<string, unknown>))
  }
}
