# Doc métier

## Objectif

AION Context MCP sert de mémoire de travail durable pour AION 2.

Le système ne décide pas à la place du modèle. Il stocke, retrouve et contredit du contexte utile pour éviter la perte d’information et garder la provenance visible.

## Problème métier

Les échanges de recherche produisent vite:

- des observations utiles
- des affirmations non vérifiées
- des hypothèses
- des contradictions
- des sources éparpillées

Sans mémoire structurée, le modèle réexplore les mêmes sujets, mélange les niveaux de confiance et perd le fil des divergences entre TW, KR et GLOBAL.

## Ce que fait le produit

- Enregistre des sources avec provenance.
- Enregistre des connaissances durables.
- Marque les contradictions au lieu d’écraser l’historique.
- Permet la recherche contextuelle avant toute nouvelle décision.
- Sépare les informations par applicabilité: `GLOBAL`, `TW`, `KR`, `UNKNOWN`.
- Expose un MCP pour que ChatGPT ou un autre hôte puisse consulter et enrichir cette mémoire.

## Corpus métier

Le corpus métier récent est stocké dans [`references/`](../references/README.md) et doit être traité comme source canon.

Ordre de lecture:

1. Dossier consolidé
2. Registre des sources
3. Global Launch
4. Theorycraft / progression / stats
5. Classes / PvP

Règle de formalisation:

- Le corpus reste la matière première.
- `docs/metier.md` reste la synthèse stable et lisible.
- Les changements de fond doivent d’abord apparaître dans le corpus, puis être reflétés dans la synthèse.
- Toute dérivation doit conserver le scope et la provenance.

## Ce que le produit ne fait pas

- Ne remplace pas le raisonnement du modèle.
- Ne prétend pas établir une vérité absolue.
- Ne scrape pas YouTube de façon agressive.
- Ne gère pas une connaissance sans provenance.
- Ne mélange pas automatiquement TW/KR avec Global.

## Acteurs

- Modèle: décide quoi chercher, interprète, synthétise, détecte les contradictions.
- MCP: persiste, récupère, expose la provenance, enregistre les challenges.
- Worker: exécute l’acquisition déterministe de sources.
- Hôte LLM: ChatGPT, Claude, Cursor ou autre client MCP.

## Objets métier

- `Source`: origine d’une information.
- `KnowledgeItem`: fait, observation, hypothèse ou recommandation durable.
- `Challenge`: contradiction, limite ou contre-preuve sur une connaissance existante.
- `AcquisitionJob`: tâche de récupération différée pour une URL.

## Règles métier

1. Toujours chercher le contexte existant avant de réinventer.
2. Ne jamais déduire silencieusement du TW/KR vers le GLOBAL.
3. Séparer `OBSERVATION`, `CLAIM`, `THEORY`, `RECOMMENDATION`.
4. Préférer une source liée à une assertion isolée.
5. Si une nouvelle preuve contredit l’existant, créer un `Challenge` au lieu d’écraser l’ancien contenu.
6. Conserver les données utiles et durables, pas le bruit conversationnel.
7. Garder l’auth MCP explicite et vérifiable.

## Cas d’usage

### 1. Recherche avant réponse

Le modèle lance une recherche de contexte, inspecte les sources et répond avec la meilleure synthèse disponible.

### 2. Enregistrement d’une source

Un humain ou le modèle enregistre une page, une note ou un transcript, avec un scope et un titre clairs.

### 3. Consolidation du savoir

Après validation, des observations répétées deviennent des items de connaissance plus stables.

### 4. Gestion des contradictions

Une source nouvelle contredit une hypothèse existante. L’ancien item reste, un challenge est ajouté, et l’arbitrage reste visible.

## Critères d’acceptation

- Le système garde la provenance des informations.
- Les scopes restent séparés.
- Les contradictions ne suppriment pas l’historique.
- Le MCP est utilisable depuis un hôte externe.
- La documentation indique clairement comment connecter et utiliser le serveur.

## Non-objectifs

- Construire un framework d’agent complet.
- Remplacer le jugement du modèle.
- Introduire de la complexité d’orchestration sans besoin métier.
- Mettre en place une base vectorielle avant d’en avoir l’usage.

## Glossaire

- `GLOBAL`: valable sans dépendre d’une région particulière.
- `TW`: spécifique à Taiwan.
- `KR`: spécifique à la Corée.
- `UNKNOWN`: scope non établi.
- `OBSERVATION`: constat direct.
- `CLAIM`: assertion rapportée.
- `THEORY`: explication ou modèle.
- `RECOMMENDATION`: conseil issu de l’analyse.
