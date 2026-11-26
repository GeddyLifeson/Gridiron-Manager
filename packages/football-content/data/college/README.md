# College content and level priors (G-40, T10)

| File | Holds |
|---|---|
| `priors.college.json` | T10.5.1 keys (`personnel_priors.college`, `tempo_priors.college`, `qb_run_priors.college`, `rpo_share.college`, `strength_call.college`, `pass_rate.college`, `fourth_go.college`, `install_size.college`, `signal_method.college`), the offensive and defensive system families (T10.2.1, T10.3.1), the kicking priors (T10.4.1), the second-subdivision override block, and open items. Every value lists the fact rows it cites. |
| `facts-measured.json` | 8 measured rows (pass rate, fourth-down go rates, field goal rate and attempts, punts). Two independent play-by-play feeds each: CFBD-lineage (project run, FBS 2022 to 2025) and ESPN-lineage (this package's script, 2022 to 2024). Status `2 of 3`. |
| `facts-design.json` | 10 Assumption rows: personnel, tempo, quarterback-run, run-pass-option, strength call, install size, family shares, lower-division pass rate and share shift. No dataset carries formation or system labels for college. |
| `espn-crosscheck.json`, `build/espn_crosscheck.py` | The second-source run and the script that made it (`python3 -I espn_crosscheck.py ESPN_DIR OUT.json`). |
| `lib.ts` | Types and pure helpers (`shareSum`, `offenseFamilies`, `passRate`). |

## Status, stated plainly

- Status is computed from sources by the test. Nothing here is typed as Verified.
- The two feeds are both distributed through the sportsdataverse release repository but come from different upstream data (CFBD, ESPN). The ESPN run includes FCS opponents and covers 2022 to 2024. Field goal attempts differ by 4% (1.51 against 1.57). A third source (published NCAA team statistics) was not read, so no measured row is Verified.
- Not a pro copy: every college value differs from its pro counterpart; the test checks the three headline numbers.
- Lower-division offense shift: T10.2.1 says move 10 points from the first row to the last three and gives no split. This file splits it in proportion to the current shares (12:3:5). That split is an Assumption row.
- `strength_call.college` is stored as a default key, status Assumption (the bible listed it as general coaching knowledge; no source read).
- `signal_method.college` only names the rule key (`comm.c2p_allowed`, owned by B13 and G-10); it holds no value.

## Not found, left open (priors.openItems)

Measured system, tempo, personnel and run-pass-option shares; shield and rugby punt prevalence; college kickoff touchback rate (conflicting by season); a third source for the measured rows.

## Requests to others

None. No schema, barrel, package-map or golden change is needed: the files sit under `data/college/` and are read as JSON. When a barrel or loader is wanted, the integrator can add one re-export line for `data/college/lib.ts`.
