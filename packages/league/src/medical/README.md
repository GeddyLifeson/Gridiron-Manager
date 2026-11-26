# Medical process between games (G-33)

Bible: D11.1 (between-game part), D11.3 to D11.6, H5. Needs G-12 (calendar, merged) and G-21 (injury catalogue, merged).

| File | Leaf | Holds |
|---|---|---|
| `authority.ts`, `data/medical.json` | D11.3.1, H5.1.1, H5.6.1 | Who decides what; the physician's state and limits; using a player past his clearance as a G-28 act (`medical_clearance`, `concussion_protocol`) with the L8.2.2 objection as trace |
| `estimate.ts` | D11.3.2, H5.1.2 | Sideline read, imaging factor, range that narrows, setbacks |
| `pressure.ts` | D11.3.3, H5.3.1 | Asking trainer or player, overriding a snap cap, trust costs; never moves a concussion or structural injury |
| `concussion.ts`, `data/concussion.json` | D11.4.1, D11.4.2, H5.4.1 | Evaluation result, follow-up exam, five steps, one step per day, consultant confirmation, media rule |
| `report.ts`, `data/designations.json` | D11.5.1, H5.2.1 to H5.2.3 | Report days, labels, who must be listed, truthful draft, status proposal from measured play rates, flags, `injury_report_shading` act |
| `lists.ts` | D11.5.2 | Injured reserve recommendation |
| `reinjury.ts` | D11.6.1 | Re-injury multiplier, physical penalty, major-injury curve |
| `hurt.ts`, `data/playthrough.json` | D11.6.2 | Play-through penalties, toughness, injections, hidden injuries |
| `shutdown.ts` | D11.6.3, H5.3.3 | Surgery-optional paths and dates, the player's choice |
| `view.ts` | H5.1.2, H5.6.2, H5.4.3 | Shown case without truth, daily report, rung filter |
| `cases.ts` | all | `openCase` from an injury event, `caseDay` / `medicalDay` |
| `data/rates.json` | G-33 acceptance | Return, re-injury and play rates as rows citing register rows |

## Status, stated plainly

- Verified rules used: clearance by the club physician (CBA Art. 39), five concussion steps, game statuses without Probable, practice labels. The rest of the rule values ride on requested `medical.*` keys (below) and on fact rows that are mostly `1 of 3` or `2 of 3`; the test prints each rate row's computed status.
- Assumptions (named in `params.json`): almost every effect size, as the bible says (D11.3.2, D11.3.3, D11.6 are design tuning). Play-through penalties except grade 1 ankle. The concussion symptom-day table is tuned so the protocol gives a median of 9 days out and 37 percent playing the next week (D11.4.2 targets, 2 of 3, not in the register yet).
- Not here: in-play injury checks and the hamstring recurrence and snap-count calibrations (WP-22, WP-26: they need the engine's exposure); practice exposure multipliers by tempo (H3 table).
