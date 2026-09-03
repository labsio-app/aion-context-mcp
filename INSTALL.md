# Install

## Prerequisites

- Node.js 20+
- Docker and Docker Compose
- PostgreSQL if you want to run without Docker

## Local Development

```bash
cp .env.example .env
npm install --legacy-peer-deps
npm run db:migrate
npm run dev
```

In separate terminals:

```bash
npm run mcp
npm run worker
```

## Docker Compose

```bash
docker compose up -d --build
```

Then open:

- UI: `http://localhost:3000`
- MCP: `http://localhost:3001/mcp`
- Health: `http://localhost:3001/health`
