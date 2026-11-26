# Glossary (G-93, A4.1.1, A4.5, N5.2.1)

1,274 term records from A4.5.1 to A4.5.10, built from the verified research rows (`research/glossary/final/glossary-terms.jsonl`, thread "Complete football terminology glossary", 2026-11-26). Nothing is filled from memory: every record points at a register row that lists the pages actually read.

| File | Holds |
|---|---|
| `terms-<leaf>.json` (10) | Records: `id` (`term.<slug>`), `term`, `aliases`, `definition`, `domain`, `subdomain`, `level`, `ownerLeaf` (the A4.5 leaf), `factRow`, `variants`. `diagram` and `lesson` are optional and unset until the diagram pass and G-94 fill them. |
| `facts-<domain>.json` (4) | One Q6 row per term (`F-glossary-NNNN`): sources with URL, publisher, quote of at most 20 words and independence group. Status is computed by `computeStatus`, never typed. |
| `not-shipped.json` | The A4.5.11 block list (238 terms, the dropped rows minus any later sourced). No screen, lesson or template may use them. |
| `build/build.py` | The converter (not shipped). `python3 -I build.py RESEARCH_DIR A4_FILE OUT_DIR`. |

## Status (computed; identical to the research file)

569 Verified, 208 Rulebook only, 253 2 of 3, 244 1 of 3. An NFL page counts in one group with the NFL rulebook and CBA (A5.2.1), so a row with only those is `Rulebook only`. The developer view shows the status; players do not.

## Code (`src/glossary/`)

- `glossary.link(text, level)` splits text into plain and term segments (longest phrase first, word boundaries, exact term before alias, level-specific record before a `both` one). An alias that names two records links to none (`ambiguousAliases()` lists them; the exact term still links).
- `glossary.lookup`, `byId`, `otherLevel` (the edge case of A4.1.1: show the meaning for the level in play, note the other).
- `glossary.blocked(text)` finds A4.5.11 terms.
- `validateGlossary` checks A4.1.1 and A4.1.2 acceptance: unique ids, existing owner leaf, one term per level, nothing on the block list.

## Known issues, reported to the owners

- Three research pairs overlap at one level (`okie front`, `onside kick`, `two-minute warning`: a `both` row beside level rows). Kept as researched and listed in `KNOWN_LEVEL_OVERLAPS`; the level-specific record wins in links.
- 258 alias phrases name more than one record at a level (for example `press coverage`, `cover 1`, `corner`). They link to nothing by alias.
- Screen strings in app-ui contain 10 block-list terms (Call sheet, Tendency, Wristband, Self-scout, Opening script, Halftime adjustments, Two-point chart, Projection, plus the plain words "empty" and "Tools"). Either those strings change or A4.5.11 moves them out; the bible must decide, because the game's own screens use them.
- The barrel line `export * as glossary from './glossary/index.ts'` is the integrator's.
