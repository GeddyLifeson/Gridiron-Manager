# Gridiron Manager

A football head-coach career game: start in college as a nobody and climb to an NFL-style head coaching job, with realism deep enough that mastering the game reflects real coaching skill. The design lives in the project bible (`bible/INDEX.md` in the project files). This repository is the code.

**Status: phase 0, foundations (bible R1.2.1).** There is no football yet. What exists:

| Piece | Where | Bible |
| --- | --- | --- |
| Workspace of the 18 packages in the module map, each with a readme | `packages/*` | P1.2.1 |
| Dependency lint, core purity lint, forbidden-key scan | `packages/tools` | P1.2.2, P1.1.1, Q1.2.1 |
| Schemas with visibility classes and units on every field | `packages/schema` | P3, P1.3 |
| Seeded random streams (xoshiro128\*\*, keyed by murmur3), engine-owned math | `packages/engine-core` | J13 |
| Rule-set files for pro 2026 and college 2026, key dictionary | `packages/rules-data` | B12, B13, P4.7.1 |
| Fact register: every rule value quoted from the 2026 NFL or NCAA rule book | `facts/rule.json` | Q6 |
| A seeded dummy game, a dummy season, and the golden-seed set | `packages/engine-game` | R1.2.1, Q1.3.1 |
| Save file: one SQLite database with header, command log, hash chain, snapshots, content copies | `packages/store` | P5.1 to P5.3 |
| Command handling, read models, save replay check | `packages/app-services` | P1.1.3, P1.3 |
| Headless runner (`gate`, `games`, `replay`, `validate`) | `packages/headless` | P2.3.4 |
| Empty-world interface | `packages/app-ui` | O |
| Browser build (SQLite WebAssembly on private browser storage) | `shells/browser` | P2.3.2 |
| Desktop shell (Tauri, native SQLite) | `shells/desktop` | P2.3.1 |

## Run it

Needs Node 22.12 or newer. For the desktop shell also Rust and the Tauri prerequisites for your system.

```
npm install
npm run check          # everything: typecheck, lints, tests, headless gate, browser gate, desktop gate if built
npm run check:quick    # skip the browser and desktop steps
npm run dev            # browser build at http://localhost:5173
npm run desktop:build  # desktop shell (then npm run check also runs its gate)
npm run browsers       # once: install Chromium, Firefox and WebKit for the browser gate
```

`npm run check` writes `test-results/summary.md` and one `gate-<platform>.json` per platform. Commit them with the change (there is no CI host yet; GitHub Actions are not used).

## The phase 0 gate

A seeded dummy game replays identically on every platform: the same golden digest from Node on Windows, macOS and Linux, from each browser engine, and from the desktop shell on each operating system; a save written on one opens on the others. The golden digest is in `golden/golden.json`. Changing it needs a commit message that says why.
