import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'
import {
  registerOAuthRoutes,
  resetOAuthClientMetadataCache,
  validateAuthorizationRequest
} from '../mcp/oauth.js'

describe('OAuth authorization', () => {
  beforeEach(() => {
    resetOAuthClientMetadataCache()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('allows the built-in ChatGPT redirect URI fallback', async () => {
    const result = await validateAuthorizationRequest({
      response_type: 'code',
      client_id: 'chatgpt',
      redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
      code_challenge: 'abc123',
      code_challenge_method: 'S256'
    })

    expect('value' in result).toBe(true)
  })

  it('accepts a client_id URL when the metadata document registers the redirect URI', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({
        'cache-control': 'max-age=60'
      }),
      json: async () => ({
        client_id: 'https://app.example.com/oauth/client-metadata.json',
        client_name: 'Example MCP Client',
        redirect_uris: ['http://127.0.0.1:3000/callback']
      })
    }))

    vi.stubGlobal('fetch', fetchMock)

    const result = await validateAuthorizationRequest({
      response_type: 'code',
      client_id: 'https://app.example.com/oauth/client-metadata.json',
      redirect_uri: 'http://127.0.0.1:3000/callback',
      code_challenge: 'abc123',
      code_challenge_method: 'S256'
    })

    expect('value' in result).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects redirect URIs that are not registered by the client metadata document', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      headers: new Headers({
        'cache-control': 'max-age=60'
      }),
      json: async () => ({
        client_id: 'https://app.example.com/oauth/client-metadata.json',
        client_name: 'Example MCP Client',
        redirect_uris: ['http://127.0.0.1:3000/callback']
      })
    })))

    const result = await validateAuthorizationRequest({
      response_type: 'code',
      client_id: 'https://app.example.com/oauth/client-metadata.json',
      redirect_uri: 'http://127.0.0.1:9999/callback',
      code_challenge: 'abc123',
      code_challenge_method: 'S256'
    })

    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toBe('invalid_request')
      expect(result.description).toMatch(/redirect_uri/)
    }
  })
})

describe('OAuth browser session', () => {
  beforeEach(() => {
    vi.stubEnv('MCP_OAUTH_PASSWORD', 'test-password')
    vi.stubEnv('MCP_OAUTH_JWT_SECRET', 'test-jwt-secret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('lets a signed-in browser approve a client without entering the password again', async () => {
    const app = Fastify()
    await registerOAuthRoutes(app)

    try {
      const signIn = await app.inject({
        method: 'POST',
        url: '/oauth/session',
        payload: { password: 'test-password' }
      })
      expect(signIn.statusCode).toBe(200)
      expect(signIn.json()).toEqual({ authenticated: true })

      const setCookie = signIn.headers['set-cookie']
      const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(';')[0]
      expect(cookie).toBeTruthy()

      const session = await app.inject({
        method: 'GET',
        url: '/oauth/session',
        headers: { cookie: cookie as string }
      })
      expect(session.json()).toEqual({ authenticated: true })

      const authorize = await app.inject({
        method: 'GET',
        url: '/oauth/authorize?response_type=code&client_id=chatgpt&redirect_uri=https%3A%2F%2Fchatgpt.com%2Fconnector_platform_oauth_redirect&code_challenge=test-value&code_challenge_method=S256',
        headers: { cookie: cookie as string }
      })
      expect(authorize.statusCode).toBe(200)
      expect(authorize.body).toContain('You are signed in. Confirm access for this client.')
      expect(authorize.body).not.toContain('Authorization password')
    } finally {
      await app.close()
    }
  })
})
