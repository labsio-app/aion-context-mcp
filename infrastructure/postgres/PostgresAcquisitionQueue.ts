import { randomUUID } from 'node:crypto'
import type { Pool } from 'pg'
import type {
  AcquisitionJob,
  AcquisitionJobInput,
  AcquisitionQueue
} from '../../core/application/ports.js'

function mapJob(row: any): AcquisitionJob {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    payload: row.payload,
    error: row.error,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  }
}

export class PostgresAcquisitionQueue implements AcquisitionQueue {
  constructor(private readonly pool: Pool) {}

  async enqueue(input: AcquisitionJobInput): Promise<AcquisitionJob> {
    const id = randomUUID()
    const result = await this.pool.query(
      `INSERT INTO acquisition_jobs (id, type, status, payload)
       VALUES ($1, 'FETCH_SOURCE', 'PENDING', $2::jsonb)
       RETURNING *`,
      [id, JSON.stringify(input)]
    )
    return mapJob(result.rows[0])
  }

  async claimNext(): Promise<AcquisitionJob | null> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query(
        `SELECT *
         FROM acquisition_jobs
         WHERE status = 'PENDING'
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1`
      )

      if (!result.rows[0]) {
        await client.query('COMMIT')
        return null
      }

      const updated = await client.query(
        `UPDATE acquisition_jobs
         SET status = 'PROCESSING', updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [result.rows[0].id]
      )
      await client.query('COMMIT')
      return mapJob(updated.rows[0])
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async complete(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE acquisition_jobs
       SET status = 'COMPLETED', error = NULL, updated_at = now()
       WHERE id = $1`,
      [id]
    )
  }

  async fail(id: string, error: string): Promise<void> {
    await this.pool.query(
      `UPDATE acquisition_jobs
       SET status = 'FAILED', error = $2, updated_at = now()
       WHERE id = $1`,
      [id, error.slice(0, 2000)]
    )
  }
}
