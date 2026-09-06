# Review: US-009 · MCP Activity

- **Verdict**: ACCEPTED
- **Diff**: `HEAD...working tree`
- **Axes run**: code, functional, relevancy
- **Date**: 2026-09-05
- **Findings**: 0 critical, 0 warning, 0 minor

## Phases

### Phase 1 — Principal propagation

- [x] Request-scoped principal: PASS - [mcp/index.ts](/home/mco/projects/aion-context-mcp/mcp/index.ts#L70-L90), [node_modules/@modelcontextprotocol/node/dist/index.mjs](/home/mco/projects/aion-context-mcp/node_modules/@modelcontextprotocol/node/dist/index.mjs#L270-L285), [node_modules/@modelcontextprotocol/server/dist/index.mjs](/home/mco/projects/aion-context-mcp/node_modules/@modelcontextprotocol/server/dist/index.mjs#L1205-L1262) show auth is resolved per `/mcp` request, forwarded as `authInfo`, and used to build a fresh server instance per request rather than a global principal.

### Phase 2 — Tool attribution

- [x] Tool attribution: PASS - [mcp/server.ts](/home/mco/projects/aion-context-mcp/mcp/server.ts#L103-L139), [mcp/server.ts](/home/mco/projects/aion-context-mcp/mcp/server.ts#L154-L312) wrap every current tool through `registerTrackedTool`, and the audited `toolName` comes from the server-side registration name, not from client payloads; the malicious override attempt in [test/mcp-activity.test.ts](/home/mco/projects/aion-context-mcp/test/mcp-activity.test.ts#L338-L374) is ignored.

### Phase 3 — Success/failure semantics

- [x] Success/failure semantics: PASS - [mcp/server.ts](/home/mco/projects/aion-context-mcp/mcp/server.ts#L113-L137) records `SUCCESS` on normal return and `FAILURE` on thrown handler errors, then rethrows the original error; [test/mcp-activity.test.ts](/home/mco/projects/aion-context-mcp/test/mcp-activity.test.ts#L380-L460) exercises both paths.

### Phase 4 — Best-effort persistence

- [x] Best-effort persistence: PASS - [mcp/server.ts](/home/mco/projects/aion-context-mcp/mcp/server.ts#L78-L100) swallows activity persistence failures, logs only technical fields, and keeps the tool response moving; [test/mcp-activity.test.ts](/home/mco/projects/aion-context-mcp/test/mcp-activity.test.ts#L462-L533) proves a failed activity insert does not fail the MCP result.

### Phase 5 — Privacy

- [x] Privacy: PASS - [core/application/ports.ts](/home/mco/projects/aion-context-mcp/core/application/ports.ts#L171-L179), [migrations/007_mcp_activity.sql](/home/mco/projects/aion-context-mcp/migrations/007_mcp_activity.sql#L1-L16), and [infrastructure/postgres/PostgresMcpActivityStore.ts](/home/mco/projects/aion-context-mcp/infrastructure/postgres/PostgresMcpActivityStore.ts#L10-L19) keep the activity model minimal and exclude prompt, args, result, JWT, authorization header, source content, knowledge content, and IP storage.

### Phase 6 — Credential attribution

- [x] Credential attribution: PASS - [mcp/oauth.ts](/home/mco/projects/aion-context-mcp/mcp/oauth.ts#L992-L1025) resolves principals server-side, [core/application/ResolveMcpPrincipal.ts](/home/mco/projects/aion-context-mcp/core/application/ResolveMcpPrincipal.ts#L52-L77) sets `userId` and `credentialId` from the credential store and fixes `authenticationMethod` to `OAUTH`, and [core/application/RecordMcpActivity.ts](/home/mco/projects/aion-context-mcp/core/application/RecordMcpActivity.ts#L30-L63) ignores any client-supplied attribution fields.

### Phase 7 — Legacy attribution

- [x] Legacy attribution: PASS - [core/application/ResolveMcpPrincipal.ts](/home/mco/projects/aion-context-mcp/core/application/ResolveMcpPrincipal.ts#L52-L60) keeps legacy principals as `subject`-based identities with `LEGACY_OAUTH`, and [core/application/RecordMcpActivity.ts](/home/mco/projects/aion-context-mcp/core/application/RecordMcpActivity.ts#L42-L46) stores `credentialId = null` instead of inventing a modern user identity; [test/oauth.test.ts](/home/mco/projects/aion-context-mcp/test/oauth.test.ts#L171-L186) covers the legacy path.

### Phase 8 — Last-used semantics

- [x] Last-used semantics: PASS - [infrastructure/postgres/PostgresMcpActivityStore.ts](/home/mco/projects/aion-context-mcp/infrastructure/postgres/PostgresMcpActivityStore.ts#L26-L65) updates `mcp_credentials.last_used_at` only for credential-backed activity and does so in the same transaction as the activity insert, so a rollback keeps the credential state coherent.

### Phase 9 — Scoped listing

- [x] Scoped listing: PASS - [core/application/ListMcpActivityForUser.ts](/home/mco/projects/aion-context-mcp/core/application/ListMcpActivityForUser.ts#L8-L28) bounds the limit and normalizes `userId`, [infrastructure/postgres/PostgresMcpActivityStore.ts](/home/mco/projects/aion-context-mcp/infrastructure/postgres/PostgresMcpActivityStore.ts#L67-L77) scopes by `user_id` with deterministic `created_at DESC, id DESC` ordering, and [test/mcp-activity.test.ts](/home/mco/projects/aion-context-mcp/test/mcp-activity.test.ts#L238-L278) proves the user boundary and ordering.

### Phase 10 — Persistence

- [x] Persistence: PASS - [migrations/007_mcp_activity.sql](/home/mco/projects/aion-context-mcp/migrations/007_mcp_activity.sql#L1-L16) is additive, keeps `credential_id` nullable for legacy, adds useful lookup indexes, and stores no sensitive payload data.

### Phase 11 — Integration proof

- [x] Integration proof: PASS - [test/mcp-activity.test.ts](/home/mco/projects/aion-context-mcp/test/mcp-activity.test.ts#L281-L533) performs a real authenticated `POST /mcp`, a real `tools/call`, and verifies the activity row is persisted; the same file covers failure, legacy, anti-override, and activity-persistence-failure paths, while [test/mcp-principal.test.ts](/home/mco/projects/aion-context-mcp/test/mcp-principal.test.ts#L243-L327) proves revoked credentials stop before tool execution.

### Phase 12 — Future-tool safety

- [x] Future-tool safety: PASS - [mcp/server.ts](/home/mco/projects/aion-context-mcp/mcp/server.ts#L103-L139) defines one explicit registration helper and every current tool uses it, so the bypass risk is visible but not currently realized.

### Phase 13 — Security

- [x] Security: PASS - [mcp/index.ts](/home/mco/projects/aion-context-mcp/mcp/index.ts#L70-L100), [mcp/server.ts](/home/mco/projects/aion-context-mcp/mcp/server.ts#L78-L137), [infrastructure/postgres/PostgresMcpActivityStore.ts](/home/mco/projects/aion-context-mcp/infrastructure/postgres/PostgresMcpActivityStore.ts#L26-L77), and [test/mcp-principal.test.ts](/home/mco/projects/aion-context-mcp/test/mcp-principal.test.ts#L243-L327) show no global mutable principal, no client-controlled attribution, parameterized SQL, auth rejection before execution, and no activity on revoked credentials.

## Findings

None.

## Verification

| Metric        | Value |
| ------------- | ----- |
| Verified      | 13/13 (100%) |
| Files checked | [mcp/index.ts](/home/mco/projects/aion-context-mcp/mcp/index.ts), [mcp/server.ts](/home/mco/projects/aion-context-mcp/mcp/server.ts), [mcp/oauth.ts](/home/mco/projects/aion-context-mcp/mcp/oauth.ts), [core/application/McpPrincipal.ts](/home/mco/projects/aion-context-mcp/core/application/McpPrincipal.ts), [core/application/ResolveMcpPrincipal.ts](/home/mco/projects/aion-context-mcp/core/application/ResolveMcpPrincipal.ts), [core/application/RecordMcpActivity.ts](/home/mco/projects/aion-context-mcp/core/application/RecordMcpActivity.ts), [core/application/ListMcpActivityForUser.ts](/home/mco/projects/aion-context-mcp/core/application/ListMcpActivityForUser.ts), [core/application/ports.ts](/home/mco/projects/aion-context-mcp/core/application/ports.ts), [infrastructure/postgres/PostgresMcpActivityStore.ts](/home/mco/projects/aion-context-mcp/infrastructure/postgres/PostgresMcpActivityStore.ts), [migrations/006_mcp_credentials.sql](/home/mco/projects/aion-context-mcp/migrations/006_mcp_credentials.sql), [migrations/007_mcp_activity.sql](/home/mco/projects/aion-context-mcp/migrations/007_mcp_activity.sql), [test/mcp-activity.test.ts](/home/mco/projects/aion-context-mcp/test/mcp-activity.test.ts), [test/mcp-principal.test.ts](/home/mco/projects/aion-context-mcp/test/mcp-principal.test.ts), [test/mcp-credential-lifecycle.test.ts](/home/mco/projects/aion-context-mcp/test/mcp-credential-lifecycle.test.ts), [test/oauth.test.ts](/home/mco/projects/aion-context-mcp/test/oauth.test.ts), [node_modules/@modelcontextprotocol/server/dist/index.mjs](/home/mco/projects/aion-context-mcp/node_modules/@modelcontextprotocol/server/dist/index.mjs), [node_modules/@modelcontextprotocol/node/dist/index.mjs](/home/mco/projects/aion-context-mcp/node_modules/@modelcontextprotocol/node/dist/index.mjs) |
| Unchecked    | none |
| Unplanned    | none |
