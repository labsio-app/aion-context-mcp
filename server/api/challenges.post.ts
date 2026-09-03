import { getContainer } from '../../infrastructure/container.js'
import { requireAdminToken } from '../utils/auth.js'

export default defineEventHandler(async event => {
  requireAdminToken(event)
  const body = await readBody(event)

  if (!body.knowledgeId || !body.objection) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid challenge payload' })
  }

  return getContainer().knowledge.recordChallenge({
    knowledgeId: String(body.knowledgeId),
    objection: String(body.objection),
    sourceId: body.sourceId ? String(body.sourceId) : null
  })
})
