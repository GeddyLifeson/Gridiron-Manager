# Game management and sideline screens (G-61): decisions and owed requests

Bible: I5 (decision point, clock, timeouts, challenges, penalty choices), I6.3 (injury replacement), I7 (sideline
information), I11 (sideline operation), O2.1.2, O2.1.3, O2.4, O2.5.3. Code:

| Folder | What |
| --- | --- |
| `app-services/src/read-models/game-management/` | `buildGameManagementView` (pure) and the `gameManagement` read-model spec: decision bar, clock and arithmetic panel, timeout and challenge controls, sideline feed, injury list. |
| `app-services/src/commands/game-management/` | Commands (`gm.timeout`, `gm.challenge`, `gm.decide`, `gm.recommend`, `gm.timeout_request`, `gm.channel`, `gm.ask_booth`, `gm.message_read`), `refusal` (first check against the view), `expiryCommand` (timer at zero). |
| `app-ui/src/screens/game-management/` | `GameManagementPanel`, keys and hold-to-confirm, route entry. |

## How the leaves map

- **Legality is the engine's.** Timeout and challenge controls show `clock.timeoutAllowed` and `replay.challengeRefusal` / `replay.challengeable` answers with their reason ids. Bar options are the engine's legal list (O2.4.3: the UI computes nothing).
- **Every I5 decision kind prompts** (penalty, runoff, challenge, fourth down, try, kickoff, toss, overtime toss, kneel), in rule order (penalty first), with real-time limits: play clock for fourth down and tries, 10 s for penalty choices, the tempo window for a challenge. At zero the standing rule applies, else the conservative default, and the command logs which (`decidedBy`).
- **Charts and estimates only.** The bar shows the user's own G-71 chart cell and the staff kick range. Model values appear only through the analyst's line (I5.1.2), which arrives after his delay.
- **Information arrives late, later when tired.** Every message, the analyst line and each injury report reaches the coach at `producedAt + speaker latency + infoDelayS`, where `infoDelayS` is G-53 `gameDayEffects` (E7.4.2). Full text only from the current headset channel and the bench; other channels give headline counts (I7.5.1). One line, at most 60 characters; higher priority replaces lower; the list keeps the last ten.
- **By rung.** Head coach decides; an advisor recommends on the same clock; a coordinator gets no bar and asks for timeouts.

## Assumptions (flagged, not triple verified)

- **A-G61-1** Toss and overtime-toss answer time reuses the 10 s penalty time; no leaf gives one.
- **A-G61-2** The burn estimate takes the offense to snap with 2 s on the play clock ("less the time the snap itself is delayed" has no value in I5.4.1).
- **A-G61-3** Guard setting "minimal" keeps only the challenge flag (O2.5.3 names the setting, not its list).
- **A-G61-4** Expiry for kinds I5.1.1 does not name (runoff, toss, kickoff without an engine tag) takes the engine's `conservative` tag, else the first legal option. The kneel offer is never automatic: expiry declines it (O2.4.4).
- **A-G61-5** The arithmetic panel shows only when the leading team has the ball; the two-minute warning ahead counts as one more stop for the trailing team.
- **A-G61-6** Bench messages (`channel: 'sideline'`: trainer, players, a coach beside him) are always heard in full; headset notes follow the channel rule.

No new football fact is used; every rule value (play clock, downs, timeouts, challenges, warning) comes from the rule set through the source.

## Owed by the integrator ("Integrate: rule key mapping and gate")

- **CR-G61-1** Move `app-services/test/read-models/game-management/schema.ts` (`GameManagementData`) into `@gm/schema` and pass it to `gameManagementReadModels`.
- **CR-G61-2** Bind `GameManagementSources.inputs` once the live game sits in the observed world: engine dead-ball record and pending events (J11), officiating legality, G-71 chart view, staff estimates and messages (K6, G-75), injury reports (G-33), `life.gameDayEffects(...).infoDelayS` (G-53), seat (G-55).
- **CR-G61-3** Barrel lines: `export * as gameManagement` for the read model and the commands in app-services; re-export `screens/game-management` from app-ui; G-60 embeds `GameManagementPanel` in `game.console` (until then the route may fill it). app-ui keeps a copy of the view and command types in `types.ts` until the barrel exists.
- **CR-G61-4** Add `PROMPT_BINDINGS` (`console.prompt`, `prompt.option_1..4` on Digit1..4) to `keymap.default.json`.
- Register `PARAMS` (`app-services.game-management`) wherever parameter files are collected.
