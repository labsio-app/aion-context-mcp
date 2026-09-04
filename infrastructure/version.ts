import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface BuildInfo {
  version: string
  releaseTag: string
  commitSha: string | null
  source: 'tag' | 'package'
}

const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

function normalizeSemver(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return null

  const cleaned = trimmed.startsWith('v') ? trimmed.slice(1) : trimmed
  return semverPattern.test(cleaned) ? cleaned : null
}

function normalizeReleaseTag(value: string | undefined): string | null {
  const normalized = normalizeSemver(value)
  return normalized ? `v${normalized}` : null
}

function readPackageVersion(): string {
  try {
    const raw = readFileSync(join(process.cwd(), 'package.json'), 'utf8')
    const parsed = JSON.parse(raw) as { version?: unknown }
    return typeof parsed.version === 'string' ? parsed.version.trim() : '0.1.0'
  } catch {
    return '0.1.0'
  }
}

export function getBuildInfo(): BuildInfo {
  const releaseTag =
    normalizeReleaseTag(process.env.APP_RELEASE_TAG) ??
    normalizeReleaseTag(process.env.GITHUB_REF_NAME) ??
    null

  if (!releaseTag && process.env.NODE_ENV === 'production') {
    throw new Error('APP_RELEASE_TAG is required in production')
  }

  const packageVersion = normalizeSemver(readPackageVersion()) ?? '0.1.0'
  const version = releaseTag ? releaseTag.slice(1) : packageVersion
  const commitSha = process.env.APP_COMMIT_SHA?.trim() || null

  return {
    version,
    releaseTag: releaseTag ?? `v${version}`,
    commitSha,
    source: releaseTag ? 'tag' : 'package'
  }
}
