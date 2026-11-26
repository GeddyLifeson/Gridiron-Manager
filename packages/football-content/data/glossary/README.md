# Glossary (G-93, A4.1.1, A4.5, N5.2.1)

1,271 term records from A4.5.1 to A4.5.10, built from the verified research rows (`research/glossary/final/glossary-terms.jsonl`, thread "Complete football terminology glossary", 2026-11-26). Nothing is filled from memory: every record points at a register row that lists the pages actually read.

| File | Holds |
|---|---|
| `terms-<leaf>.json` (10) | Records: `id` (`term.<slug>`), `term`, `aliases`, `definition`, `domain`, `subdomain`, `level`, `ownerLeaf` (the A4.5 leaf), `factRow`, `variants`. `diagram` and `lesson` are optional and unset until the diagram pass and G-94 fill them. |
| `facts-<domain>.json` (4) | One Q6 row per term (`F-glossary-NNNN`): sources with URL, publisher, quote of at most 20 words and independence group. Status is computed by `computeStatus`, never typed. |
| `not-shipped.json` | The A4.5.11 block list (228 terms: the dropped rows minus any later sourced and minus the allowed feature names below). `allowed` lists the ten words MA-69 takes off it, and `retiredIds` the three merged rows. No screen, lesson or template may use them. |
| `build/build.py` | The converter (not shipped). `python3 -I build.py RESEARCH_DIR A4_FILE OUT_DIR`. |

## Status (computed; identical to the research file)

568 Verified, 208 Rulebook only, 252 2 of 3, 243 1 of 3 (the research file's counts, less the three merged rows, whose sources were folded together and the status recomputed). An NFL page counts in one group with the NFL rulebook and CBA (A5.2.1), so a row with only those is `Rulebook only`. The developer view shows the status; players do not.

## Code (`src/glossary/`)

- `glossary.link(text, level)` splits text into plain and term segments (longest phrase first, word boundaries, exact term before alias, level-specific record before a `both` one). An alias that names two records links to none (`ambiguousAliases()` lists them; the exact term still links).
- `glossary.lookup`, `byId`, `otherLevel` (the edge case of A4.1.1: show the meaning for the level in play, note the other).
- `glossary.blocked(text)` finds A4.5.11 terms.
- `validateGlossary` checks A4.1.1 and A4.1.2 acceptance: unique ids, existing owner leaf, one term per level, nothing on the block list.

## MA-69 and known issues

- A4.5.11 blocks unsourced claims about real football, not the game's own feature names that a leaf defines and sources. Allowed (in `not-shipped.json` `allowed`): Call sheet (G7), Wristband (G4), Opening script (G7), Halftime adjustments (I8), Tendency (H2, G8, K2), Self-scout (G8), Two-point chart (G7, I5), Projection (E6, the retirement band), and the plain words "empty" and "Tools". The scan fails only a term with no defining leaf. The screen scan in the test now finds 0 hits over 1,462 strings. `/mnt/project-files/research/glossary/final/dropped-terms.jsonl` still lists them; the builder filters them out.
- Merged (one term per level, A4.1.2): `term.two-minute-warning` takes `term.two-minute-warning-pro`; `term.okie-front` takes `term.okie-front-pro`; `term.onside-kick` is retired because the pro and college rules differ, so `term.onside-kick-pro` and `-college` stay.
- 258 alias phrases name more than one record at a level (for example `press coverage`, `cover 1`, `corner`). They link to nothing by alias; the exact term links.
- The barrel line `export * as glossary from './glossary/index.ts'` is the integrator's.
