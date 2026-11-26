# G-69 decisions and owed requests

1. **The day-after session counts toward the head coach's 3 media days** (`media.day_after_counts_toward_week`, Assumption). H1.2.1 places sessions on Monday (the day after), Wednesday and Friday; H7.1.1 lists the day-after session separately. Sent to the bible thread as CR-G69-B1.
2. **Default practices are in shells with thud contact.** This means a whole default season shows zero limit warnings (H1.2.1 acceptance). Padded days are the user's choice and are checked by the G-12 checker.
3. **Every advance control stops in front of the game block.** The game belongs to area I, so "to game day" means exactly that.
4. **First week of a season:** a scheduled day-after session becomes a mid-week session, because there was no previous game.
5. **Real people:** curfew outcomes for real people are logged only as `late_for_curfew`. No personal events are attached.
6. **The editor refuses only what is physically impossible:** a clash, a resolved block, or a fixed block below coordinator. Rule breaking is allowed with a warning and goes on to compliance (L8.2.5).

## Owed to the integrator
- CR-G69-1: add the data/week-keys.json rows to the G-10 league files and key dictionary. `weekLookup` throws if the two ever disagree.
- CR-G69-2: add `export * as week from './week/index.ts'` to the league barrel; add a `week.schedule` read model in app-services wrapping `week.scheduleView`; register `weekScheduleRoute` for `week.schedule` in the shell route table.
- CR-G69-3: add the week PARAMS to the engine param table if it lists league modules.
