import { McpServer } from '@modelcontextprotocol/server'
import * as z from 'zod/v4'
import { getContainer } from '../infrastructure/container.js'
import { getBuildInfo } from '../infrastructure/version.js'
import {
  confidenceLevels,
  gameScopes,
  knowledgeKinds,
  sourceKinds
} from '../core/domain/model.js'

const scopeSchema = z.enum(gameScopes)
const sourceKindSchema = z.enum(sourceKinds)
const knowledgeKindSchema = z.enum(knowledgeKinds)
const confidenceSchema = z.enum(confidenceLevels)
const oauthSecuritySchemes = [{ type: 'oauth2' as const, scopes: ['mcp:access'] }]

function withOAuthSecurity<T>(config: T): T & { securitySchemes: typeof oauthSecuritySchemes } {
  return {
    ...config,
    securitySchemes: oauthSecuritySchemes
  }
}

function jsonResult(value: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(value, null, 2)
      }
    ]
  }
}

function buildInfoResult() {
  const build = getBuildInfo()
  return {
    ...build,
    nodeEnv: process.env.NODE_ENV ?? 'development'
  }
}

const researcherPrompt = `
You are the reasoning layer for AION 2 research.

Use the MCP as contextual memory, not as an oracle.

Rules:
- Search context first.
- Distinguish GLOBAL / TW / KR / UNKNOWN.
- Never silently generalize TW/KR information to Global.
- Separate OBSERVATION, CLAIM, THEORY and RECOMMENDATION.
- Prefer source-linked knowledge.
- If information conflicts, record a challenge instead of overwriting history.
- Persist only durable, useful knowledge.
- If evidence is insufficient, search again or state what is missing.
`.trim()

export function createAionMcpServer() {
  const { knowledge, acquisition } = getContainer()
  const buildInfo = getBuildInfo()
  const server = new McpServer({
    name: 'aion-context',
    title: 'AION Context',
    version: buildInfo.version,
    description: 'Context persistence and retrieval for AION 2 research.'
  })

  server.registerTool(
    'aion_search_context',
    withOAuthSecurity({
      title: 'Search AION context',
      description:
        'FIRST tool for an AION 2 question. Retrieves stored sources, knowledge and open challenges. The model remains responsible for interpretation.',
      inputSchema: z.object({
        query: z.string().min(1),
        scope: scopeSchema.optional(),
        limit: z.number().int().min(1).max(25).optional()
      })
    }),
    async input => jsonResult(await knowledge.searchContext(input))
  )

  server.registerTool(
    'aion_get_source',
    withOAuthSecurity({
      title: 'Get AION source',
      description: 'Read the full stored material for one source id.',
      inputSchema: z.object({
        id: z.string().uuid()
      })
    }),
    async ({ id }) => {
      const source = await knowledge.getSource(id)
      return jsonResult(source ?? { error: 'source_not_found', id })
    }
  )

  server.registerTool(
    'aion_record_source',
    withOAuthSecurity({
      title: 'Record AION source',
      description:
        'Persist source material or notes. This stores provenance; it does not assert that the source is correct.',
      inputSchema: z.object({
        kind: sourceKindSchema,
        url: z.string().url().nullable().optional(),
        title: z.string().min(1),
        scope: scopeSchema,
        content: z.string().optional(),
        notes: z.string().optional()
      })
    }),
    async input => jsonResult(await knowledge.recordSource(input))
  )

  server.registerTool(
    'aion_record_knowledge',
    withOAuthSecurity({
      title: 'Record AION knowledge',
      description:
        'Persist a durable observation, claim, theory or recommendation. Link source ids whenever possible.',
      inputSchema: z.object({
        kind: knowledgeKindSchema,
        statement: z.string().min(1),
        scope: scopeSchema,
        confidence: confidenceSchema.optional(),
        applicability: z.string().optional(),
        notes: z.string().optional(),
        tags: z.array(z.string()).max(30).optional(),
        sourceIds: z.array(z.string().uuid()).max(30).optional()
      })
    }),
    async input => jsonResult(await knowledge.recordKnowledge(input))
  )

  server.registerTool(
    'aion_record_challenge',
    withOAuthSecurity({
      title: 'Challenge AION knowledge',
      description:
        'Record contradiction, counter-evidence or a limitation against existing knowledge. Prefer this over silently replacing a conflicting item.',
      inputSchema: z.object({
        knowledgeId: z.string().uuid(),
        objection: z.string().min(1),
        sourceId: z.string().uuid().nullable().optional()
      })
    }),
    async input => jsonResult(await knowledge.recordChallenge(input))
  )

  server.registerTool(
    'aion_list_open_challenges',
    withOAuthSecurity({
      title: 'List open AION challenges',
      description: 'List unresolved contradictions or limitations in the current knowledge base.',
      inputSchema: z.object({
        limit: z.number().int().min(1).max(100).optional()
      })
    }),
    async ({ limit }) => jsonResult(await knowledge.listChallenges('OPEN', limit ?? 50))
  )

  server.registerTool(
    'aion_enqueue_source',
    withOAuthSecurity({
      title: 'Queue AION source acquisition',
      description:
        'Queue deterministic background acquisition of a URL. For YouTube, metadata is fetched; transcript content should be supplied separately when available.',
      inputSchema: z.object({
        url: z.string().url(),
        title: z.string().optional(),
        scope: scopeSchema,
        content: z.string().optional(),
        notes: z.string().optional()
      })
    }),
    async input => jsonResult(await acquisition.enqueueSource(input))
  )

  server.registerPrompt(
    'aion_researcher',
    {
      title: 'AION Researcher',
      description: 'Reason with the AION context store while keeping provenance and scope explicit.',
      argsSchema: z.object({
        question: z.string().min(1)
      })
    },
    ({ question }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `${researcherPrompt}\n\nQuestion:\n${question}`
          }
        }
      ]
    })
  )

  server.registerTool(
    'aion_get_server_info',
    withOAuthSecurity({
      title: 'Get AION server info',
      description: 'Inspect the deployed MCP version, release tag and commit metadata.',
      inputSchema: z.object({})
    }),
    async () => jsonResult(buildInfoResult())
  )

  return server
}
