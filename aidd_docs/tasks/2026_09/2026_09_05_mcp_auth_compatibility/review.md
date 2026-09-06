# Review: US-006 · MCP Principal + Request-Time Enforcement

- **Verdict**: ACCEPTED
- **Diff**: `HEAD...working tree`
- **Axes run**: code, functional, relevancy
- **Date**: 2026-09-05
- **Findings**: 0 critical, 0 warning, 0 minor

## Phases

### Phase 1 — US-006 criteria

- [x] JWT verification: PASS - [mcp/oauth.ts](/home/mco/projects/aion-context-mcp/mcp/oauth.ts#L512)
- [x] Credential lookup: PASS - [core/application/ResolveMcpPrincipal.ts](/home/mco/projects/aion-context-mcp/core/application/ResolveMcpPrincipal.ts#L62)
- [x] BetaAccess enforcement: PASS - [core/application/ResolveMcpPrincipal.ts](/home/mco/projects/aion-context-mcp/core/application/ResolveMcpPrincipal.ts#L71)
- [x] Immediate credential revocation: PASS - [core/application/ResolveMcpPrincipal.ts](/home/mco/projects/aion-context-mcp/core/application/ResolveMcpPrincipal.ts#L67)
- [x] Immediate beta revocation: PASS - [core/application/ResolveMcpPrincipal.ts](/home/mco/projects/aion-context-mcp/core/application/ResolveMcpPrincipal.ts#L74)
- [x] Unknown credential fails closed: PASS - [core/application/ResolveMcpPrincipal.ts](/home/mco/projects/aion-context-mcp/core/application/ResolveMcpPrincipal.ts#L62)
- [x] Legacy isolation: PASS - [core/application/ResolveMcpPrincipal.ts](/home/mco/projects/aion-context-mcp/core/application/ResolveMcpPrincipal.ts#L53), [test/oauth.test.ts](/home/mco/projects/aion-context-mcp/test/oauth.test.ts#L150)
- [x] Streamable HTTP/session coverage: PASS - [mcp/index.ts](/home/mco/projects/aion-context-mcp/mcp/index.ts#L69), [node_modules/@modelcontextprotocol/server/dist/index.mjs](/home/mco/projects/aion-context-mcp/node_modules/@modelcontextprotocol/server/dist/index.mjs#L1218), [node_modules/@modelcontextprotocol/server/dist/index.mjs](/home/mco/projects/aion-context-mcp/node_modules/@modelcontextprotocol/server/dist/index.mjs#L966), [node_modules/@modelcontextprotocol/node/dist/index.mjs](/home/mco/projects/aion-context-mcp/node_modules/@modelcontextprotocol/node/dist/index.mjs#L270)
- [x] Tool-boundary enforcement: PASS - [test/mcp-principal.test.ts](/home/mco/projects/aion-context-mcp/test/mcp-principal.test.ts#L243)
- [x] McpPrincipal model: PASS - [core/application/McpPrincipal.ts](/home/mco/projects/aion-context-mcp/core/application/McpPrincipal.ts#L1)
- [x] Principal future usability: PASS - [node_modules/@modelcontextprotocol/node/dist/index.mjs](/home/mco/projects/aion-context-mcp/node_modules/@modelcontextprotocol/node/dist/index.mjs#L270), [node_modules/@modelcontextprotocol/server/dist/index.mjs](/home/mco/projects/aion-context-mcp/node_modules/@modelcontextprotocol/server/dist/index.mjs#L1258)
- [x] Architecture: PASS - [mcp/index.ts](/home/mco/projects/aion-context-mcp/mcp/index.ts#L69), [mcp/oauth.ts](/home/mco/projects/aion-context-mcp/mcp/oauth.ts#L992)
- [x] Security: PASS - [mcp/oauth.ts](/home/mco/projects/aion-context-mcp/mcp/oauth.ts#L512), [mcp/oauth.ts](/home/mco/projects/aion-context-mcp/mcp/oauth.ts#L992)
- [x] Tests: PASS - [test/mcp-principal.test.ts](/home/mco/projects/aion-context-mcp/test/mcp-principal.test.ts#L116), [test/mcp-credential-lifecycle.test.ts](/home/mco/projects/aion-context-mcp/test/mcp-credential-lifecycle.test.ts#L226), [test/oauth.test.ts](/home/mco/projects/aion-context-mcp/test/oauth.test.ts#L26)

## Findings

None.

## Verification

| Metric | Value |
| --- | --- |
| Verified | 14/14 (100%) |
| Files checked | [mcp/index.ts](/home/mco/projects/aion-context-mcp/mcp/index.ts), [mcp/oauth.ts](/home/mco/projects/aion-context-mcp/mcp/oauth.ts), [core/application/ResolveMcpPrincipal.ts](/home/mco/projects/aion-context-mcp/core/application/ResolveMcpPrincipal.ts), [core/application/McpPrincipal.ts](/home/mco/projects/aion-context-mcp/core/application/McpPrincipal.ts), [core/application/McpCredentialApplication.ts](/home/mco/projects/aion-context-mcp/core/application/McpCredentialApplication.ts), [infrastructure/postgres/PostgresBetaAccessStore.ts](/home/mco/projects/aion-context-mcp/infrastructure/postgres/PostgresBetaAccessStore.ts), [infrastructure/postgres/PostgresMcpCredentialStore.ts](/home/mco/projects/aion-context-mcp/infrastructure/postgres/PostgresMcpCredentialStore.ts), [migrations/006_mcp_credentials.sql](/home/mco/projects/aion-context-mcp/migrations/006_mcp_credentials.sql), [test/mcp-principal.test.ts](/home/mco/projects/aion-context-mcp/test/mcp-principal.test.ts), [test/mcp-credential-lifecycle.test.ts](/home/mco/projects/aion-context-mcp/test/mcp-credential-lifecycle.test.ts), [test/oauth.test.ts](/home/mco/projects/aion-context-mcp/test/oauth.test.ts), [test/admin-beta.test.ts](/home/mco/projects/aion-context-mcp/test/admin-beta.test.ts), [node_modules/@modelcontextprotocol/server/dist/index.mjs](/home/mco/projects/aion-context-mcp/node_modules/@modelcontextprotocol/server/dist/index.mjs), [node_modules/@modelcontextprotocol/node/dist/index.mjs](/home/mco/projects/aion-context-mcp/node_modules/@modelcontextprotocol/node/dist/index.mjs) |
| Unchecked | none |
| Unplanned | none |
