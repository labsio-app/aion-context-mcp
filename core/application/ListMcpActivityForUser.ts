import type { McpActivityRecord, McpActivityStore } from './ports.js'

export interface ListMcpActivityForUserInput {
  userId: string
  limit?: number
}

function normalizeLimit(value: number | undefined): number {
  const limit = value ?? 50
  if (!Number.isFinite(limit)) return 50
  return Math.min(Math.max(Math.floor(limit), 1), 100)
}

function normalizeUserId(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('MCP activity user id is required')
  }

  return trimmed
}

export class ListMcpActivityForUser {
  constructor(private readonly store: Pick<McpActivityStore, 'listActivityForUser'>) {}

  async execute(input: ListMcpActivityForUserInput): Promise<McpActivityRecord[]> {
    return this.store.listActivityForUser(normalizeUserId(input.userId), normalizeLimit(input.limit))
  }
}
