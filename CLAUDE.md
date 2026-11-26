# Gridiron Manager: notes for Claude sessions

Shared rules live in the project's master file (`/mnt/project-files/masterclaude.md`, a copy of Marlon's master CLAUDE.md). Read it first. Key rules for this repo:

- Triple-verify every fact, number and rule (three independent sources, or the official primary text plus a cross-check). Anything short of that is flagged: the fact register computes and prints the status.
- No GitHub Actions. No keys, tokens or personal email in files, commits or requests.
- Work on a branch and open a pull request. Never push to `main`.
- Commit and push after every working change.

## Repo-specific

- The design is the bible in `/mnt/project-files/bible/` (INDEX.md). Package layout and import rules: P1.2.1, enforced by `npm run lint` from `packages/tools/package-map.json`.
- Core packages are pure (P1.1.1): no clock, platform random, file, network, display, locale, or platform transcendental math. Use `@gm/engine-core` streams and `dSin`/`dExp`/... The lint fails otherwise.
- Every rule value in `packages/rules-data/data/*.json` cites a row in `facts/*.json` (Q6). Rule rows must be at least "Rulebook only". Status is computed from sources, never typed.
- Binding rulings: no coach points, XP, skill trees, perks or picked traits; people are described by demonstrated behaviour; one difficulty (real life); the play clock always runs. The forbidden-key lint enforces the schema side.
- Golden hashes (`golden/golden.json`) change only in a commit that says why (Q1.3.1).
- One command runs everything: `npm run check`. Results go to `test-results/`, which is not tracked (it conflicted on every merge); quote the summary in the pull request instead.
