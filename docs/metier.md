# Product documentation

## Purpose

AION Context MCP is durable working memory for AION 2 research.

The system does not make decisions for the model. It stores, retrieves, and challenges useful context so information is not lost and provenance stays visible.

## Problem

Research conversations quickly generate:

- useful observations;
- unverified claims;
- hypotheses;
- contradictions; and
- scattered sources.

Without structured memory, the model repeats the same research, mixes confidence levels, and loses track of differences between TW, KR, and GLOBAL.

## What the product does

- Records sources with provenance.
- Records durable knowledge.
- Marks contradictions instead of overwriting history.
- Provides contextual search before a new decision is made.
- Separates information by applicability: `GLOBAL`, `TW`, `KR`, `UNKNOWN`.
- Exposes an MCP so ChatGPT or another host can consult and enrich this memory.

## Source corpus

The current product corpus is stored in [`references/`](../references/README.md) and is the canonical source.

Recommended reading order:

1. Consolidated dossier
2. Source register
3. Global Launch
4. Theorycraft / progression / stats
5. Classes / PvP

Formalization rules:

- The corpus remains the raw material.
- `docs/metier.md` remains the stable, readable summary.
- Substantive changes must first appear in the corpus, then be reflected in the summary.
- Every derivation must retain its scope and provenance.

## What the product does not do

- Replace model reasoning.
- Claim an absolute truth.
- Aggressively scrape YouTube.
- Manage knowledge without provenance.
- Automatically generalize TW/KR information to Global.

## Actors

- Model: decides what to search, interprets, synthesizes, and detects contradictions.
- MCP: persists, retrieves, exposes provenance, and records challenges.
- Worker: runs deterministic source acquisition.
- LLM host: ChatGPT, Claude, Cursor, or another MCP client.

## Domain objects

- `Source`: origin of information.
- `KnowledgeItem`: durable fact, observation, hypothesis, or recommendation.
- `Challenge`: contradiction, limitation, or counter-evidence against existing knowledge.
- `AcquisitionJob`: deferred acquisition task for a URL.

## Business rules

1. Always search existing context before reinventing it.
2. Never silently infer GLOBAL information from TW/KR information.
3. Keep `OBSERVATION`, `CLAIM`, `THEORY`, and `RECOMMENDATION` distinct.
4. Prefer a source-linked assertion over an isolated assertion.
5. When new evidence conflicts with existing information, create a `Challenge` rather than overwrite the older content.
6. Keep durable, useful data—not conversational noise.
7. Keep MCP authentication explicit and verifiable.

## Use cases

### 1. Research before answering

The model searches context, reviews sources, and responds with the best available synthesis.

### 2. Recording a source

A person or the model records a page, note, or transcript with a clear scope and title.

### 3. Consolidating knowledge

After validation, recurring observations become more stable knowledge items.

### 4. Handling contradictions

A new source contradicts an existing hypothesis. The original item remains, a challenge is added, and the decision stays visible.

## Acceptance criteria

- The system retains information provenance.
- Scopes remain separate.
- Contradictions do not delete history.
- The MCP can be used from an external host.
- Documentation clearly explains how to connect to and use the server.

## Non-goals

- Building a full agent framework.
- Replacing model judgment.
- Introducing orchestration complexity without a product need.
- Adding a vector database before it is needed.

## Glossary

- `GLOBAL`: valid independently of a particular region.
- `TW`: Taiwan-specific.
- `KR`: Korea-specific.
- `UNKNOWN`: scope has not been established.
- `OBSERVATION`: direct finding.
- `CLAIM`: reported assertion.
- `THEORY`: explanation or model.
- `RECOMMENDATION`: advice derived from analysis.
