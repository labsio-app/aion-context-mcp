import type { Pool } from 'pg'
import type {
  Challenge,
  ChallengeStatus,
  GameScope,
  KnowledgeItem,
  KnowledgeSearchHit,
  Source,
  SourceSearchHit
} from '../../core/domain/model.js'
import type { KnowledgeStore } from '../../core/application/ports.js'

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  return new Date(String(value)).toISOString()
}

function sourceFromRow(row: any): Source {
  return {
    id: row.id,
    kind: row.kind,
    url: row.url,
    title: row.title,
    scope: row.scope,
    content: row.content ?? '',
    notes: row.notes,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  }
}

function knowledgeFromRow(row: any): KnowledgeItem {
  return {
    id: row.id,
    kind: row.kind,
    statement: row.statement,
    scope: row.scope,
    confidence: row.confidence,
    status: row.status,
    applicability: row.applicability,
    notes: row.notes,
    tags: row.tags ?? [],
    sourceIds: row.source_ids ?? [],
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  }
}

function challengeFromRow(row: any): Challenge {
  return {
    id: row.id,
    knowledgeId: row.knowledge_id,
    objection: row.objection,
    sourceId: row.source_id,
    status: row.status,
    resolution: row.resolution,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  }
}

export class PostgresKnowledgeStore implements KnowledgeStore {
  constructor(private readonly pool: Pool) {}

  async saveSource(source: Source): Promise<Source> {
    const result = await this.pool.query(
      `INSERT INTO sources
       (id, kind, url, title, scope, content, notes, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        source.id,
        source.kind,
        source.url,
        source.title,
        source.scope,
        source.content,
        source.notes,
        source.createdAt,
        source.updatedAt
      ]
    )
    return sourceFromRow(result.rows[0])
  }

  async getSource(id: string): Promise<Source | null> {
    const result = await this.pool.query('SELECT * FROM sources WHERE id = $1', [id])
    return result.rows[0] ? sourceFromRow(result.rows[0]) : null
  }

  async searchSources(query: string, scope: GameScope | null, limit: number): Promise<SourceSearchHit[]> {
    if (!query) {
      const result = await this.pool.query(
        `SELECT *, 0::float8 AS score
         FROM sources
         WHERE ($1::text IS NULL OR scope = $1)
         ORDER BY created_at DESC
         LIMIT $2`,
        [scope, limit]
      )

      return result.rows.map(row => ({
        ...sourceFromRow(row),
        content: undefined,
        excerpt: (row.content ?? '').slice(0, 700),
        score: Number(row.score)
      }) as unknown as SourceSearchHit)
    }

    const result = await this.pool.query(
      `SELECT *,
          (
            ts_rank(
              to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(content,'') || ' ' || coalesce(notes,'')),
              websearch_to_tsquery('simple', $1)
            )
            + similarity(lower(title), lower($1))
          )::float8 AS score
       FROM sources
       WHERE ($2::text IS NULL OR scope = $2)
         AND (
           to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(content,'') || ' ' || coalesce(notes,''))
             @@ websearch_to_tsquery('simple', $1)
           OR similarity(lower(title), lower($1)) > 0.08
           OR lower(content) LIKE '%' || lower($1) || '%'
         )
       ORDER BY score DESC, updated_at DESC
       LIMIT $3`,
      [query, scope, limit]
    )

    return result.rows.map(row => ({
      id: row.id,
      kind: row.kind,
      url: row.url,
      title: row.title,
      scope: row.scope,
      notes: row.notes,
      excerpt: (row.content ?? '').slice(0, 900),
      score: Number(row.score ?? 0),
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at)
    }))
  }

  async saveKnowledge(item: KnowledgeItem): Promise<KnowledgeItem> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query(
        `INSERT INTO knowledge_items
         (id, kind, statement, scope, confidence, status, applicability, notes, tags, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [
          item.id,
          item.kind,
          item.statement,
          item.scope,
          item.confidence,
          item.status,
          item.applicability,
          item.notes,
          item.tags,
          item.createdAt,
          item.updatedAt
        ]
      )

      for (const sourceId of item.sourceIds) {
        await client.query(
          `INSERT INTO knowledge_sources (knowledge_id, source_id)
           VALUES ($1,$2)
           ON CONFLICT DO NOTHING`,
          [item.id, sourceId]
        )
      }

      await client.query('COMMIT')
      return {
        ...knowledgeFromRow(result.rows[0]),
        sourceIds: item.sourceIds
      }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async getKnowledge(id: string): Promise<KnowledgeItem | null> {
    const result = await this.pool.query(
      `SELECT k.*,
          coalesce(array_agg(ks.source_id) FILTER (WHERE ks.source_id IS NOT NULL), '{}') AS source_ids
       FROM knowledge_items k
       LEFT JOIN knowledge_sources ks ON ks.knowledge_id = k.id
       WHERE k.id = $1
       GROUP BY k.id`,
      [id]
    )
    return result.rows[0] ? knowledgeFromRow(result.rows[0]) : null
  }

  async searchKnowledge(query: string, scope: GameScope | null, limit: number): Promise<KnowledgeSearchHit[]> {
    const params = [scope, limit]

    if (!query) {
      const result = await this.pool.query(
        `SELECT k.*,
            coalesce(array_agg(ks.source_id) FILTER (WHERE ks.source_id IS NOT NULL), '{}') AS source_ids,
            0::float8 AS score
         FROM knowledge_items k
         LEFT JOIN knowledge_sources ks ON ks.knowledge_id = k.id
         WHERE ($1::text IS NULL OR k.scope = $1)
         GROUP BY k.id
         ORDER BY k.updated_at DESC
         LIMIT $2`,
        params
      )

      return result.rows.map(row => ({
        ...knowledgeFromRow(row),
        score: Number(row.score)
      }))
    }

    const result = await this.pool.query(
      `SELECT k.*,
          coalesce(array_agg(ks.source_id) FILTER (WHERE ks.source_id IS NOT NULL), '{}') AS source_ids,
          (
            ts_rank(
              to_tsvector('simple',
                coalesce(k.statement,'') || ' ' ||
                coalesce(k.applicability,'') || ' ' ||
                coalesce(k.notes,'') || ' ' ||
                array_to_string(k.tags, ' ')
              ),
              websearch_to_tsquery('simple', $1)
            )
            + similarity(lower(k.statement), lower($1))
          )::float8 AS score
       FROM knowledge_items k
       LEFT JOIN knowledge_sources ks ON ks.knowledge_id = k.id
       WHERE ($2::text IS NULL OR k.scope = $2)
         AND (
           to_tsvector('simple',
             coalesce(k.statement,'') || ' ' ||
             coalesce(k.applicability,'') || ' ' ||
             coalesce(k.notes,'') || ' ' ||
             array_to_string(k.tags, ' ')
           ) @@ websearch_to_tsquery('simple', $1)
           OR similarity(lower(k.statement), lower($1)) > 0.08
           OR lower(k.statement) LIKE '%' || lower($1) || '%'
         )
       GROUP BY k.id
       ORDER BY score DESC, k.updated_at DESC
       LIMIT $3`,
      [query, scope, limit]
    )

    return result.rows.map(row => ({
      ...knowledgeFromRow(row),
      score: Number(row.score ?? 0)
    }))
  }

  async saveChallenge(challenge: Challenge): Promise<Challenge> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query(
        `INSERT INTO challenges
         (id, knowledge_id, objection, source_id, status, resolution, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING *`,
        [
          challenge.id,
          challenge.knowledgeId,
          challenge.objection,
          challenge.sourceId,
          challenge.status,
          challenge.resolution,
          challenge.createdAt,
          challenge.updatedAt
        ]
      )
      await client.query(
        `UPDATE knowledge_items
         SET status = 'CHALLENGED', updated_at = now()
         WHERE id = $1 AND status = 'ACTIVE'`,
        [challenge.knowledgeId]
      )
      await client.query('COMMIT')
      return challengeFromRow(result.rows[0])
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async listChallenges(input: {
    knowledgeIds?: string[]
    status?: ChallengeStatus
    limit: number
  }): Promise<Challenge[]> {
    const result = await this.pool.query(
      `SELECT *
       FROM challenges
       WHERE ($1::text IS NULL OR status = $1)
         AND ($2::uuid[] IS NULL OR knowledge_id = ANY($2))
       ORDER BY created_at DESC
       LIMIT $3`,
      [
        input.status ?? null,
        input.knowledgeIds?.length ? input.knowledgeIds : null,
        input.limit
      ]
    )

    return result.rows.map(challengeFromRow)
  }
}
