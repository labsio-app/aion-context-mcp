import { afterEach, describe, expect, it, vi } from 'vitest'
import { getBuildInfo } from '../infrastructure/version.js'

describe('Build info', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('derives the deployed version from the release tag', () => {
    vi.stubEnv('APP_RELEASE_TAG', 'v1.2.3')
    vi.stubEnv('APP_COMMIT_SHA', 'abc123')

    expect(getBuildInfo()).toEqual({
      version: '1.2.3',
      releaseTag: 'v1.2.3',
      commitSha: 'abc123',
      source: 'tag'
    })
  })
})
