import { gameScopes } from '../../core/domain/model.js'
import { getContainer } from '../../infrastructure/container.js'
import { requireAdminToken } from '../utils/auth.js'

export default defineEventHandler(async event => {
  requireAdminToken(event)
  const query = getQuery(event)
  const q = String(query.q ?? '').trim()
  const rawScope = query.scope ? String(query.scope) : undefined
  const scope = gameScopes.includes(rawScope as any) ? (rawScope as any) : undefined
  const parsedLimit = Number(query.limit ?? 8)
  const limit = Number.isFinite(parsedLimit) ? Math.trunc(parsedLimit) : 8

  if (!q) {
    throw createError({ statusCode: 400, statusMessage: 'q is required' })
  }

  return getContainer().knowledge.searchContext({ query: q, scope, limit })
})
