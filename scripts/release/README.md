# Release gate (G-100)

Bible: R1.2.10 (the v1 release gate), Q1.8.1 ("Before a release" row), A6.2.2 (marks), A6.4.1 (research data), Q6.3.1 (provisional facts).

```
npx tsx scripts/release/gate.ts                 # exit 0 = release PASS, 1 = HOLD
npx tsx scripts/release/gate.ts --report-only   # always exit 0 after writing the report
npx tsx scripts/release/gate.ts --refresh-bible # rewrite the bible snapshot from the live bible
npx vitest run --config scripts/release/vitest.config.ts
```

Writes `scripts/release/report/`: `CHECKLIST.md` (verdict, release items, suites by platform, phase gates, both build plans, bible summary), `BIBLE-CHECKLIST.md` (one line per bible leaf), `PROVISIONAL.md` (the Q6.3.1 list for Marlon) and `results.json` (every check; not committed).

## What it checks

| Group | Checks | How |
| --- | --- | --- |
| R1.2.10 items 1-6 | 12 | Automated: mark scan, real-name scan, research path, per-person record and byte-copy checks of the shipped tree; provisional blockers and list. Tracked: Marlon's acceptance of the list (names its hash), Q5 status, legal review, similarity threshold. |
| Q1.8.1 release suites | 22 suites x Windows, Linux, browser | Read from `test-results/summary.json` (`npm run check`), `test-results/windows-*.md` and `test-results/release/*.json` (contract below). |
| Earlier phase gates | R1.2.1 to R1.2.9 items | Tracked. They must still hold at release. |
| Build plans | WP-01..WP-26, G-00..G-100 | Tracked. MISSING while the owned paths do not exist. |
| Bible | every leaf's acceptance criteria (v1 scope from the tag) | Tracked, with the owning work package; A6.2.2, A6.4.1 and Q6.3.1 come from the automated checks. |

## Statuses

PASS only when verified at the commit under test: an automated check that ran here, or a record in `data/evidence.json` at this commit with three independent confirmations (masterclaude rule 10). FAIL: ran and failed. MISSING: the module or input does not exist yet. PENDING: it exists, nothing verified it at this commit. STALE: evidence from another commit. NOT_APPLICABLE: out of v1 scope, retired, or a contingency step. Uncommitted source changes hold the release.

## Recording a verification

Append to `data/evidence.json` (never edit old records):

```json
{ "check": "bible:B1.1.1", "result": "pass", "commit": "<full or 7+ char hash>", "date": "2026-11-26",
  "confirmations": ["test named ...", "measurement ...", "output as the user sees it ..."], "by": "<thread title>", "notes": "" }
```

Marlon's acceptance of the provisional list uses check `release:3c-marlon-accepts-provisional` and must name the list hash in `notes`.

## Suite result contract

Runners for suites that `npm run check` does not run yet write `test-results/release/<platform>.json`:

```json
{ "commit": "<hash>", "platform": "node-win32-x64 | node-linux-x64 | browser-chromium", "suites": [{ "id": "Q1.7.2", "ok": true, "ruleSets": ["pro", "college"] }] }
```

## Shipped tree

Core and app packages' `src/` and `data/` (P1.2.1 kinds), `content/`, `shells/browser/{src,public,index.html}`, `shells/desktop/{bridge,src-tauri/src}`, plus `shells/browser/dist` when a build exists. Tests, docs, build and authoring scripts do not ship. The blocked-terms list and the real-name guard are excluded from the text scans because they hold marks and hashes on purpose.

## Reviewed hits

A hit that may stay (a licence credit, say) goes in `data/allowed.json` with file, term, reason and reviewer. Allowed hits are still counted in the report.

## Inputs found on the machine

Bible: `GM_BIBLE_DIR` or `/mnt/project-files/bible` (else the committed snapshot `data/bible-criteria.json`). Real names: `GM_PEOPLE_DIR` or `/mnt/project-files/data/people` (else G-18's guard of current people only, reported as PENDING). Research folders for the copy check: `GM_RESEARCH_DIR`, `/mnt/project-files/research`, `/mnt/project-files/data/people`.

## Scan policy (release gate cleanup, 2026-11-26)

`data/policy.json` decides which mark and name hits stay because they sit on a surface a player never sees: fact rows, calibration targets and starter-playbook source citations (provenance files), code comments, JSON annotation keys (`$comment`, `source`, `quote`, ...), code identifiers that are all-capital abbreviations outside a quoted string, and the ordinary word "playoff". Every other hit fails, and a reviewed coincidence (a surname, a town, a Unicode form) goes in `data/allowed.json` with a reason. Permitted hits are counted by reason in the report notes and check lines, never hidden. `test/policy.test.ts` pins the rules and checks that no presentation-layer file imports a provenance file. Anything new that can reach a player is player-facing by default.

`tools/sync-status.ts <fact file>...` copies the computed status over a stored status word that differs (Q6.1.2) and logs why in statusHistory.
