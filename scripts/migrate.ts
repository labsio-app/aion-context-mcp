import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getPool } from '../infrastructure/postgres/pool.js'

function normalizeSchemaName(value: string | undefined): string | undefined {
  const schema = value?.trim()
  if (!schema) return undefined
  const safe = schema.replace(/[^a-zA-Z0-9_]/g, '')
  return safe || undefined
}

const migrationsDir = resolve(process.cwd(), 'migrations')
const files = (await readdir(migrationsDir))
  .filter(file => file.endsWith('.sql'))
  .sort()

const pool = getPool()
const schema = normalizeSchemaName(process.env.PGSCHEMA ?? process.env.APP_SCHEMA)

if (schema) {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`)
}

await pool.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`)

for (const file of files) {
  const applied = await pool.query(
    'SELECT 1 FROM schema_migrations WHERE name = $1',
    [file]
  )
  if (applied.rowCount) continue

  const sql = await readFile(resolve(migrationsDir, file), 'utf8')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(sql)
    await client.query(
      'INSERT INTO schema_migrations (name) VALUES ($1)',
      [file]
    )
    await client.query('COMMIT')
    console.log(`applied ${file}`)
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

await pool.end()
