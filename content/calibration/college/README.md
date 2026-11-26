# College calibration targets, G-41 (T12)

WP-13 loaded 86 rows of T12 into `../targets.college_2026.json`. G-41 audited every T12 table row against that file.

- `coverage.json`: all 77 T12 table rows, each mapped to its target ids, with the power and other tier columns and the pro column as printed. The pro column is kept so the test can prove no college value equals it.
- `extra-targets.json` and `../../../facts/college-targets.json`: the three T12 rows WP-13 had not loaded (unbeaten share, winless share, points per drive). Each has one read source (1 of 3), tier `watch`, filter `none` until the harness has the measure.
- Status is computed from sources (Q6.1.2). No college row is Verified, so none is `certify`. The 11 open rows of T12.7.1 have no number and print MISSING SOURCE.
- Test: `packages/headless/test/college-targets/`. Regenerate with `python3 content/calibration/college/authoring/extras.py` then `coverage.py <T12 file>`.

Merge note for the integrator: `extra-targets.json` is a separate file; fold it into `targets.college_2026.json` (or load both) when convenient. Harness measure needed for the extra rows: team-season unbeaten and winless counts, and offense-only points per drive.
