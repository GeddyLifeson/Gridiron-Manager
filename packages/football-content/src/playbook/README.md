# Playbook manager and terminology (G-67)

Bible: G3 (playbook manager) and G4 (terminology and call grammar). Entry: `src/playbook/index.ts`. Pure core code (P1.1.1): no clock, no platform random or transcendental math; chances are returned and callers draw from their J13 streams.

| File | Leaves |
| --- | --- |
| `types.ts` | G3.1.1 playbook object, parts, call slots (G4.1.1, G4.5.1) |
| `library.ts` | G3.1.1 sections, status, shared part edits, delete block; G3.1.2 families, concept-by-formation grid, fill cell |
| `roles.ts` | G3.2.1 role links, review, booth reaction report |
| `series.ts` | G3.2.2 looks-alike similarity, series score, tells |
| `size.ts` | G3.3.1 size report, readiness ceiling, upkeep and capacity, retire slider |
| `versions.ts` | G3.4.1 departed view and merges; G3.4.2 versions, game versions, export, import |
| `relearn.ts` | G3.4.1 adoption cost; G4.7.1 rename and family-switch cost |
| `permissions.ts` | G3.4.3 permission table as data |
| `search.ts` | G3.5.1 search and filters |
| `words.ts` | G4.2.2 word list, sound-alike checks; G4.3.1 syllables and spoken numbers |
| `grammar.ts` | G4.1.1 templates and rendering, G4.2.1 family templates, G4.5.1 defensive template |
| `parse.ts` | G4.1.3 parser |
| `spoken.ts` | G4.1.2 huddle; G4.3.1 spoken length; G4.3.2 limits, relay length, band suggestions |
| `numbering.ts` | G4.2.3 run and protection numbering |
| `codes.ts` | G4.4.1 wristbands, G4.4.2 code words, G4.4.3 signals and equity rule, G4.4.4 dummies |
| `defense-lang.ts` | G4.4.5 defensive bands, G4.5.1 relay chain, G4.5.2 naming conventions |
| `line.ts` | G4.6.1 line words, hearing, kill |
| `starter-book.ts` | The starting book from the WP-15 starter content |
| `generate.ts` | G3.1.1 generated book size and generator |
| `params.ts` | Every starting value (basis `bible`, Assumption in the bible) and the G4.2.1 learning profiles |
| `keys.ts` | `comm.c2p_*` rule keys (dictionary names; `comm.c2p_equity_on_failure` requested) |
| `dmath.ts` | Deterministic powers (the engine's dPow is not importable from this package) |

No real-world number is an input here: the sourced G3 and G4 facts (book sizes, call lengths) anchor tuning knobs, which are all in `PARAMS`. Rule values (radio cutoff, speaker count, equity rule) are read by key.
