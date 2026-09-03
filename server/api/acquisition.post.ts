import { gameScopes } from '../../core/domain/model.js'
import { getContainer } from '../../infrastructure/container.js'
import { requireAdminToken } from '../utils/auth.js'

export default defineEventHandler(async event => {
  requireAdminToken(event)
  const body = await readBody(event)

  if (!body.url || !gameScopes.includes(body.scope)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid acquisition payload' })
  }

  return getContainer().acquisition.enqueueSource({
    url: String(body.url),
    title: body.title ? String(body.title) : undefined,
    scope: body.scope,
    content: body.content ? String(body.content) : undefined,
    notes: body.notes ? String(body.notes) : undefined
  })
})
