# AION 2 reference corpus

This directory contains the frozen source corpus used to build the current AION 2 business knowledge.

## Canonical reading order

1. `AION2_00_Dossier_Consolide.docx`
2. `AION2_01_Registre_Sources.docx`
3. `AION2_02_Global_Launch.docx`
4. `AION2_03_Theorycraft_Progression_Stats.docx`
5. `AION2_04_Classes_PvP.docx`

## Roles

- `AION2_00_Dossier_Consolide.docx`: executive index and synthesis layer.
- `AION2_01_Registre_Sources.docx`: source registry and qualification rules.
- `AION2_02_Global_Launch.docx`: global launch state, chronology, and risk points.
- `AION2_03_Theorycraft_Progression_Stats.docx`: progression, stats, gear, and optimization model.
- `AION2_04_Classes_PvP.docx`: class kits, PvP projection, and working tiering.

## Formalization rule

- Treat these files as source material, not application code.
- Use them to derive `docs/metier.md` and any future structured specs.
- When the corpus changes, update the index and then refresh the derived documentation.
- Keep region/applicability labels explicit: `GLOBAL`, `TW`, `KR`, `UNKNOWN`.

## Maintenance rule

- Preserve these `.docx` files as versioned knowledge artifacts.
- If a claim in derived docs conflicts with this corpus, prefer the corpus and record the conflict.
