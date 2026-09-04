# Reprise de session

Date: 2026-09-04

## Contexte

Le projet AION Context MCP est déjà déployé sur le VPS, avec:

- `aion-mcp.labsio.app` branché sur le MCP public
- auth OAuth réelle pour MCP clients externes
- dépôt GitHub public créé
- corpus métier ajouté dans `references/`
- synthèse métier dans `docs/metier.md`
- spec RAG créée dans `aidd_docs/tasks/2026_09/2026_09_03_rag/spec.md`

## Ce qui est en place

- Le corpus métier source est considéré canon.
- La doc métier décrit le produit et ses règles.
- La spec RAG fixe le contrat attendu:
  - provenance traçable
  - scope explicite
  - conflits visibles
  - pas d’invention silencieuse

## À reprendre en priorité

1. Définir le schéma de données RAG à partir de la spec.
2. Décider comment représenter:
   - les chunks de corpus
   - les métadonnées de scope
   - les liens source -> extrait -> claim
   - les conflits / challenges
3. Formaliser les points d’entrée MCP pour:
   - rechercher le corpus
   - ingérer un document
   - retracer la provenance d’une réponse
4. Vérifier si le corpus `references/*.docx` doit rester brut ou être converti en markdown versionné.

## Règles à respecter

- Le corpus reste la source canon.
- `docs/metier.md` reste une synthèse stable.
- Le RAG ne doit pas écraser la provenance.
- Toute réponse doit conserver le scope (`GLOBAL`, `TW`, `KR`, `UNKNOWN`).
- Les contradictions doivent être conservées, pas écrasées.

## Liens utiles

- [`README.md`](../README.md)
- [`docs/metier.md`](metier.md)
- [`references/README.md`](../references/README.md)
- [`aidd_docs/tasks/2026_09/2026_09_03_rag/spec.md`](../aidd_docs/tasks/2026_09/2026_09_03_rag/spec.md)

## Note de reprise

Quand tu reprends:

- commence par relire la spec RAG
- puis décide du contrat de données avant l’implémentation
- évite de choisir trop tôt une techno d’indexation
