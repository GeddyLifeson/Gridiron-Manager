# Special-teams call menu

Content ids for every kicking-game call, for every rule set (F12, I4, G7.7.2, K4.6.1). Entry: `src/special-teams/index.ts`.

## What is in it (49 calls)
- Punt: spread, shield, rugby, directional left and right, pooch, coffin corner left and right; fakes (protector pass, punter pass, run).
- Punt return: wall left and right, middle, block, safe.
- Field goal and try: field goal, extra point, fair catch kick; fakes (holder run, holder pass, swinging gate); two-point plays (pick, sprint out, fade, jumbo play action, quarterback power or option, power run).
- Field goal block: edge left and right, middle, safe. Against a try the same calls become `try_block`.
- Kickoff, dynamic format (`kickoff.format` = dynamic, the pro game): touchback, deep landing zone, line drive into the zone.
- Kickoff, traditional format (college): deep, squib, sky, pooch, directional left and right.
- Onside: high bounce, drive, dribble (all rule sets; declared where `kickoff.onside_must_declare` is true), surprise (only where it is false).
- Kick returns: setup-zone middle, left, right (dynamic); middle, sideline left and right, reverse (traditional); hands team.

## Rules it follows
- Rule-dependent calls name the rule values they need (`when`), read by key; no level word appears (P1.1.2). Every rule fact a call depends on is listed in `ruleFacts` and the test checks it exists in `facts/rule.json`.
- Every call lists `basis` rows with a status word; the test checks the word against the number of independence groups (Verified 3+, 2 of 3 exactly 2, 1 of 3 exactly 1, Rulebook only = rule book text only, Assumption = no source), and that every call rests on two or more groups. The NFL rule book and NFL Football Operations pages are one group.
- Sources were read 2026-11-26; the notes are in `/mnt/project-files/research/special-teams-calls/README.md`. Nothing is from memory.
- No outcome numbers. What a kick does comes from J9 and the contests. The fake floor share (0.01) is a coordinator design value.

## Left out, and why
- Wedge and double-wedge returns: a wedge of two or more is a foul at both levels in 2026 (NFL 6-2-1(d), NCAA illegal wedge formation). The coaching pages that teach them predate the rules.
- Directional dynamic kickoffs, the eight-man punt block count, gunner vise counts, and specific fake field goal actions: no source read gives them; where a call needs them they are marked Assumption.
- Rule history: the 2025 NFL rule let only a trailing team declare an onside kick; the 2026 text (6-1-6) allows it at any time. The menu follows the 2026 rule set.

## How the console and the coordinator use it
- `menuGroups(rules, personnelOf)`: one group per sheet box with call templates (schema calls minus players). `data/special-teams/menu-<ruleset>.json` is the committed copy (test checks it byte for byte).
- Console: `app-services/src/commands/game-calling/special-sheet.ts` `specialTeamsSheet(id, groups, inputs)` builds the special-teams `CallSheet`; the console's kick focus opens the box holding the called kind.
- Coordinator AI: `specialOptions(defs, estimatedGain)` gives the K4.6.1 `SpecialOption` list for `callSpecialTeams`; `toKickCall` / `toReturnCall` turn the chosen id into the engine call (`callContentId` = the menu id).

## Owed to the integrator
- Barrel line `export * as specialTeams from './special-teams/index.ts';` in `packages/football-content/src/index.ts`.
- Export lines for `special-sheet.ts` in the game-calling barrel, and `export * as calling` in coach-ai if not already done.
- Wiring: `cfg.sheets.special = specialTeamsSheet(id, specialTeams.menuGroups(rules, personnelOf), inputs)` where the console config is built, and the K4 caller port using `specialTeams.menuFor` + `specialOptions` + `callSpecialTeams`.
- Engine note: fakes and two-point plays resolve as `OffenseCall` with tags `fake` and `from_punt` / `from_field_goal` / `from_try`; the engine has no kick-formation flag on an offensive call, so the formation look of a fake is not yet modelled (CR for a `formationId` for punt and field goal looks).
