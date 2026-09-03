import type { H3Event } from 'h3'

export function requireAdminToken(event: H3Event) {
  const config = useRuntimeConfig(event)
  const expected = String(config.adminToken ?? '')
  if (!expected) {
    if (process.env.NODE_ENV === 'production') {
      throw createError({
        statusCode: 500,
        statusMessage: 'NUXT_ADMIN_TOKEN is required in production'
      })
    }
    return
  }

  const authorization = getHeader(event, 'authorization') ?? ''
  const provided = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : ''

  if (provided !== expected) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    })
  }
}
