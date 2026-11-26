# Automated calibration search

Finds which parameters move which stat-gate rows and proposes parameter sets, by playing games. It only
picks parameter values inside the ranges the parameter files declare (J6.8.1). It cannot fix a behaviour
bug, and it never writes a result: every row still comes out of the play simulation. The gate itself
stays `headless calibrate` (J15.10.1).

    npx tsx packages/headless/src/tune/cli.ts all                 # everything, into test-results/tune/pro_2026/
    npx tsx packages/headless/src/tune/cli.ts measure --games 192 # only the baseline, with standard errors
    npx tsx packages/headless/src/tune/cli.ts confirm --params qb.judge.missPickOpenPerYd,contest.runBlock.gapControlMaxA --redo
    npx tsx packages/headless/src/tune/cli.ts search --redo --iters 8

Run it with no step to see every option. Each step keeps its result in the output folder and is skipped
when the result is there, so a run can be stopped and picked up, and more screen runs can be added later
(`screen --runs 512`). A baseline with overrides (`--ov file.json` or `name=value`) scans around those values.

| step | what it plays | what it tells you |
|---|---|---|
| measure | 96 games in 8 blocks (the first 4 blocks are tune-probe's seeds) | every row with a jackknife standard error: is a miss real or noise |
| screen | 256 runs of 2 games, every parameter nudged 10% of its range at once, in mirrored pairs | leads: which parameter moves which row |
| confirm | the 24 best leads one at a time, down and up, 48 games a side on the baseline's seeds | a slope per row with a standard error |
| search | bounded steps along the confirmed slopes, each played on the baseline's seeds, then 96 fresh games a side | a proposed parameter set and whether it holds on seeds it never saw |
| dead | one game per parameter at the far end of its range | parameters that change nothing (unwired, or never reached) |

Output: `report.md` (ranked, for the tuning threads), `proposal.json` (name to value, ready for
`tune-probe --ov`), and the raw results as JSON.

Why not an evolution strategy: a tick-engine game costs seconds, and such a search needs thousands of
trial runs. Here the slopes are measured once, the step inside the ranges is a small bounded least-squares
problem, and the games decide whether each step is kept.

Limits. Slopes are local, so a far move is trusted only after it is played. Quantile and ordering rows
are pooled from block errors, close to but not equal to the gate's value. A screen hit is a lead until it
is confirmed. A row no confirmed lever can reach is listed as needing a hand fix.
