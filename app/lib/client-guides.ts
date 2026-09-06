export const AION_MCP_ENDPOINT = 'https://aion-mcp.labsio.app/mcp' as const
export const AION_MCP_AUTH = 'OAuth 2.1 + PKCE' as const

export const AION_MCP_CONNECT_FLOW = [
  'Add AION MCP to your compatible AI client.',
  `Use ${AION_MCP_ENDPOINT} as the remote MCP endpoint.`,
  'Complete OAuth authorization in the browser.',
  'Return to the client.',
  'Verify the connection with aion_search_context.'
] as const

export const AION_MCP_CONNECT_NOTE =
  'Access is enforced server-side. If access is denied, confirm your private beta access is still APPROVED.'

export const AION_MCP_CONNECT_CONTEXT =
  'If AION MCP asks you to sign in during authorization, use your Discord identity.'

export type GuideStatus = 'VERIFIED' | 'PARTIAL' | 'NOT VERIFIED'

export interface ClientGuideSource {
  label: string
  url: string
}

export interface ClientGuide {
  id: string
  name: string
  status: GuideStatus
  verifiedOn: string
  summary: string
  transport: string
  authentication: string
  readTools: string
  writeTools: string
  planRestrictions: string
  connectionSteps: string[]
  verification: string
  troubleshooting: string[]
  sourceLinks: ClientGuideSource[]
}

export const clientGuides: ClientGuide[] = [
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    status: 'VERIFIED',
    verifiedOn: '2026-09-05',
    summary:
      'ChatGPT developer mode supports remote MCP apps on the web. Managed workspaces can still narrow app actions, so write tools need workspace approval where applicable.',
    transport: 'Streaming HTTP',
    authentication: AION_MCP_AUTH,
    readTools: 'Supported',
    writeTools: 'Supported when the app and workspace allow it',
    planRestrictions:
      'Available on Pro, Plus, Business, Enterprise, and Education accounts on the web.',
    connectionSteps: [
      'Turn on Developer mode in ChatGPT Settings > Security and login.',
      'Open ChatGPT Plugins, create a developer-mode app from the remote MCP URL, and review the tools.',
      'Approve OAuth and then ask ChatGPT to call aion_search_context.'
    ],
    verification:
      'The app appears in developer mode and can call aion_search_context after OAuth completes.',
    troubleshooting: [
      'If AION MCP asks you to sign in during authorization, use your Discord identity.',
      'If write tools are hidden, check workspace app permissions and action controls.',
      'If auth expires, reconnect the app from the Developer mode flow.'
    ],
    sourceLinks: [
      {
        label: 'Developer mode',
        url: 'https://developers.openai.com/api/docs/guides/developer-mode'
      },
      {
        label: 'Connect and test your plugin',
        url: 'https://developers.openai.com/plugins/deploy/connect-chatgpt'
      },
      {
        label: 'Plugin controls',
        url: 'https://learn.chatgpt.com/docs/enterprise/apps-and-connectors'
      }
    ]
  },
  {
    id: 'codex',
    name: 'Codex',
    status: 'VERIFIED',
    verifiedOn: '2026-09-05',
    summary:
      'Codex can store remote MCP servers in config.toml, share the same MCP setup across Codex clients, and authenticate OAuth servers from the CLI or UI.',
    transport: 'Streamable HTTP',
    authentication: AION_MCP_AUTH,
    readTools: 'Supported',
    writeTools: 'Supported',
    planRestrictions:
      'Remote servers live in ~/.codex/config.toml or a project-scoped .codex/config.toml.',
    connectionSteps: [
      'Add a server entry that points to https://aion-mcp.labsio.app/mcp.',
      'Run codex mcp login aion to complete OAuth.',
      'Refresh the server list and then ask for aion_search_context.'
    ],
    verification:
      'codex mcp list shows the server as connected and the tool list includes aion_search_context.',
    troubleshooting: [
      'If Codex cannot see the server, confirm the config file path and restart the client.',
      'If auth is missing or stale, rerun codex mcp login for the server.'
    ],
    sourceLinks: [
      {
        label: 'Codex MCP',
        url: 'https://learn.chatgpt.com/docs/extend/mcp?surface=cli'
      },
      {
        label: 'Configuration reference',
        url: 'https://learn.chatgpt.com/docs/config-file/config-reference'
      }
    ]
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    status: 'VERIFIED',
    verifiedOn: '2026-09-05',
    summary:
      'Claude Code supports remote HTTP MCP servers and uses /mcp or claude mcp login to complete OAuth with the connected server.',
    transport: 'HTTP remote MCP',
    authentication: AION_MCP_AUTH,
    readTools: 'Supported',
    writeTools: 'Supported',
    planRestrictions:
      'HTTP is the recommended remote transport. SSE is deprecated when HTTP is available.',
    connectionSteps: [
      'Run claude mcp add --transport http aion https://aion-mcp.labsio.app/mcp.',
      'Open Claude Code and run /mcp to start the OAuth flow.',
      'Confirm the server is connected and ask Claude Code to call aion_search_context.'
    ],
    verification:
      'The /mcp panel shows the server as connected and the MCP tool list exposes aion_search_context.',
    troubleshooting: [
      'If AION MCP asks you to sign in during authorization, use your Discord identity.',
      'If auth fails, run claude mcp login aion or reopen /mcp.',
      'If the server is configured as SSE or WebSocket, switch it to HTTP for OAuth support.'
    ],
    sourceLinks: [
      {
        label: 'Claude Code MCP',
        url: 'https://code.claude.com/docs/en/mcp'
      },
      {
        label: 'CLI reference',
        url: 'https://code.claude.com/docs/en/claude-code/cli-reference'
      }
    ]
  },
  {
    id: 'generic-mcp',
    name: 'Generic MCP',
    status: 'VERIFIED',
    verifiedOn: '2026-09-05',
    summary:
      'Any MCP client that supports remote Streamable HTTP, OAuth, discovery, and tool invocation can connect to AION MCP. There is no universal JSON config.',
    transport: 'Remote Streamable HTTP',
    authentication: AION_MCP_AUTH,
    readTools: 'Supported when the client can list tools',
    writeTools: 'Supported when the client permits authenticated tool calls',
    planRestrictions:
      'Use the client’s own MCP settings. AION MCP does not support personal or static bearer tokens.',
    connectionSteps: [
      'Configure the client to point at https://aion-mcp.labsio.app/mcp.',
      'Complete OAuth 2.1 + PKCE when the client opens the auth flow.',
      'Refresh the tool list and call aion_search_context.'
    ],
    verification:
      'The client can discover tools, authorize with OAuth, and call aion_search_context.',
    troubleshooting: [
      'If the client only supports static bearer tokens or local stdio, it is not a fit.',
      'If discovery fails, check that the client can reach the protected-resource metadata endpoints.'
    ],
    sourceLinks: [
      {
        label: 'MCP and Connectors',
        url: 'https://developers.openai.com/api/docs/guides/tools-connectors-mcp'
      },
      {
        label: 'Authentication',
        url: 'https://developers.openai.com/plugins/build/auth'
      }
    ]
  },
  {
    id: 't3-code',
    name: 'T3 Code',
    status: 'NOT VERIFIED',
    verifiedOn: '2026-09-05',
    summary:
      'The official T3 Code repository documents the agent-control surface and provider integrations, but it does not currently prove a verified MCP + OAuth path for AION MCP.',
    transport: 'Not verified',
    authentication: 'Not verified',
    readTools: 'Not verified',
    writeTools: 'Not verified',
    planRestrictions: 'Not currently verified for AION MCP.',
    connectionSteps: ['Use a verified MCP client instead.'],
    verification: 'None yet.',
    troubleshooting: [
      'If you need AION MCP now, use ChatGPT, Codex, Claude Code, or another verified client.',
      'Do not rely on an unverified T3 Code flow for production use.'
    ],
    sourceLinks: [
      {
        label: 'T3 Code README',
        url: 'https://github.com/pingdotgg/t3code'
      },
      {
        label: 'T3 Code AGENTS.md',
        url: 'https://github.com/pingdotgg/t3code/blob/main/AGENTS.md'
      }
    ]
  }
] as const
