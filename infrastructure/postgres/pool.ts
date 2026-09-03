import { readFileSync } from 'node:fs'
import pg from 'pg'

const { Pool } = pg

let pool: pg.Pool | undefined

function normalizeSchemaName(value: string | undefined): string | undefined {
  const schema = value?.trim()
  if (!schema) return undefined
  const safe = schema.replace(/[^a-zA-Z0-9_]/g, '')
  return safe || undefined
}

function resolvePassword(): string | undefined {
  const passwordFile = process.env.PGPASSWORD_FILE?.trim()
  if (passwordFile) {
    return readFileSync(passwordFile, 'utf8').trim()
  }

  const password = process.env.PGPASSWORD?.trim()
  return password || undefined
}

function buildPoolConfig(): pg.PoolConfig {
  const schema = normalizeSchemaName(process.env.PGSCHEMA ?? process.env.APP_SCHEMA)
  const searchPath = schema ? `${schema},public` : undefined

  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      max: 10,
      ...(searchPath ? { options: `-c search_path=${searchPath}` } : {})
    }
  }

  return {
    host: process.env.PGHOST ?? 'localhost',
    port: Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE ?? 'postgres',
    user: process.env.PGUSER ?? 'postgres',
    password: resolvePassword(),
    max: 10,
    ...(searchPath ? { options: `-c search_path=${searchPath}` } : {})
  }
}

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool(buildPoolConfig())
  }

  return pool
}
