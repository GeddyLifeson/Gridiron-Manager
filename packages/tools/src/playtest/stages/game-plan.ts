// The game week's plan and call sheet through the G-68 commands (O3.4.1 to O3.4.3, G6, G7): the coordinator
// builds a menu from the starter playbook, submits it, the head coach approves it, the coordinator fills every
// template box and the opening script, locks the sheet and exports it. Every refusal of a legal step is a
// finding. The locked sheet is then the call sheet the console should be using on game day; nothing joins them.
import { gameplanCommands as gpc } from '@gm/app-services';
import { seedFromHex, stream } from '@gm/engine-core';
import { gameplan as gp, playbook as pb } from '@gm/football-content';
import { OWNERS } from '../owners.ts';
import type { Recorder } from '../recorder.ts';

const COORDINATOR: pb.Holder = { job: 'coordinator', side: 'offense' };
const HEAD_COACH: pb.Holder = { job: 'head_coach' };

export function gamePlanWeek(rec: Recorder, teamId: number, week: number): string {
  const area = 'game_plan';
  const pick = stream(seedFromHex(rec.seedHex), 'playtest', ['game_plan', rec.season ?? 0, week]);
  const { book } = pb.starterBook(String(teamId));
  const plays = [...book.plays.values()].filter((p) => p.book === 'offense' && p.status !== 'retired').map((p) => p.id);
  if (plays.length < 6) { rec.add('invalid', area, 'book.too_small', `The starter playbook has ${plays.length} live offensive plays.`, OWNERS.gameplan); return 'no plays'; }
  const call = (i: number): pb.Call => ({ playId: plays[i % plays.length]!, tags: [] });
  const offset = Math.floor(pick.uniform() * plays.length);
  const card: gp.HeadCoachCard = {
    fourth: [], twoPoint: [], timeoutRules: [], inBoundsPlayS: 6, kneel: [], fieldGoalLine: { withWind: 0, intoWind: 0 },
    crewTendencies: [], trickHistory: [], depthCard: [], standingInstructions: [], edits: [], stale: [],
  };
  let s: gpc.GameplanState = { menu: [], approval: { state: 'draft' }, matchups: [], proposal: null, sheet: gp.offenseTemplate(), card };
  const ctx = (holder: pb.Holder, at: number): gpc.CommandContext => ({
    holder, unit: 'offense', at, userId: 'playtest',
    review: (sheet) => gp.reviewSheet({ sheet, book, table: gp.proReference2024(), practiced: () => true, readiness: () => 0.8, overLimit: () => false, needsDoubtful: () => null, repsAvailable: 60, qbDislikes: new Set() }),
  });
  let at = 10;
  let refused = 0;
  const run = (holder: pb.Holder, cmd: gpc.GameplanCommand): boolean => {
    const r = gpc.runGameplanCommand(s, ctx(holder, at++), cmd);
    if (!r.ok) {
      refused++;
      rec.add('invalid', area, `refused:${cmd.kind}`, `A legal ${cmd.kind} by the ${holder.job} was refused: ${r.refusal} (${r.rule}).`, OWNERS.gameplan);
      return false;
    }
    s = r.state;
    return true;
  };
  const boxes = s.sheet.boxes.filter((b) => b.side === 0 || b.side === 1);
  for (let i = 0; i < 6; i++) run(COORDINATOR, { kind: 'add_to_plan', entry: { id: `m${i}`, side: 'offense', call: call(offset + i), situationIds: [boxes[i % Math.max(1, boxes.length)]?.id ?? 'first_10'], targetReps: 4 } });
  run(COORDINATOR, { kind: 'submit_plan' });
  run(HEAD_COACH, { kind: 'approve_plan' });
  if (s.approval.state !== 'approved') rec.add('invalid', area, 'approval.not_approved', `After the head coach approved, the plan is "${s.approval.state}".`, OWNERS.gameplan);
  let entries = 0;
  for (const [bi, b] of boxes.entries()) {
    for (let k = 0; k < 2; k++) if (run(COORDINATOR, { kind: 'add_entry', boxId: b.id, entry: { id: `e${bi}_${k}`, call: call(offset + bi * 2 + k) } })) entries++;
  }
  run(COORDINATOR, { kind: 'set_script', which: 'opening', entries: [0, 1, 2].map((i) => ({ id: `s${i}`, call: call(offset + i), purpose: 'show_formation' as const })) });
  run(COORDINATOR, { kind: 'lock_sheet' });
  const exp = gpc.runGameplanCommand(s, ctx(COORDINATOR, at++), { kind: 'export_sheet' });
  if (!exp.ok) rec.add('invalid', area, 'export.refused', `Exporting the locked sheet was refused: ${exp.refusal}`, OWNERS.gameplan);
  else if (!exp.file) rec.add('invalid', area, 'export.empty', 'Exporting the sheet returned no file.', OWNERS.gameplan);
  rec.add('missing', area, 'sheet.not_used_on_game_day', 'The locked G-68 call sheet never reaches the G-60 console: no code builds a ConsoleConfig from gameplan.Sheet, and no host stores GameplanState in the save. The playtest calls games from its own content-built sheet.', `${OWNERS.gameplan} + ${OWNERS.console}; composition via ${OWNERS.exportsIntegrator}`);
  return `${boxes.length} boxes, ${entries} entries, ${refused} refusals, export ${exp.ok ? 'ok' : 'refused'}`;
}
