import {
  confidenceLevels,
  gameScopes,
  knowledgeKinds
} from '../../core/domain/model.js'
import { getContainer } from '../../infrastructure/container.js'
import { requireAdminToken } from '../utils/auth.js'

export default defineEventHandler(async event => {
  requireAdminToken(event)
  const body = await readBody(event)

  if (
    !knowledgeKinds.includes(body.kind) ||
    !gameScopes.includes(body.scope) ||
    (body.confidence && !confidenceLevels.includes(body.confidence)) ||
    !body.statement
  ) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid knowledge payload' })
  }

  return getContainer().knowledge.recordKnowledge({
    kind: body.kind,
    statement: String(body.statement),
    scope: body.scope,
    confidence: body.confidence,
    applicability: body.applicability ? String(body.applicability) : null,
    notes: body.notes ? String(body.notes) : null,
    tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
    sourceIds: Array.isArray(body.sourceIds) ? body.sourceIds.map(String) : []
  })
})
