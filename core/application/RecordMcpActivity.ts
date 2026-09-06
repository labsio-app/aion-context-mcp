import { randomUUID } from 'node:crypto'
import type {
  McpActivityOutcome,
  McpActivityRecord,
  McpActivityStore
} from './ports.js'
import type { McpPrincipal } from './McpPrincipal.js'

export interface RecordMcpActivityInput {
  principal: McpPrincipal
  toolName: string
  outcome: McpActivityOutcome
  durationMs?: number | null
}

function normalizeToolName(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('MCP tool name is required')
  }

  return trimmed
}

function normalizeDurationMs(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null
  return Math.max(0, Math.round(value))
}

export class RecordMcpActivity {
  constructor(private readonly store: Pick<McpActivityStore, 'saveActivity'>) {}

  async execute(input: RecordMcpActivityInput): Promise<McpActivityRecord> {
    const now = new Date().toISOString()
    const principal: McpPrincipal = input.principal
    const activity: McpActivityRecord = {
      id: randomUUID(),
      userId: principal.userId,
      credentialId: principal.credentialId,
      authenticationMethod: principal.authenticationMethod,
      toolName: normalizeToolName(input.toolName),
      outcome: input.outcome,
      durationMs: normalizeDurationMs(input.durationMs),
      createdAt: now
    }

    return this.store.saveActivity(activity)
  }
}
