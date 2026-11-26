# Presentation QA suite (PV-17)

Test code for plan section 8, PV-17 (O5.5, MB-20, Q1). Nothing here ships.

| File | Checks |
|------|--------|
| `mix.test.ts` | Offline audio mix on the real engine and recipes (fake context, samples rendered): level of every sound, bus off and volume, no clipping over a recorded game, crowd ducking (MB-10), lane overlap, rate limiter, pan and mono. |
| `determinism.test.ts` | Same seed, same game, with the real audio engine and crowd driver running between plays, on all three tiers, audio on and off, cosmetic seed changed; also the real engine game run again after a presented run. |
| `contrast-greyscale.test.ts` | Token pairs, every text run of the gallery against its real background in every theme and palette, state and team colours in grey, marker shapes. |
| `gallery.test.ts` | Every theme and palette draws every surface; no undefined token variable; no literal colour; every strip item and icon present. |
| `gallery.ts`, `markup.ts`, `qa-lib.ts` | Shared gallery page, markup reader, mix helpers. |

Browser pass (screenshots, rendered contrast, greyscale, stability, reduced motion, 200 % text):

    npx tsx scripts/presentation-qa/screenshots.ts [--engine chromium|firefox|webkit] [--self-check]
    npx tsx scripts/presentation-qa/screenshots.ts --baseline DIR     # keep a reference set
    npx tsx scripts/presentation-qa/screenshots.ts --compare DIR      # fail above 0.2 % changed pixels

Images go to `test-results/presentation-qa/` (ignored by git). Baselines are kept outside the repo (on Marlon's PC); pixels differ between machines, so compare only against a baseline made on the same machine and browser.

Known findings, encoded so they cannot go stale:
- `mix.test.ts` `KNOWN_LONGER_THAN_ROW`: seven recipes outlast their cue-table row, so the lane scheduler thinks the lane is free while they still sound (owners PV-02 rows, PV-07 recipes).
- `mix.test.ts` `it.fails`: back-to-back alerts keep the crowd dipped past the 2.5 s of MB-10 (owner PV-06).
- Team home and away colours are hue-only in grey (1.02 to 1.17:1); names and marker shapes carry them.

Open: field-view screenshot (waits for PV-03 field art, PR 211), Classic theme (picked up automatically once it is in `THEME_IDS`), flash-rate check on a frame capture, long runs on Marlon's PC.
