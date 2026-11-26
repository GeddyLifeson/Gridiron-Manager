// Saves and the app command layer (P1.1.3, P5): a career opens through WorldService exactly as the shell does,
// every command the screens can produce is sent through `WorldService.run`, time is advanced, and the save is
// closed, reopened and replayed. A command the world service has no handler for is a missing hookup.
import { filmCommands, WorldService } from '@gm/app-services';
import { OWNERS } from '../owners.ts';
import type { Recorder } from '../recorder.ts';
import { NodePlatform } from '../../node-platform.ts';

/** Command families the app layer defines and the screens send, by owner. Types come from the module tables where one is exported. */
export function screenCommandFamilies(): readonly { readonly family: string; readonly owner: string; readonly types: readonly string[] }[] {
  return [
    { family: 'home (office, advance time, inbox)', owner: OWNERS.home, types: ['AdvanceTime', 'MarkInboxRead'] },
    { family: 'people (evaluations, notes, meetings, GM requests)', owner: OWNERS.evaluations, types: ['RequestEvaluation', 'WriteNote', 'RequestMeeting', 'GmRequest'] },
    { family: 'film room', owner: 'G-63 film room (app-services film)', types: filmCommands.FILM_COMMAND_TABLE.map((c) => c.type) },
    { family: 'legends export', owner: 'G-84 legends (app-services legends)', types: ['LegendsExport'] },
    { family: 'game-day frame (pregame, halftime, postgame)', owner: OWNERS.gameFrame, types: ['pregame.do_task', 'pregame.delegate', 'pregame.advance', 'pregame.run_to_kickoff', 'halftime.open', 'halftime.add', 'halftime.openers', 'halftime.end', 'postgame.handshake', 'postgame.talk', 'postgame.game_balls', 'postgame.answer', 'postgame.skip_media', 'postgame.notes', 'postgame.day_after', 'postgame.send_play'] },
    { family: 'game management panel', owner: 'G-61 game management (app-services game-management)', types: ['gm.timeout', 'gm.timeout_request', 'gm.challenge', 'gm.decide', 'gm.recommend', 'gm.channel', 'gm.ask_booth', 'gm.message_read'] },
    { family: 'seats below head coach', owner: 'G-79 seats (app-services seats)', types: ['seat.report_look', 'seat.relay', 'seat.chart_row', 'seat.flag', 'seat.advise', 'seat.warn', 'seat.substitute', 'seat.signal', 'seat.correct', 'seat.report_line', 'seat.ask_ahead', 'seat.suggest_call', 'seat.channel', 'seat.standing_rules'] },
    { family: 'game plan and call sheet', owner: OWNERS.gameplan, types: ['gameplan.add_to_plan', 'gameplan.submit_plan', 'gameplan.add_entry', 'gameplan.set_script'] },
  ];
}

export interface SaveSession { readonly svc: WorldService; readonly platform: NodePlatform; readonly name: string }

export async function openCareer(rec: Recorder, saveDir: string): Promise<SaveSession> {
  const platform = new NodePlatform(saveDir);
  const name = `playtest-${rec.seedHex}`;
  await platform.deleteSave(name);
  const svc = await WorldService.newCareer(platform, { saveName: name, masterSeedHex: rec.seedHex, startSeasonYear: 2026 });
  const s = svc.worldSummary().data;
  if (s.competitions.length !== 2) rec.add('invalid', 'save', 'world.competitions', `A new career has ${s.competitions.length} competitions, not college and pro.`, OWNERS.worldService);
  const teams = s.competitions.reduce((n, c) => n + c.teamCount, 0);
  if (teams === 0) rec.add('missing', 'save', 'world.no_generation', 'A new career has no teams and no people: WorldService.newCareer does not run world generation (G-81) or the history run.', OWNERS.worldLoop, { people: s.peopleCount });
  if (svc.saveHeader().userPersonId === null) rec.add('missing', 'save', 'world.no_user_coach', 'A new career has no user coach: coach creation (E1) is not a command, so the save header names nobody.', `E1 coach creation via ${OWNERS.schemaIntegrator}`);
  return { svc, platform, name };
}

/** Sends every screen command once; an unknown one is a missing hookup (one finding per family). */
export async function probeCommands(rec: Recorder, svc: WorldService): Promise<string> {
  let unknown = 0;
  let total = 0;
  for (const f of screenCommandFamilies()) {
    const missing: string[] = [];
    for (const t of f.types) {
      total++;
      const r = await svc.run(t, {});
      if (!r.ok && r.code === 'unknown') missing.push(t);
    }
    unknown += missing.length;
    if (missing.length) {
      rec.add('missing', 'commands', `unregistered:${f.family}`, `${missing.length} of ${f.types.length} ${f.family} commands have no handler in WorldService (no COMMANDS row, no applyCommand case), so they are never applied, logged or saved.`, `${f.owner}; register via ${OWNERS.schemaIntegrator}`, { types: missing });
    }
  }
  return `${total - unknown} of ${total} screen commands reach a handler`;
}

/** Advances the calendar by `days` in weekly steps through the real command and checks the summary moves. */
export async function advanceSeason(rec: Recorder, svc: WorldService, days: number): Promise<void> {
  const before = svc.worldSummary().data.calendar;
  for (let d = 0; d < days; d += 7) {
    const r = await svc.run('AdvanceDay', { days: Math.min(7, days - d) });
    if (!r.ok) { rec.add('invalid', 'save', `advance.rejected:${r.code}`, `AdvanceDay was refused: ${r.reason}`, OWNERS.worldService); return; }
  }
  const after = svc.worldSummary().data.calendar;
  if (after.seasonYear * 1000 + after.dayIndex <= before.seasonYear * 1000 + before.dayIndex) {
    rec.add('stuck', 'save', 'advance.calendar_still', 'The calendar did not move after a season of AdvanceDay.', OWNERS.worldService, { before, after });
  }
}

/** Closes, reopens and replays the save; the reopened state must hash the same. */
export async function roundTrip(rec: Recorder, s: SaveSession): Promise<SaveSession> {
  const v = await s.svc.verify();
  if (!v.ok) rec.add('invalid', 'save', 'verify.failed', `The save log does not replay: ${v.problems.slice(0, 3).join('; ')}`, OWNERS.saves);
  const hash = s.svc.worldSummary().data.stateHash;
  await s.svc.close();
  const svc = await WorldService.load(s.platform, s.name);
  const again = svc.worldSummary().data.stateHash;
  if (again !== hash) rec.add('invalid', 'save', 'reload.hash_changed', 'The reopened save hashes differently from the state that was closed.', OWNERS.saves, { before: hash, after: again });
  return { ...s, svc };
}
