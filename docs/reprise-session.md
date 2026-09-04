# Session handover

Date: 2026-09-04

## Context

The AION Context MCP project is deployed to the VPS with:

- `aion-mcp.labsio.app` connected to the public MCP;
- real OAuth authentication for external MCP clients;
- a public GitHub repository;
- the product corpus under `references/`;
- product documentation in `docs/metier.md`; and
- a RAG specification at `aidd_docs/tasks/2026_09/2026_09_03_rag/spec.md`.

## What is in place

- The source product corpus is canonical.
- The product documentation describes the product and its rules.
- The RAG specification establishes the expected contract:
  - traceable provenance;
  - explicit scope;
  - visible conflicts; and
  - no silent invention.

## Next priorities

1. Define the RAG data model from the specification.
2. Decide how to represent:
   - corpus chunks;
   - scope metadata;
   - source → excerpt → claim links; and
   - conflicts / challenges.
3. Formalize MCP entry points to:
   - search the corpus;
   - ingest a document; and
   - trace the provenance of an answer.
4. Decide whether `references/*.docx` should stay raw or be converted into versioned Markdown.

## Rules to retain

- The corpus remains canonical.
- `docs/metier.md` remains a stable summary.
- RAG must not overwrite provenance.
- Every answer must retain its scope (`GLOBAL`, `TW`, `KR`, `UNKNOWN`).
- Contradictions must be retained, not overwritten.

## Useful links

- [`README.md`](../README.md)
- [`docs/metier.md`](metier.md)
- [`references/README.md`](../references/README.md)
- [`aidd_docs/tasks/2026_09/2026_09_03_rag/spec.md`](../aidd_docs/tasks/2026_09/2026_09_03_rag/spec.md)

## Handover note

When resuming work:

- start by rereading the RAG specification;
- decide on the data contract before implementation; and
- avoid choosing an indexing technology too early.
