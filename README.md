# AION Context MCP

Small, deliberately boring knowledge system for AION 2.

The **LLM stays intelligent**. This project stores, retrieves and challenges context. It does not try to rebuild an agent framework inside the backend.

## What is in the POC

- Nuxt 4 admin UI + Nitro API.
- Remote MCP server using the official MCP TypeScript SDK v2.
- PostgreSQL storage.
- Lexical retrieval (Postgres full-text + similarity) behind a replaceable application port.
- Sources, knowledge items, challenges and background acquisition jobs.
- A lightweight worker able to ingest ordinary web pages and YouTube metadata.
- A reusable `aion_researcher` MCP prompt and a host prompt file.
- Vitest application tests.
- Docker Compose deployment.

No LangChain is required for the first vertical slice. If we later need a pipeline for chunking, embeddings, reranking or autonomous research, it can be added behind ports without changing the MCP contract.

## Architecture

```text
AI host (ChatGPT / Claude / Cursor / ...)
                |
                | MCP
                v
        mcp/index.ts              Nuxt UI / API
                |                     |
                +----------+----------+
                           |
                 KnowledgeApplication
                    AcquisitionApplication
                           |
                  application ports
                           |
              PostgresKnowledgeStore
              PostgresAcquisitionQueue
                           |
                       PostgreSQL
                           ^
                           |
                         worker
```

The domain is intentionally tiny:

- `Source`: where information came from.
- `KnowledgeItem`: what we currently believe / observe / theorize.
- `Challenge`: a contradiction, limitation or counter-evidence.
- `AcquisitionJob`: asynchronous source ingestion.

There is no aggregate ceremony, event bus or CQRS in this POC.

## MCP tools

- `aion_search_context` — first tool to call for a question.
- `aion_get_source` — read a stored source.
- `aion_record_source` — store source material.
- `aion_record_knowledge` — store an observation/claim/theory/recommendation.
- `aion_record_challenge` — challenge an existing knowledge item instead of silently overwriting it.
- `aion_list_open_challenges` — inspect unresolved contradictions.
- `aion_enqueue_source` — ask the worker to acquire a URL asynchronously.

The MCP also exposes the `aion_researcher` prompt.

## Why no vector database yet?

For the first POC, the host model can reformulate and iterate search queries itself. PostgreSQL lexical retrieval keeps the infrastructure cheap and observable.

`KnowledgeStore.searchSources()` and `KnowledgeStore.searchKnowledge()` are the seams where pgvector / embeddings / reranking can be added later without changing the MCP tools.

## Local start

```bash
cp .env.example .env
# edit the admin token and OAuth secrets

docker compose up -d --build
```

Then:

- UI: `http://localhost:3000`
- MCP: `http://localhost:3001/mcp`
- MCP health: `http://localhost:3001/health`

The UI asks for the `NUXT_ADMIN_TOKEN` and keeps it in browser local storage.

## Check MCP manually

Unauthenticated requests now get an OAuth challenge:

```bash
curl -i -X POST https://aion-mcp.labsio.app/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

You should see `401 Unauthorized` and a `WWW-Authenticate` header pointing to `/.well-known/oauth-protected-resource`.

The discovery endpoints are public:

```bash
curl -s https://aion-mcp.labsio.app/.well-known/oauth-protected-resource
curl -s https://aion-mcp.labsio.app/.well-known/oauth-authorization-server
```

The old bearer-token check is gone. ChatGPT now links through OAuth 2.1 + PKCE.

## Connect from ChatGPT

1. Open ChatGPT in a workspace that has Developer mode / Plugins enabled.
2. Add a new MCP connection with the public URL `https://aion-mcp.labsio.app/mcp`.
3. When ChatGPT opens the auth flow, it should use the public OAuth metadata from the same domain.
4. Log in with the password configured in `MCP_OAUTH_PASSWORD`.
5. After consent, ChatGPT will store the bearer token it received and reuse it on future tool calls.

If you change tool names, metadata, scopes or auth config, refresh the connection in ChatGPT and start a new conversation.

## Check MCP manually

```bash
curl -s -X POST http://127.0.0.1:3001/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## VPS + existing Caddy

The containers bind only to localhost. Example:

```caddyfile
aion.example.com {
    reverse_proxy 127.0.0.1:3000
}

aion-mcp.example.com {
    reverse_proxy 127.0.0.1:3001
}
```

Set:

```env
MCP_ALLOWED_HOSTS=localhost,127.0.0.1,aion-mcp.example.com
```

Then:

```bash
docker compose up -d --build
```

## AI host instructions

Use `prompts/aion-researcher.md` as project/system instructions in the AI host.

The intended responsibility split is:

```text
MODEL
  decides what is relevant
  formulates searches
  qualifies evidence
  distinguishes TW / KR / GLOBAL
  proposes theories
  detects contradictions

MCP
  persists
  retrieves
  exposes provenance
  records challenges
  queues acquisition

WORKER
  performs deterministic/background acquisition
```

## YouTube

The worker intentionally does **not** scrape YouTube transcripts.

For a YouTube URL it retrieves public oEmbed metadata (title/author). The model or user can then store the transcript, notes or extracted observations with `aion_record_source`.

That keeps the POC deterministic and avoids coupling the core to a fragile transcript scraper.

## Development

Without Docker, start PostgreSQL and set `DATABASE_URL`, then:

```bash
npm install
npm run db:migrate
npm run dev
```

In other terminals:

```bash
npm run mcp
npm run worker
```

Quality gates:

```bash
npm test
npm run typecheck
npm run build
```

## Next logical upgrades

Only add these when the POC shows the need:

1. pgvector + embedding provider behind the search port.
2. chunking of long source content.
3. source freshness / supersession policy.
4. automated acquisition connectors.
5. user-specific identity and scopes on top of the current OAuth link.
6. LangChain/LangGraph only for workflows that genuinely need orchestration.
