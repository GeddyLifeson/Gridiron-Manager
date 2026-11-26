# Game build plan (everything outside the simulation engine)

Scope: every remaining piece of code in the bible (`/mnt/project-files/bible/`, areas A to X) that `plans/engine-build-plan.md` does not cover. That file stays the plan for the engine (WP-01 to WP-26). This file extends it with the same structure: work packages (here `G-00` to `G-100`), owned paths, dependencies, waves, acceptance checks, and a model for each package.

Every rule in engine-build-plan.md, top block and section 2 rules, binds these packages too: determinism, truth and observed values kept apart, illegal plays run and draw flags, no level word in conditions, no coach points or experience or picked traits, the play clock always runs, real-world numbers only from the bible, `rules-data` or `facts/`, golden changes only with a stated reason, no GitHub Actions, no keys or email in files.

## 0. Model policy (Marlon, 2026-11-26 01:35 UTC)

- **Fable** (`claude-fable-5-2`): only genuinely hard modules: simulation core, AI decision-making, determinism, tricky integration. Marlon asked to be told before the engine code phase so he can use a Fable reset token there.
- **Opus** (`claude-opus-5-5`): normal feature code and UI.
- **Sonnet**: routine data, content tables, test scaffolding, research.

Totals in this file: engine waves 2 to 4 have 13 packages (4 Fable, 7 Opus, 2 Sonnet). Game packages G-00 to G-100 are 101 packages (7 Fable, 80 Opus, 14 Sonnet).

## 1. Models for engine waves 2 to 4

engine-build-plan.md is not edited. This table only adds a model to each of its later packages.

| WP | Title | Model | Reason |
|----|-------|-------|--------|
| WP-14 | Pre-snap phase | Opus | Tick stages with clear J5 cases; hard parts (motion legality) already live in WP-10. |
| WP-15 | Starter content | Sonnet | Content tables: formations and one base play per kind, checked by the compiler. |
| WP-16 | Ball physics and kicking | Opus | Well-specified physics with J9 acceptance numbers. |
| WP-17 | Environment | Opus | Weather and footing streams; bounded model with J12 cases. |
| WP-18 | Fatigue and substitution | Opus | Bookkeeping over game state with D10 cases. |
| WP-19 | Player AI | **Fable** | Core AI decision-making for 22 players per tick under perception limits (K1). |
| WP-20 | Quarterback model | **Fable** | The hardest decider in the engine: reads, timing, pressure, throw choice (J7). |
| WP-21 | Ball carrier and tackling | Opus | Path choice and contests reuse WP-12 and WP-19; narrower than the QB. |
| WP-22 | Fouls and injuries from play | Opus | Event generation from contests with rates as parameters. |
| WP-23 | Tick resolver assembly | **Fable** | Tricky integration of every stage, determinism and the 50 ms play budget. |
| WP-24 | Fast simulation and diff runner | Opus | Worker batching and first-divergence reports; the logic is mechanical. |
| WP-25 | Full content set | Sonnet | Content volume over an existing, validated format. |
| WP-26 | Play-level calibration | **Fable** | Fitting many coupled parameters to J15 rows without overfitting is the riskiest tuning job. |

## 2. Rules for every game package

- **Owned paths.** A package writes only inside its owned paths: `packages/<pkg>/src/<module>/` and `packages/<pkg>/test/<module>/`, plus any `facts/<file>.json` or data folder listed for it. Two packages in the same wave never own the same path.
- **Entry point.** Each module ships `src/<module>/index.ts`. The package never edits a package `src/index.ts`, `package.json`, `packages/tools/**`, `golden/golden.json`, `test-results/` or `packages/schema/**` outside `src/world/` (G-00 only). The integrator adds one re-export line per module (integrator note, 2026-11-26 01:37 UTC).
- **Integrator.** The thread titled "Build the simulation engine" (or the fresh thread that carries that title after its handoff; state and queue in `/mnt/project-files/plans/handoffs/Build the simulation engine.md`) integrates the whole repo. Send it schema change requests exactly as engine-build-plan.md section 6 says.
- **Screens.** A screen package owns `packages/app-ui/src/screens/<name>/`, `packages/app-services/src/read-models/<name>/` and `packages/app-services/src/commands/<name>/`. It exports a route entry from its own folder; the integrator adds the line to the shell's route table. Screens read only read models that pass the observer filter (G-27).
- **Rule and league values.** A package that reads a league or college rule value declares it in `RULE_KEYS` (as engine WPs do). G-10 adds the values to `packages/rules-data/data/league/**` and the fact rows.
- **Facts.** Every real-world number cites a fact row. Status is computed, never typed. Anything short of three sources prints PROVISIONAL (Q6.3.1).
- **Tuning constants.** `PARAMS: ParamFile` in `src/<module>/params.ts`, basis `bible` with the leaf, or `assumption`.
- **Checks.** Game threads run `npm run typecheck`, `npm run lint` and `npm test` only. `npm run check:quick` rewrites `test-results/` with skipped rows, so its output is never committed. Long runs go to Marlon's PC or the Linux sandbox, never GitHub Actions.
- **Branches and PRs.** One thread per package, its own branch, a draft PR with base `main`, marked ready when the three checks pass. Marlon merges.
- **Done means:** the acceptance check passes and the three checks pass on the package branch.

## 3. Package map changes (one integrator commit before wave 2 starts)

P1.2.1 and `packages/tools/package-map.json` change together. These are the only new packages and edges this plan needs:

1. **New core package `front-office`** (K7, K8, M1 to M6 decisions). May import: schema, rules-data, league, people, models. Owns: general managers, owners, athletic directors, boosters, agents, media and fans as deciders. Reason: the map gives K7 and K8 no home, and `coach-ai` cannot import `league`.
2. **New core package `world`** (X10, X12, the season and off-screen loops). May import every core package. Owns: world generation, the history run, the week and season runner, the off-screen loop. Reason: the living world calls league, people, career, coach-ai and front-office in one deterministic order; no existing core package may import all of them, and `headless` and `app-services` both need it.
3. **Edge `career` → `people`.** Relationships, memory and reputation (L1, E5) read X5 to X7 records that live in `people`.
4. **Owns-text update for `league`:** the X2 event log helpers live in `league/src/history/`, because `league` is the lowest world package that `people`, `career` and `front-office` all import. Row types stay in `schema/src/world/`.
5. **Edge `coach-ai` → `league`** (read only: depth charts, rosters for K3 preparation and K6 staff work).

## 4. Dependency waves

Waves are set by real code dependencies, not by roadmap phase, so later-phase modules can start early. Phase gates (R1.2) are still checked in order and need the assembled game. Count per wave is the parallelism available.

| Wave | Starts when | Packages | Count |
|------|-------------|----------|-------|
| GW1 | Now, from `main` | G-00 to G-11 | 12 |
| GW2 | G-00 merged and the section 3 map commit is in | G-12 to G-32 | 21 |
| GW3 | The GW2 package each one names is merged | G-33 to G-57 | 25 |
| GW4 | Engine phase 1 gate passed (game flow, reference resolver, `Decider`) plus named GW2/GW3 packages | G-58 to G-73 | 16 |
| GW5 | Named GW3/GW4 packages merged | G-74 to G-86 | 13 |
| GW6 | Engine phase 4 gate for the engine-bound rows; named packages for the rest | G-87 to G-100 | 14 |

```
GW1 contract, saves, shells, field view, models, pipeline, data research
 └─ GW2 league core, people core, history log, observer filter, coach profiles, coach record
     └─ GW3 draft, free agency, college off the field, import, relationships, staff, career mechanics
         ├─ (engine phase 1 gate) ─ GW4 coach AI calling, game-day screens, the week
         │                           └─ GW5 AI preparation, front office AI, world loop, job market, exploit search
         └──────────────────────────────── GW6 long runs, designers, teaching, certified mode, release
```

## 5. Work packages

Columns: **Bible** = leaves it implements; **Owns** = paths (tests in the matching `test/` folder are implied); **Needs** = packages that must be merged first; **Acceptance** = the check that ends it; **Model** with a one-line reason.

### GW1: starts now (12)

| WP | Title | Bible | Owns | Needs | Acceptance | Model |
|----|-------|-------|------|-------|------------|-------|
| G-00 | World contract | P3.2, P3.3, P3.5, P3.6, X1.1, X2.1, X8.1, D1.1, E1.1, C6.1, P1.3 | `packages/schema/src/world/**` (new files only, with its own `index.ts`) | main | Every persisted world shape is a zod schema with a visibility class per field and a unit per number, registered in a `worldSchemas()` list; forbidden-key lint passes; one round-trip test per shape; a contract-decisions list like engine section 5 | Opus: contract design over written leaves, same job the integrator did for `src/sim/` |
| G-01 | Save core: command log, snapshots, replay | P5.1, P5.2, P5.3, P5.8, Q1.3.1 | `packages/store/src/save/`, `src/log/`, `src/snapshot/` | main | A save replays from its command log to the same state hash on Linux, Windows and browser; undo per P5.2; crash recovery test per P5.8 | **Fable**: determinism of the whole game rests on it, and errors surface years into a career |
| G-02 | Browser storage, exports, bug bundle | P5.6, P5.7 | `packages/store/src/browser/`, `src/export/` | main | Browser save survives reload and quota warnings; bug bundle replays in `headless` to the same hash | Opus: storage adapters and export formats |
| G-03 | 2D field and film renderer | I9.1, I9.3, O2.3, O6.3, O6.4, J1.1 | `packages/app-ui/src/field-view/` | main (`TrajectoryRecord` is in the sim contract) | Draws a recorded play from a fixture `TrajectoryRecord` tick by tick at 60 fps on the minimum hardware (P6.2); markers match O6.3; step, scrub and replay controls | Opus: rendering and animation against a fixed record format |
| G-04 | App shell, navigation, settings store, design tokens | O1.1, O1.3, O1.4, O1.5, O5.3, O6.1, O6.2, O6.6, O6.7 | `packages/app-ui/src/shell/`, `src/tokens/`, `packages/app-services/src/settings/` | main | Screen map routes render; every screen reachable by keyboard (Q1.5.2 for the shell); tokens light and dark | Opus: UI framework work |
| G-05 | Desktop shell | P2.3, P1.4 | `shells/desktop/**` | main | Desktop build runs on Windows with native save files and the worker layout of P2.1; installer builds | Opus: Tauri integration and file access |
| G-06 | Browser build | P2.3, P5.6 | `shells/browser/**` | main | Browser build loads offline after first visit and passes `gate:browser` in Chromium | Sonnet: build configuration over the existing Vite shell |
| G-07 | Expected points, win probability, success rate | N2.2, N3.3, G8.2 | `packages/models/src/ep/`, `src/wp/`, `src/predictability/` | main | Models fit from the nflverse baselines in project files; each published comparison number cites a fact row; deterministic output | Opus: standard models with clear targets |
| G-08 | Content pipeline, hot reload, text templates engine | P4.1 to P4.6 | `packages/tools/src/content/` (handed over by the integrator), `packages/football-content/src/templates/` | main | Content packs validate, hash and hot-reload in dev; illegal plays flagged, not refused (P4.2.2) | Opus: tooling with validation rules |
| G-09 | People pack format and validator | U1, U2.1, U7, P7.3.1 | `packages/people/src/pack/`, `data/people-pack-schema/` | main | Pack tables encode and decode; checksum verify; a pack with a protected-event row fails validation (A6.3.1) | Sonnet: file format and validators from a written spec |
| G-10 | League, cap, college and injury fact research | C5, C6, C7, C8, C11, T5 to T7, D11.2, Q6 | `facts/league.json`, `facts/cap.json`, `facts/college.json`, `facts/injury.json`, `packages/rules-data/data/league/**` | main | Every league-rules key named in C5 to C8, C11, T5 to T7 has a value with fact rows; rows short of three sources print their status; nothing filled from memory | Sonnet: research and data entry (research runs on Sonnet per project memory) |
| G-11 | Generated places, teams and stadiums data | C1.2 to C1.4, T2.4, U4.1, A6.2 | `packages/football-content/data/world/` | main | Generated clubs and schools cover every slot of C1.1 and T2.1; no real name or mark (A6.2.2 scan); climate rows cite sources | Sonnet: content tables |

### GW2: after G-00 and the map commit (21)

| WP | Title | Bible | Owns | Needs | Acceptance | Model |
|----|-------|-------|------|-------|------------|-------|
| G-12 | Calendar engine | C4, T3.2, C11.2, X11.1 | `packages/league/src/calendar/` | G-00, G-10 | A year rolls from January to January for both levels; every C4 and T3.2 window opens and closes on its rule key; time limits checked (C11.1 work-rule checker) | Opus: event engine with many windows |
| G-13 | Schedule generator, pro and college | C2, T3.1 | `packages/league/src/schedule/` | G-00, G-11 | Pro schedule follows the C2.1 opponent formula for every rotation year; college schedule meets T3.1; both verified against the patterns in team memory `schedule-patterns-audit` | Opus: constraint scheduling |
| G-14 | Standings, tiebreakers, playoffs, rankings, bowls | C3, T3.3 to T3.6, T3.8 | `packages/league/src/standings/`, `src/postseason/` | G-00 | Each C3.2 tiebreaker step is a named test; brackets fill under both formats; draft order hand-off (C3.5) | Opus: rule-heavy but well specified |
| G-15 | Roster rules and transaction engine | C5, T5.1, H6.1, H6.2 | `packages/league/src/roster/` | G-00, G-10 | Every limit read by key; waivers, practice squad, reserve lists and cutdown as transactions with legal and illegal cases | Opus: transaction rules |
| G-16 | Player contracts and cap accounting | C6 | `packages/league/src/cap/` | G-00, G-10 | Cap charges, proration, cuts, tags and the rookie scale match hand-worked cases from C6; each figure cites a fact row | Opus: accounting rules |
| G-17 | Person generator and attributes | D1, D2, D3, D4, D5, D13.2, D13.4, X1, X1.2 | `packages/people/src/generator/` | G-00 | Generated populations match D2.5 position norms within stated tolerances; drift guards hold over 30 cohorts; truth and estimates separate | Opus: generator with validation |
| G-18 | Names and backgrounds tables | D13.5, A6.2 | `packages/football-content/data/names/` | G-00 | Name and hometown tables with frequency weights and sources; scan finds no real current player's full name | Sonnet: content tables |
| G-19 | Scouting estimates and grade display | D6, X1.3, O6.5 | `packages/people/src/scouting/` | G-00, G-17 | Estimate bands narrow with evidence per D6.4; display scale configurable (default per D6.2); no true value reaches a read model | Opus: estimation model |
| G-20 | Development and aging | D7, D8, T8.1, T8.2 | `packages/league/src/development/` | G-00, G-17 | Gain, plateau and decline curves per position meet D8.2; Q1.6.4 talent distribution stable over 30 headless seasons | Opus: tuned model with long-run checks |
| G-21 | Injury catalogue data | D11.2, D11.7 | `packages/football-content/data/injuries/` | G-00, G-10 | Every catalogue row has body part, recovery range and fact rows | Sonnet: content table |
| G-22 | History event log and label engine | X2, N2.8, X2.3, X2.4 | `packages/league/src/history/`, `packages/models/src/labels/` | G-00 | Labels resolve to evidence rows; the R1.2.9 test (1,000 random labels each traced to log rows) passes on a generated history; size budget per X2.4 | Opus: central but well specified |
| G-23 | Needs, stress and memory | X5, X6, D12 | `packages/people/src/needs/`, `src/memory/` | G-00 | Stress accumulates and smooths per X5.3; short and permanent memory layers per X6; protected people respected (X5.5) | Opus |
| G-24 | Relationships and culture | X7, X9, L2.1, L2.4 | `packages/people/src/relationships/`, `src/culture/` | G-00 | Edges grow and decay from fit and shared history only; culture drift per X9.3; unit cohesion feeds D9.5 | Opus |
| G-25 | Positions as data, job catalogue, succession | X8, S1.1, S1.2, L4.1 | `packages/career/src/positions/` | G-00 | Every rung 0 to 9 and staff chart slot is data; vacancies cascade per X8.4 | Opus |
| G-26 | Coach AI profiles | K2 | `packages/coach-ai/src/profile/` | G-00 | Generated coaches match K2.3 league calibration; profiles hold only demonstrated behaviour (K2.7); no forbidden keys | Opus |
| G-27 | Observer filter and read models core | K9.1, K9.3, P1.3, P2.2, Q1.4.1, Q1.4.2 | `packages/app-services/src/observer/` | G-00 | Q1.4.1 and Q1.4.2 pass: no truth-class field reaches any read model or AI view; the K9.3 information audit runs as a test | **Fable**: every screen and AI depends on it, and a leak breaks the realism and fairness rules silently |
| G-28 | Rule-breaking: act, log, detection, penalty | L8.2.5, C11, T9.5, K2.8, K6.6, K7.7, I11.8 | `packages/league/src/compliance/` | G-00, G-22 | One owner for acts by user and AI alike; each act logs, has a detection chance and a penalty from C11 and T9.5 rows | Opus |
| G-29 | Coach record: creation, philosophy, notebook | E1, E10, E11, S2 | `packages/career/src/coach/` | G-00 | Creation is background choices with no point spend (E1); philosophy consistency ledger (E10.4); notebook resurfacing (E11.3) | Opus |
| G-30 | Personal wealth | E6, S9.1 | `packages/career/src/wealth/` | G-00, G-10 | Cash flow, tax, housing and investment cases from E6 with tax rows cited; the firewall rule (E6.12) holds | Opus |
| G-31 | Decision log | N3 | `packages/models/src/decisions/` | G-00, G-07 | Every decision type in N3.2 recorded with the model's view; integrity checks of N3.5 | Opus |
| G-32 | Crisis catalogue and media text templates | L9.2, L6.2, H7.2, P4.6 | `packages/football-content/data/crises/`, `data/templates/` | G-00, G-08 | Every catalogue row and template validates; no real person, no cause of death for retired people | Sonnet: content tables |

### GW3: after the named GW2 packages (25)

| WP | Title | Bible | Owns | Needs | Acceptance | Model |
|----|-------|-------|------|-------|------------|-------|
| G-33 | Medical process between games | D11.1, D11.3 to D11.6, H5 | `packages/league/src/medical/` | G-12, G-21 | Who decides what (D11.3); concussion protocol steps; report designations; return and re-injury rates as rows | Opus |
| G-34 | Draft | C7, M4.5, C3.5 | `packages/league/src/draft/` | G-14, G-15, G-16 | Order, picks, trades of picks, the event with a running pick clock, rookie contracts | Opus |
| G-35 | Free agency and trades mechanics | C8, M5 (mechanics) | `packages/league/src/market/` | G-15, G-16 | Free agent types and windows by key; trades legal by cap and roster rules | Opus |
| G-36 | Recruiting | T4 | `packages/league/src/recruiting/` | G-12, G-17, G-19 | Prospect pool, calendar, visits, offers, signing by T4 rules; class numbers meet T4.8 rows | Opus |
| G-37 | College eligibility, transfers, player pay, the college player | T5, T6, T7, T8.3 to T8.5 | `packages/league/src/college/` | G-12, G-15 | Eligibility clock, transfer window and tampering cases, budget division, draft declaration | Opus |
| G-38 | College program, staff, boosters | T9.1 to T9.4, T9.6, L5.4 | `packages/career/src/college-program/` | G-25 | Budget, booster and staff-pay cases from T9 | Opus |
| G-39 | College-to-pro pipeline | T11 | `packages/people/src/pipeline/` | G-19, G-20 | College evidence feeds pro grades with translation rates as rows (T11.4) | Opus |
| G-40 | College content and level priors | T10 | `packages/football-content/data/college/` | G-00 | System families and level priors file per T10.5 | Sonnet: content tables |
| G-41 | College calibration targets | T12 | `content/calibration/college/`, `facts/college-targets.json` | WP-13 merged | Every T12 row present with true status; nothing copied from pro values | Sonnet: research and data |
| G-42 | People import, shuffle and protection | U2.2, U3, U4.2, U5, U6, U8, X14, A6.3.1, D13.6 | `packages/people/src/import/` | G-09, G-17, G-22 | Q1.6.2: zero protected events on imported people; attribute estimates checked per U3.3; real career used as prior (X14.2) | Opus |
| G-43 | Awards, records, halls, notability | C9, X4, E5.6 | `packages/league/src/awards/` | G-22 | Awards and records computed from logs; notability keep line per X4.2 | Opus |
| G-44 | Yearly cohorts and the news wire | X11, X12.2, C10 | `packages/people/src/cohorts/`, `packages/league/src/news/` | G-12, G-17, G-22 | Cohort targets per X11.2 met each year; news items generated from log rows only | Opus |
| G-45 | Locker room: leaders and discipline | L2.2, L2.3, L2.5, L2.6, L3 | `packages/career/src/locker-room/` | G-24 | Team rules, enforcement and consistency; small coach share per discipline research; no culture effect on fumbles | Opus |
| G-46 | Player relationships and morale effects | L1, D12.5, D12.6 | `packages/career/src/players/` | G-23, G-24 | Conversations, promises and honesty tracked; morale changes only through D12.5 channels | Opus |
| G-47 | Staff structure, hiring staff, support people | L4, K7.6 (mechanics) | `packages/career/src/staff/` | G-25 | Hiring, managing and leaving per L4; tampering rules from C11.6 | Opus |
| G-48 | Owner, GM and athletic director relations, business side | L5 | `packages/career/src/bosses/` | G-24, G-25 | Power arrangement decides who has final say (L5.2.1, college default T9.1.1) | Opus |
| G-49 | Agents and families | L7 | `packages/career/src/agents/` | G-24 | Holdouts and trade requests per L7.2; families as outside voices | Opus |
| G-50 | Community, league relations, crisis engine | L8.1, L8.3 to L8.5, L9.1, L9.3 to L9.5 | `packages/career/src/community/`, `src/crisis/` | G-28, G-32 | Crisis rates from history (team memory: historical rates); protected people never get harmful events | Opus |
| G-51 | Coach contract and negotiation | E3 | `packages/career/src/contract/` | G-25, G-30 | Pay, guarantees, buyouts, control clauses and college contracts per E3 cases | Opus |
| G-52 | Reputation and legacy | E5, S11 | `packages/career/src/reputation/` | G-22, G-24 | Reputation held by observers and traceable to log rows (X2.3); coaching tree | Opus |
| G-53 | Time, energy, health, family | E7, E8, S9.2, S9.3 | `packages/career/src/life/` | G-12, G-23 | Weekly hour budget and delegation (E7.3); health events and relocation (E8) | Opus |
| G-54 | Coaching skills record | E9, S8 | `packages/career/src/record/` | G-22 | Descriptions drawn only from the demonstrated record; no skill points (E9.6 retired ideas) | Opus |
| G-55 | Ladder rungs and the duty system | S1.3, S3 | `packages/career/src/ladder/` | G-25 | Every rung's duty list exists as data and can be performed in a headless run | Opus |
| G-56 | Depth chart and roles | M2, I6.1 | `packages/league/src/depth/` | G-15 | Packages, rotations, special teams units, position battles per M2 | Opus |
| G-57 | Roster needs, pro scouting, camp and cutdown | M1, M3, M6 | `packages/league/src/personnel/` | G-15, G-19 | Needs board, ready list, workouts, waiver review, camp plan and cutdown per M1, M3, M6 | Opus |

### GW4: after the engine phase 1 gate (16)

| WP | Title | Bible | Owns | Needs | Acceptance | Model |
|----|-------|-------|------|-------|------------|-------|
| G-58 | Coach AI play calling | K4 | `packages/coach-ai/src/calling/` | engine phase 1, G-07, G-26 | Q3 calling items; K4.7 exploit list holds; calls depend only on the decision view | **Fable**: AI decision-making under uncertainty, the core of a believable opponent |
| G-59 | Coach AI game management | K5 | `packages/coach-ai/src/management/` | engine phase 1, G-07, G-26 | Fourth-down, try and timeout rates meet their J15 rows (modern rates measured first, R3.2.1); Q3.2.4 | **Fable**: AI decisions measured against real rates and exploit search |
| G-60 | Game-day console: calling offense, defense, special teams | I2, I3, I4, O2.1, O2.2, O2.3 | screens `game-calling` | engine phase 1, G-03, G-04, G-27 | A full game called by keyboard alone (Q1.5.2); play clock never stops outside rule-book stoppages (R1.2.6 gate item 6) | Opus: UI over existing engine calls |
| G-61 | Game management and sideline screens | I5, I6, I7, I11, O2.4, O2.5 | screens `game-management` | engine phase 1, G-04, G-27 | Every I5 decision point prompts in time; sideline information is observed only | Opus |
| G-62 | Pregame, halftime, postgame | I1, I8, I10 | screens `game-frame`, `packages/career/src/gameday/` | G-04, G-27, G-46 | Pregame timeline, toss, talk, halftime adjustments, postgame media flow per leaves | Opus |
| G-63 | Film room and play viewer | N1, O2.6, I9.2, I9.4 | screens `film` | G-03, G-27 | Cut-ups, tagging, player grades, corrections per N1 | Opus |
| G-64 | Scheme knowledge and install | D9, G5 | `packages/league/src/knowledge/` | G-12, G-24 | Knowledge gain and decay, install units, readiness feeding mental errors (D9.4) | Opus |
| G-65 | Practice planning | H3 | `packages/league/src/practice/`, screens `practice` | G-12, G-64 | Periods, scripts, scout looks, reps; college limits read by key (PROVISIONAL rows flagged) | Opus |
| G-66 | Opponent scouting and self-scout | H2, G8, N2.3 | `packages/models/src/tendencies/`, screens `scouting` | G-07, G-27 | Tendency tables from logged plays only; tells and predictability per G8 | Opus |
| G-67 | Playbook manager and terminology | G3, G4, O3.3 | `packages/football-content/src/playbook/`, screens `playbook` | WP-10 merged | Library, series, call strings and wristband codes per G3 and G4 | Opus |
| G-68 | Game plan and call sheet | G6, G7, O3.4 | `packages/football-content/src/gameplan/`, screens `gameplan` | G-66, G-67 | Menu, matchups, sheet layout, script, wristband per G6 and G7; plan locks per G6.6 | Opus |
| G-69 | The week: schedule, meetings, documents, media, travel | H1, H4, H7, H8, H9 | `packages/league/src/week/`, screens `week` | G-12, G-32 | Normal and irregular weeks run; documents generated; travel and media obligations per leaves | Opus |
| G-70 | Roster moves in season screens | H6 | screens `roster-moves` | G-15, G-27, G-56 | Weekly roster cycle and active list done on screen within the rules | Opus |
| G-71 | Analytics screens and team strength | N2.1, N2.4 to N2.7 | `packages/models/src/strength/`, screens `analytics` | G-07, G-27 | Decision chart, tracking data views and team strength; staff access limits per N2.7 | Opus |
| G-72 | Home and people screens | O1.2, O4.1 to O4.5 | screens `home`, `people` | G-04, G-19, G-27 | Player card, roster, staff, relationship and owner screens show estimates only | Opus |
| G-73 | Interface test harness | Q1.5.1, Q1.5.2, Q1.5.3 | `packages/app-ui/test/harness/`, `scripts/ui/` | G-04 | Keyboard-only and screen-reach tests runnable for every registered route | Sonnet: test scaffolding |

### GW5: after the named GW3 and GW4 packages (13)

| WP | Title | Bible | Owns | Needs | Acceptance | Model |
|----|-------|-------|------|-------|------------|-------|
| G-74 | Coach AI preparation | K3 | `packages/coach-ai/src/preparation/` | G-58, G-66, G-68 | AI builds plans and sheets the same way the user does; Q3.2.5 items | Opus: reuses the user-side planners |
| G-75 | Staff AI on the user's team and simulating his week | K6 | `packages/coach-ai/src/staff/` | G-58, G-59, G-65 | Staff act and advise when delegated; good staff means less work (K6.1) | Opus |
| G-76 | Front office AI | K7 | `packages/front-office/src/gm/` | G-34, G-35, G-57 | Needs and value, in-season and offseason moves, college roster building; no exploitable trade loop (Q4.3) | **Fable**: valuation and multi-party AI decisions over cap and draft, easy to exploit if shallow |
| G-77 | Owner, media, agent and fan models | K8 | `packages/front-office/src/stakeholders/` | G-48, G-49, G-52 | Confidence, firing and hiring decisions read results per K8.2; college AD, president, boosters | Opus |
| G-78 | The boss and evaluations | S4, K6.5 | `packages/coach-ai/src/boss/` | G-55, G-26 | Trust, autonomy, work grades, overruling and promotion per S4 | Opus |
| G-79 | Game day below head coach | S5, O7.4 | `packages/career/src/seats/`, screens `seats` | G-55, G-60 | Every sideline and booth seat playable with its channels | Opus |
| G-80 | Job market, hiring and firing | E2, E4, S6, S7 | `packages/career/src/market/` | G-51, G-52, G-77 | Openings, interviews, offers, hot seat and firing per leaves; offers trace to log rows | Opus |
| G-81 | World generation, history run, off-screen loop | X10, X12.1, X12.3, U4.1 | `packages/world/src/generation/`, `src/loop/` | G-42, G-43, G-44, G-76 | A new world builds with a pre-career history; the loop runs every system in one fixed order and replays to the same hash | **Fable**: tricky integration of every world system with determinism over decades |
| G-82 | Fidelity tiers | X13, P6.4 | `packages/world/src/tiers/` | G-81 | Tier boundaries set by measurement (X13.3); no visible seam; full engine for every game (A3.1.1 row 20) | Opus |
| G-83 | Save retention and migrations | P5.4, P5.5, Q1.2.3 | `packages/store/src/retention/`, `src/migrations/` | G-01 | Migration fixtures pass; save size at season 30 measured against P5.4.1 | Opus |
| G-84 | Legends browser and chronicle | X3 | screens `legends` | G-22, G-43 | Pages, chronicle, trees and rivalries, records and search per X3 | Opus |
| G-85 | Career screens by rung and the coach's own screens | O7, O4.6 | screens `career` | G-55, G-80 | Every rung's duty list reachable on screen (R1.2.9 gate item 3) | Opus |
| G-86 | Exploit search | Q4.1, Q4.2, Q4.4 | `packages/headless/src/exploit/` | G-58, G-59 | No dominant strategy and no information leak found (R1.2.6 gate item 1) | **Fable**: adversarial search for dominant strategies needs deep reasoning about the game |

### GW6: long runs, designers, release (14)

| WP | Title | Bible | Owns | Needs | Acceptance | Model |
|----|-------|-------|------|-------|------------|-------|
| G-87 | Season runner and gate harnesses | R1.2.7, Q1.7.2 (season), Q3.1, Q3.3 | `packages/world/src/season/`, `packages/headless/src/season-gate/` | G-69, G-74, engine phase 4 | A season plays at the head coach seat at both levels; Q1.7.2 season level report; Q3 battery runner | Opus |
| G-88 | 30-season run and stability | Q1.6.1, Q1.6.2, Q1.6.4, P6.2.1 | `packages/headless/src/long-run/` | G-81, G-83 | 30 seasons with no invariant failure; stability measures; 20-season advance time measured | Sonnet: harness only; failures go back to the owning package |
| G-89 | Scripted career runs and the career loop search | S10, Q3.2.6, Q4.3.1 | `packages/headless/src/career-run/` | G-80, G-85 | Rung 0 to pro head coach run and a fired-and-rehired run both replay identically | Opus |
| G-90 | Play designer and test bench | G1, O3.1, O3.7 | screens `play-designer` | WP-23, G-67 | Every G1 part editable; illegal plays run and draw flags; test bench runs on the tick resolver | Opus |
| G-91 | Defensive call designer | G2, O3.2 | screens `defense-designer` | WP-23, G-67 | Fronts, pressures, coverages, checks and disguise per G2 | Opus |
| G-92 | Player designer | D13.1 | screens `player-designer` | G-17 | Designed players pass the same drift guards as generated ones | Opus |
| G-93 | Glossary content and links | A4, N5.2 | `packages/football-content/data/glossary/` | G-08 | Every A4 term present with source; every on-screen term links | Sonnet: content from A4 |
| G-94 | Coaching school and teaching | N5.1, N5.3 to N5.6 | `packages/app-services/src/teaching/`, screens `school` | G-31, G-63 | Lessons from the user's own patterns (N5.4); time slows only in practice tools | Opus |
| G-95 | Coaching rating, certified mode, exportable record | N4, P8.1, P7.4, P5.7.2 | `packages/models/src/rating/`, `packages/store/src/certified/` | G-31, G-01 | Score computed per N4.2; certified save rejects tampering; export round-trips | Opus |
| G-96 | Modding and editors | P7.1, P7.2, P7.5 | `packages/tools/src/editors/` (handed over), screens `editors` | G-08 | User content folder loads safely; bad packs refused with reasons | Opus |
| G-97 | Performance pass and benchmarks | P6 | `packages/headless/src/bench/` | G-87 | Every P6.1 budget measured on the target machine and met or reported | Opus |
| G-98 | Accessibility, input and playback settings | O5 | screens `settings` | G-04 | O5.5 accessibility checks; key map remapping; playback settings | Opus |
| G-99 | Coach validation tooling | Q5 | `packages/headless/src/validation/` | G-63 | Blind film test and skill separation runs produce the Q5 reports | Sonnet: test scaffolding |
| G-100 | Release gate | R1.2.10, Q1.8.1, A6.2.2, A6.4.1, Q6.3.1 | `scripts/release/` | all | Name and mark scans clean; provisional fact list printed for Marlon; release row of Q1.8.1 runs on Windows, Linux, browser | Sonnet: scripted checks |

## 6. Model summary

| Model | Engine (waves 2 to 4) | Game |
|-------|-----------------------|------|
| Fable | WP-19, WP-20, WP-23, WP-26 (4) | G-01, G-27, G-58, G-59, G-76, G-81, G-86 (7) |
| Sonnet | WP-15, WP-25 (2) | G-06, G-09, G-10, G-11, G-18, G-21, G-32, G-40, G-41, G-73, G-88, G-93, G-99, G-100 (14) |
| Opus | the other 7 | the other 80 |

## 7. Open items

- Section 3 map changes need the integrator's single commit together with the bible P1.2.1 edit before GW2 opens.
- Phase 5 gate needs modern fourth-down rates measured first (R3.2.1); G-59 cannot pass until that research lands.
- College practice and time limits are PROVISIONAL (R1.2.7 edge case); G-12 and G-65 ship them as config.
- Awaiting Marlon (not rulings): one locked people pack in certified careers (P7.4.1), the practice field as an open lab (A3.2.2), commercial or personal release (A3.3.1). G-95 and G-100 build switches for these, off until he decides.

## 8. Presentation packages (graphics and sound)

Graphics and sound have their own plan: `plans/presentation-build-plan.md`, packages PV-00 to PV-17 in three waves (PW1 starts now). They extend this file and follow its sections 0 and 2. Models: 14 Opus, 4 Sonnet, no Fable.
