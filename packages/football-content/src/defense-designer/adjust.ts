// The defense's installed answers (G2.5) and disguise (G2.6): motion and shift rules, tempo calls, and the
// cost of showing one shell and playing another.
import { readLook, sgn } from './geometry.ts';
import type { FieldGeometry } from './keys.ts';
import { param } from './params.ts';
import { resolve, type Defender, type Resolution } from './resolve.ts';
import { afterMotion } from './looks.ts';
import type { BoardSituation, CallSlot, DefensiveCall, MotionAnswer, OffLook } from './types.ts';

const ANSWER_S = (a: MotionAnswer, pathS: number): number => {
  switch (a) {
    case 'lock': case 'track': return pathS;
    case 'switch': return param('motion.switchS');
    case 'spin': return param('motion.spinS');
    case 'bump': return param('motion.bumpS');
    case 'hold': return 0;
  }
};
const SHOWS: Record<MotionAnswer, string> = { lock: 'man coverage, clearly', switch: 'less than lock', track: 'man, on that player', spin: 'a rotation that may be disguised', bump: 'zone or match', hold: 'little' };

export interface MotionOutcome {
  readonly answer: MotionAnswer;
  readonly needS: number;
  readonly availableS: number;
  /** Seconds late at the snap (0 when on time). */
  readonly lateByS: number;
  readonly showsOffense: string;
  /** Man assignments after the answer: receiver role to defender slots. */
  readonly manAfter: Readonly<Record<string, readonly string[]>>;
  /** Receivers no one has after the answer (a failed switch link). */
  readonly uncovered: readonly string[];
  readonly after: Resolution;
}

/**
 * G2.5.2: the call's motion answer against a look with motion. `commFails` forces the switch or bump
 * communication link to fail (acceptance 3). Lock follows the player; bump keeps defenders on receiver
 * NUMBERS, so the renumbered look reassigns them by one; switch exchanges the two man defenders.
 */
export function motionOutcome(call: DefensiveCall, look: OffLook, sit: BoardSituation, f: FieldGeometry, commFails = false): MotionOutcome {
  if (look.motion === null) throw new Error('defense-designer: look has no motion');
  const m = look.motion;
  const answer: MotionAnswer = (m.kind === 'jet' ? call.coverage.motion.jet : m.kind === 'teTrade' ? call.coverage.motion.teTrade : undefined) ?? call.coverage.motion.normal;
  const before = resolve(call, { ...look, motion: null }, sit, f);
  const set = afterMotion(look);
  const renumbered = resolve(call, { ...set, motion: null }, sit, f);
  const mover = before.reading.eligible.find((p) => p.role === m.role)!;
  const manOf = (r: Resolution): Map<string, string[]> => {
    const out = new Map<string, string[]>();
    for (const d of r.defenders) if (d.job.kind === 'man' && d.job.target !== null) out.set(d.job.target, [...(out.get(d.job.target) ?? []), d.slot.id]);
    return out;
  };
  let defenders: Defender[] = [...renumbered.defenders];
  const beforeMan = manOf(before);
  const chaser = (beforeMan.get(m.role) ?? [])[0];
  if (answer === 'lock' || answer === 'track') {
    // Lock: everyone keeps his player; the chaser follows the mover across.
    defenders = renumbered.defenders.map((d) => {
      const b = before.defenders.find((x) => x.slot.id === d.slot.id)!;
      if (b.job.kind !== 'man') return d;
      const tgt = b.job.target;
      const p = set.players.find((x) => x.role === tgt);
      return { ...d, job: b.job, py: p ? p.py + sit.ballYd : d.py };
    });
  } else if (answer === 'switch') {
    // Two man defenders on the side the motion goes to exchange: the chaser takes the receiver he passes.
    const dest = renumbered.reading.eligible.find((p) => p.role === m.role)!;
    const passed = before.reading.eligible.filter((p) => p.role !== m.role && (p.py - mover.py) * (dest.py - mover.py) > 0 && Math.abs(p.py - mover.py) < Math.abs(dest.py - mover.py)).sort((a, b) => Math.abs(a.py - mover.py) - Math.abs(b.py - mover.py))[0];
    const other = passed ? (beforeMan.get(passed.role) ?? [])[0] : undefined;
    defenders = renumbered.defenders.map((d) => {
      const b = before.defenders.find((x) => x.slot.id === d.slot.id)!;
      if (b.job.kind !== 'man') return d;
      if (commFails && (d.slot.id === chaser || d.slot.id === other)) return { ...d, job: { ...b.job, target: passed?.role ?? b.job.target } };
      if (d.slot.id === chaser && passed) return { ...d, job: { ...b.job, target: passed.role } };
      if (d.slot.id === other) return { ...d, job: { ...b.job, target: m.role } };
      return { ...d, job: b.job };
    });
  } else if (answer === 'hold' || answer === 'spin') {
    // Hold: zone defenders stay; man defenders keep their numbers (as bump). Spin moves safeties, not man jobs.
  }
  if (answer === 'bump' && commFails) {
    defenders = defenders.map((d) => {
      const b = before.defenders.find((x) => x.slot.id === d.slot.id)!;
      return d.slot.id === chaser && b.job.kind === 'man' ? { ...d, job: b.job } : d;
    });
  }
  const after: Resolution = { ...renumbered, defenders };
  const manAfter = manOf(after);
  const uncovered = commFails || answer === 'switch' ? after.reading.eligible.filter((p) => (beforeMan.size > 0 && !manAfter.has(p.role) && beforeMan.has(p.role)) || (p.role === m.role && beforeMan.size > 0 && !manAfter.has(p.role))).map((p) => p.role) : [];
  const chaseDef = before.defenders.find((d) => d.slot.id === chaser);
  const pathS = chaseDef ? Math.abs(m.toPy + sit.ballYd - chaseDef.py) / param('speed.defaultYdS') : 0;
  const needS = ANSWER_S(answer, pathS);
  return { answer, needS, availableS: m.timeS, lateByS: Math.max(0, needS - m.timeS), showsOffense: SHOWS[answer], manAfter: Object.fromEntries(manAfter), uncovered: [...new Set(uncovered)].sort(), after };
}

export interface TempoInput {
  /** Seconds from the end of the previous play to the offense's snap. */
  readonly snapAfterS: number;
  readonly channel: 'band' | 'signal' | 'radio';
  /** Spoken length of the call for the radio channel (G4.3.1), seconds. */
  readonly radioS?: number;
  readonly checkWithMe: boolean;
  /** With check-with-me: seconds the offense waits after setting before it snaps. */
  readonly offenseWaitAfterSetS?: number;
  readonly defaultTempoCall: string | null;
  readonly lastCall: string;
  readonly intendedCall: string;
}
export interface TempoOutcome { readonly runs: 'called' | 'default' | 'repeat'; readonly call: string; readonly knowledgePenaltyZ: number; readonly needS: number }

/** G2.5.3 timing test for one snap: t_need = caller decision + relay + alignment (+ check-with-me). */
export function tempoOutcome(i: TempoInput): TempoOutcome {
  const relay = i.channel === 'band' ? param('tempo.relayBandS') : i.channel === 'signal' ? param('tempo.relaySignalS') : (i.radioS ?? 0);
  const fallback = (needS: number): TempoOutcome => (i.defaultTempoCall !== null
    ? { runs: 'default', call: i.defaultTempoCall, knowledgePenaltyZ: 0, needS }
    : { runs: 'repeat', call: i.lastCall, knowledgePenaltyZ: param('tempo.repeatPenaltyZ'), needS });
  if (i.checkWithMe) {
    // The call is sent once the offense sets: the check, the relay and the alignment must fit in its wait.
    const need = param('tempo.checkWithMeS') + relay;
    const wait = i.offenseWaitAfterSetS ?? 0;
    return wait >= need ? { runs: 'called', call: i.intendedCall, knowledgePenaltyZ: 0, needS: need } : fallback(need);
  }
  const need = param('tempo.callerDecisionS') + relay + param('tempo.alignS');
  return i.snapAfterS >= need ? { runs: 'called', call: i.intendedCall, knowledgePenaltyZ: 0, needS: need } : fallback(need);
}

export interface DisguiseRow { readonly slot: string; readonly travelYd: number; readonly needS: number; readonly allowedS: number; readonly reachable: boolean }

/** G2.6.1: each defender's travel from his shown spot to his true spot, against the time the move moment allows. */
export function disguiseReport(call: DefensiveCall, look: OffLook, sit: BoardSituation, f: FieldGeometry): DisguiseRow[] {
  if (call.disguise === null) return [];
  const dz = call.disguise;
  const truth = resolve(call, look, sit, f);
  const shownCall: DefensiveCall = { ...call, slots: call.slots.map((s): CallSlot => (dz.positions[s.id] ? { ...s, align: dz.positions[s.id]! } : s)) };
  const shown = resolve(shownCall, look, sit, f);
  const pre = dz.moment === 'early' ? param('disguise.earlyS') : dz.moment === 'late' ? param('disguise.lateCadenceS') : 0;
  const allowed = pre + param('disguise.routeThreatS');
  const out: DisguiseRow[] = [];
  for (const id of Object.keys(dz.positions).sort()) {
    const a = shown.defenders.find((d) => d.slot.id === id);
    const b = truth.defenders.find((d) => d.slot.id === id);
    if (!a || !b) continue;
    const dy = b.py - a.py;
    const dd = b.px - a.px;
    const travel = Math.sqrt(dy * dy + dd * dd);
    const need = travel / param('speed.backpedalYdS');
    out.push({ slot: id, travelYd: travel, needS: need, allowedS: allowed, reachable: need <= allowed });
  }
  return out;
}

/** Players' declared strength after a shift: a shift re-runs the declaration and the check pass (G2.5.2). */
export function shiftRedeclares(call: DefensiveCall, before: OffLook, after: OffLook, sit: BoardSituation, f: FieldGeometry): { strongBefore: string; strongAfter: string; checkAfter: string | null } {
  const a = resolve(call, before, sit, f);
  const b = resolve(call, after, sit, f);
  void readLook; void sgn;
  return { strongBefore: a.declared.strong, strongAfter: b.declared.strong, checkAfter: b.checkApplied?.id ?? null };
}
