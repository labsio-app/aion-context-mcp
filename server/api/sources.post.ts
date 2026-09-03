import { sourceKinds, gameScopes } from '../../core/domain/model.js'
import { getContainer } from '../../infrastructure/container.js'
import { requireAdminToken } from '../utils/auth.js'

export default defineEventHandler(async event => {
  requireAdminToken(event)
  const body = await readBody(event)

  if (!sourceKinds.includes(body.kind) || !gameScopes.includes(body.scope) || !body.title) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid source payload' })
  }

  return getContainer().knowledge.recordSource({
    kind: body.kind,
    url: body.url || null,
    title: String(body.title),
    scope: body.scope,
    content: String(body.content ?? ''),
    notes: body.notes ? String(body.notes) : null
  })
})
