import { createServer } from 'node:http'
import { once } from 'node:events'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { postJson } from '../app/lib/post-json.js'

describe('console JSON transport', () => {
  beforeEach(() => {})

  afterEach(() => {})

  it('sends JSON POST requests with application/json content type', async () => {
    const seen: {
      contentType: string | null
      body: string
      authorization: string | null
    } = {
      contentType: null,
      body: '',
      authorization: null
    }

    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = []
      for await (const chunk of request) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      }

      seen.contentType = request.headers['content-type'] ?? null
      seen.authorization = request.headers.authorization ?? null
      seen.body = Buffer.concat(chunks).toString('utf8')

      response.statusCode = 200
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ ok: true }))
    })

    server.listen(0)
    await once(server, 'listening')

    try {
      const address = server.address()
      if (!address || typeof address === 'string') {
        throw new Error('failed to start test server')
      }

      const baseUrl = `http://127.0.0.1:${address.port}`
      const result = await postJson(`${baseUrl}`, '/api/sources', { title: 'A source' }, {
        headers: {
          Authorization: 'Bearer admin-token'
        }
      })

      expect(result).toEqual({ ok: true })
      expect(seen.contentType).toContain('application/json')
      expect(seen.authorization).toBe('Bearer admin-token')
      expect(JSON.parse(seen.body)).toEqual({ title: 'A source' })
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })
})
