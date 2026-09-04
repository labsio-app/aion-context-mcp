import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import {
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
