// A full game from one seat (O7.4.1 acceptance). The engine's plays run at real pace; the seat's entries are
// graded as they come, and a seat that does nothing still sees the game go on (its tasks are recorded as missed).
// A caller's seat is not run here: it is the G-60 calling console, with the S5.4.1 interventions laid over it.
// Seats left to standing rules (O7.6.3) are run by the AI fallback and marked simulated in the record.
import type { Draw } from '../gameday/math.ts';
import { aiBoothAnswer, gradeBooth, gradeFlag, gradeRelay, type BoothAnswer, type Look, type LookTruth } from './booth.ts';
import { post, type ChannelMessage } from './channels.ts';
import { resolveAdvice, type Advice, type DecisionMoment } from './advice.ts';
import type { RoleRecord } from './record.ts';
import type { GamedayRole } from './sheet.ts';

/** What the engine's truth record holds for one snap, as far as the seats need it. */
export interface SnapTruth extends LookTruth {
  readonly personnel: string;
  readonly situation: string;
  /** The report's predicted rate of the flagged event in this situation, and whether it happened this snap. */
  readonly flagEvent?: { readonly key: string; readonly reportRate: number; readonly happened: boolean };
  /** When the next play call goes in (personnel relay deadline). */
  readonly callInS: number;
  readonly tempo: boolean;
}

export interface SeatEntries {
  readonly looks: ReadonlyMap<number, BoothAnswer>;
  readonly relays: ReadonlyMap<number, { personnel: string; atS: number }>;
  readonly flags: readonly { key: string; afterPlay: number }[];
  readonly advice: ReadonlyMap<number, Advice>;
}

export const NO_ENTRIES: SeatEntries = { looks: new Map(), relays: new Map(), flags: [], advice: new Map() };

export interface SeatGameInput {
  readonly gameId: number;
  readonly role: GamedayRole;
  readonly snaps: readonly SnapTruth[];
  readonly moments: readonly (DecisionMoment & { modelChoice: string })[];
  readonly entries: SeatEntries;
  /** Standing rules (O7.6.3): the seat is worked by the AI fallback at this recognition, marked simulated. */
  readonly standingRules: { readonly recognition: number } | null;
  readonly pad: readonly Look[];
  readonly headCoach: { readonly analyticsTrust: number; readonly userTrust: number };
}

export interface SeatGameResult {
  readonly records: readonly RoleRecord[];
  readonly messages: readonly ChannelMessage[];
  readonly snapsPlayed: number;
  readonly runsConsole: boolean;
}

const fam = (l: string | null): string | null => (l === null ? null : l.split('/')[0] ?? l);

export function runSeatGame(inp: SeatGameInput, draw: Draw): SeatGameResult {
  const { role, gameId } = inp;
  const runsConsole = role.role === 'caller_offense' || role.role === 'caller_defense' || role.role === 'special_teams_coordinator' || role.role === 'head_coach';
  const records: RoleRecord[] = [];
  const messages: ChannelMessage[] = [];
  const simulated = inp.standingRules !== null;
  const base = { role: role.role, seatId: role.seatId, gameId, workedOut: null, error: null, simulated } as const;
  let msgId = 0;
  if (runsConsole) return { records, messages, snapsPlayed: inp.snaps.length, runsConsole };
  const booth = role.role === 'booth_coverage' || role.role === 'booth_front';
  const seen: Record<string, { n: number; obs: number; rate: number }> = {};
  for (const s of inp.snaps) {
    if (booth) {
      const a = inp.standingRules ? aiBoothAnswer(s, inp.standingRules.recognition, inp.pad, s.tempo, draw) : inp.entries.looks.get(s.playId) ?? { playId: s.playId, phase: 'post' as const, look: null, atS: null };
      const g = gradeBooth(s, a, s.tempo);
      records.push({ ...base, kind: 'booth', playId: s.playId, view: role.location === 'booth' ? 'booth' : 'sideline', timeAvailableS: g.windowS, entry: g.answer, truth: g.truth, grade: g.credit, seconds: g.seconds, family: fam(g.truth) });
      if (g.delivered && g.answer !== null) messages.push(post(role, msgId++, a.atS ?? s.snapS, 0, 'report', { playId: s.playId, look: g.answer }));
    }
    if (role.role === 'booth_offense' || role.role === 'charter') {
      const r = inp.entries.relays.get(s.playId) ?? null;
      const arrives = r ? r.atS + role.reportDelayS : null;
      const g = gradeRelay(s.personnel, r?.personnel ?? null, arrives, s.callInS);
      records.push({ ...base, kind: 'relay', playId: s.playId, view: 'booth', timeAvailableS: s.callInS - s.snapS, entry: r?.personnel ?? null, truth: s.personnel, grade: g.score, seconds: r ? r.atS - s.snapS : null, family: 'personnel', error: g.inTime || !r ? null : 'late' });
      if (r) messages.push(post(role, msgId++, r.atS, 0, 'report', { playId: s.playId, personnel: r.personnel }));
    }
    if (s.flagEvent) {
      const k = `${s.situation}|${s.flagEvent.key}`;
      const v = (seen[k] ??= { n: 0, obs: 0, rate: s.flagEvent.reportRate });
      v.n++;
      if (s.flagEvent.happened) v.obs++;
    }
    for (const f of inp.entries.flags.filter((x) => x.afterPlay === s.playId)) {
      const key = Object.keys(seen).find((k) => k.endsWith(`|${f.key}`)) ?? null;
      const v = key ? seen[key]! : { n: 0, obs: 0, rate: 0 };
      const verdict = gradeFlag(v.n, v.obs, v.rate);
      records.push({ ...base, kind: 'flag', playId: s.playId, view: 'booth', timeAvailableS: null, entry: f.key, truth: verdict, grade: verdict === 'real' ? 1 : 0, seconds: null, family: null });
      messages.push(post(role, msgId++, s.snapS, 0, 'flag', { key: f.key, verdict }));
    }
  }
  if (role.role === 'game_management') {
    for (const m of inp.moments) {
      const a = inp.entries.advice.get(m.id) ?? null;
      const o = resolveAdvice(m, a, m.modelChoice, inp.headCoach, draw);
      records.push({ ...base, kind: 'advice', playId: null, view: 'booth', timeAvailableS: null, entry: a?.choice ?? null, truth: m.modelChoice, grade: o.matchedModel ? 1 : 0, seconds: a?.confirmedAtS != null ? a.confirmedAtS - m.openedAtS : null, family: m.kind });
      if (o.delivered && a) messages.push(post(role, msgId++, a.confirmedAtS!, 0, 'advice', { momentId: m.id, choice: a.choice, reason: a.reason }));
    }
  }
  return { records, messages, snapsPlayed: inp.snaps.length, runsConsole };
}
