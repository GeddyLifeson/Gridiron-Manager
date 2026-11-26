// The play caller (K4): one object per caller per game, for offense or defense. It reads its own
// sheet, its own scouting, the public situation, what its booth saw, and the K5 constraint. It has no
// input through which the opponent's pending call, plan or sheet could arrive (K4.3.6 rule 2, K9.1.1);
// on defense the only fact about the offense is the personnel grouping that ran on (K4.4.1).
import { clamp } from '../profile/draws.ts';
import type { CoachProfile, TendencyBlock } from '../profile/types.ts';
import { beliefShares, evidence, mislabelChance, opponentCallerChanged, startBelief, updateBelief, type Belief } from './belief.ts';
import { baseBox, boxById, candidatesFor, ruleMatches } from './bucket.ts';
import { payoffRow, storedMix } from './matrix.ts';
import { drawIndex, floorPossible, leanDefense, leanOffense, normalise, readinessCheck, selfScoutPenalty, sequenceBoost, temperature, tilt } from './mix.ts';
import { param } from './params.ts';
import { callTime, chooseTempo } from './timing.ts';
import type { CallingSheet, CallMath, CallSituation, Contingency, DrawSource, ManagementConstraint, Observation, ScoutRow, SheetBox, SheetCall, Tempo } from './types.ts';

export interface CallerSetup {
  /** The person who calls this side (K2.6.1 decision-owner map). */
  readonly profile: CoachProfile;
  /** The head coach's tendencies: `leadProtection`, `deficitUrgency`, `lateDefenseRisk` apply to whoever calls (K2.6.1 rule 3). */
  readonly headCoach: Pick<TendencyBlock, 'leadProtection' | 'deficitUrgency' | 'lateDefenseRisk'>;
  /** The booth coach's `evaluation` z (K4.2.2 rule 3). */
  readonly zBoothEvaluation: number;
  /** A sheet locked by `lockSheet` (K3.4.2). */
  readonly sheet: CallingSheet;
  /** K3.1.1 scouting rows for this opponent. */
  readonly scout: readonly ScoutRow[];
  /** The opposing caller's person id, to read `memory.opponentNotes` (K2.1.5); null when unknown. */
  readonly opponentCallerId: string | null;
  /** League look shares for a caller with no film (K4.2.1 edge case). */
  readonly leagueShares?: readonly number[];
  /** The caller's own charted calls in the scouting window, per bucket and look class (N2.3.1): what an opponent sees. */
  readonly ownWindow: Readonly<Record<string, Readonly<Record<string, number>>>>;
  /** Wanted shares from the user's plan when a delegated coordinator calls for him (K4.3.7 AI use, K6.1.1). */
  readonly wanted?: { readonly offenseRates?: CoachProfile['system']['offenseRates']; readonly defenseRates?: CoachProfile['system']['defenseRates'] };
  readonly math: CallMath;
}

export interface CallRequest {
  readonly situation: CallSituation;
  readonly constraint?: ManagementConstraint;
  /** K4.1.1 rule 3: personnel healthy and active, formation legal on this hash, play installed. */
  readonly available: (call: SheetCall) => boolean;
  /** K4.3.5: unit readiness for the call as this coach estimates it, 0 to 1. */
  readonly readiness: (call: SheetCall) => number;
  /** Offense: the defense is in a grouping his matrix likes (K4.5.2). */
  readonly defenseFavourable?: boolean;
  /** Offense: a substitution is in progress (J5.1.2). */
  readonly substitutionInProgress?: boolean;
  /** Defense: the offense is going without a huddle, so only the tempo menu can be sent (K4.4.1 rule 5). */
  readonly facingTempo?: boolean;
  readonly draws: DrawSource;
}

/** K4.3.6 call record (I2.7.1 format fields owned here). Truth data: an opponent's record is never shown. */
export interface CallRecord {
  readonly bucketId: string;
  readonly sourceBoxId: string;
  readonly path: 'mix' | 'script' | 'queued';
  readonly candidates: readonly string[];
  readonly belief: readonly number[];
  readonly evidence: number;
  readonly tau: number;
  readonly sigma: readonly number[];
  readonly mix1: readonly number[];
  readonly leaned: readonly number[];
  readonly mix2: readonly number[];
  readonly mix3: readonly number[];
  readonly mix4: readonly number[];
  /** The uniform that selected the call; null on the script and queued paths. */
  readonly draw: number | null;
  /** The caller's own expected value of the call against his belief. */
  readonly expected: number;
  readonly callId: string;
  readonly tempo: Tempo;
  readonly callTimeS: number;
}

export interface CallResult {
  readonly call: SheetCall;
  readonly tempo: Tempo;
  /** Seconds after the previous play ends at which the call is made (K4.1.2). Reader: J5.8.1. */
  readonly callTimeS: number;
  /** Defense: show a different shell before the snap (K4.4.1 rule 4, carried out in J5.5.1). */
  readonly disguise: boolean;
  readonly record: CallRecord;
}

export interface AppliedChange { readonly contingency: Contingency; readonly errorFactor: number; readonly identifiedTrueProblem: boolean }

export interface Caller {
  /** The call for this snap, or null when nothing on the sheet can be sent (the default applies, J11.6.1). */
  call(req: CallRequest): CallResult | null;
  /** What his booth saw on the last play (K4.2.2). Plays his staff did not observe are never passed. */
  observe(obs: Observation, draws: DrawSource): void;
  /** K4.5.3: `capacity` is how many changes the players can carry (I8.1.4). */
  adjust(kind: 'series' | 'halftime', capacity: number, draws: DrawSource): AppliedChange[];
  /** K4.2.2 edge case. */
  opponentCallerChanged(): void;
  /** For K9 audits and tests. */
  beliefIn(bucketId: string): number[];
}

interface PackageState { baseCalls: number; activeSnaps: number }

export function createCaller(setup: CallerSetup): Caller {
  const { sheet, profile, math } = setup;
  const z = profile.behavior;
  const offense = sheet.side === 'offense';
  const notes = setup.opponentCallerId ? profile.memory.opponentNotes[setup.opponentCallerId] ?? [] : [];
  const belief: Belief = startBelief(sheet.looks, sheet.boxes.map((b) => b.bucketId), setup.scout, notes, z.adjustment, setup.leagueShares);
  const overrides = new Map<string, readonly string[]>();
  const solved = new Map<string, number[]>();
  const lastEpa = new Map<string, number>();
  const ownCalls = new Map<string, Record<string, number>>();
  const lost = new Map<string, number>();
  const packages: PackageState[] = sheet.sequences.map(() => ({ baseCalls: 0, activeSnaps: 0 }));
  const usedContingencies = new Set<string>();
  const late: Observation[] = [];
  let script = [...sheet.script];
  let last: { call: SheetCall; record: CallRecord; gainYd: number | null } | null = null;
  let expectedBoxes = new Set<string>();

  const sigmaFor = (box: SheetBox, calls: readonly SheetCall[], changed: boolean): number[] => {
    if (!changed && box.storedMix) return calls.map((c) => box.storedMix![c.callId] ?? 0);
    const ids = calls.map((c) => c.callId);
    const key = `${box.bucketId}|${ids.join(',')}`;
    let s = solved.get(key);
    if (!s) { s = storedMix(sheet, ids, (id) => payoffRow(sheet, box, id)); solved.set(key, s); }
    return s;
  };

  const ownCountsIn = (bucketId: string): Record<string, number> => {
    const out: Record<string, number> = { ...(setup.ownWindow[bucketId] ?? {}) };
    const today = ownCalls.get(bucketId);
    if (today) for (const k of Object.keys(today)) out[k] = (out[k] ?? 0) + today[k]!;
    return out;
  };

  const firstBoxFor = (s: CallSituation): string | undefined =>
    (sheet.boxes.find((b) => ruleMatches(b.rule, s, undefined)) ?? baseBox(sheet, s.down))?.bucketId;

  /** The boxes he reads ahead of time: the next down after an ordinary gain, and a fresh first down. */
  const lookAhead = (s: CallSituation): Set<string> => {
    const out = new Set<string>();
    for (const gain of [0, 3, 6]) {
      const id = firstBoxFor({ ...s, down: s.down + 1, distanceYd: Math.max(1, s.distanceYd - gain), yardsToGoal: Math.max(1, s.yardsToGoal - gain) });
      if (id) out.add(id);
    }
    const first = firstBoxFor({ ...s, down: 1, distanceYd: 10 });
    if (first) out.add(first);
    return out;
  };

  const applyObservation = (obs: Observation, draws: DrawSource): void => {
    const neighbours = sheet.boxes.filter((b) => b.rule.downs?.includes(obs.down)).map((b) => b.bucketId);
    const probe = last !== null && last.record.path === 'script' && obs.ownCallId === last.call.callId;
    const logged = updateBelief(belief, { bucketId: obs.bucketId, look: obs.look, neighbours, hurt: obs.hurt, scriptedProbe: probe, mislabel: mislabelChance(setup.zBoothEvaluation) }, draws('booth'));
    // K4.3.4 rule 1: the trigger is what the booth logged, right or wrong (edge case).
    sheet.sequences.forEach((p, i) => {
      if (obs.ownCallId !== p.baseId) return;
      const st = packages[i]!;
      st.baseCalls++;
      if (st.baseCalls >= param('sequence.baseCallsNeeded') && logged === p.trigger) st.activeSnaps = param('sequence.lastsSnaps');
    });
  };

  return {
    call(req) {
      const s = req.situation;
      const con = req.constraint;
      const tempo: Tempo = offense
        ? chooseTempo({
          noHuddleShare: profile.system.tempoBase.noHuddleShare, lastGainYd: last?.gainYd ?? null, defenseFavourable: req.defenseFavourable === true,
          keepClockRunning: con?.keepClockRunning === true, saveClock: con?.saveClock === true, substitutionInProgress: req.substitutionInProgress === true,
        }, req.draws('tempo'))
        : 'huddle';
      const tempoOnly = offense ? tempo !== 'huddle' : req.facingTempo === true;
      const list = candidatesFor({ sheet, situation: s, ...(con ? { constraint: con } : {}), available: req.available, tempoOnly, overrides });
      const calls = [...list.calls];
      if (calls.length === 0) return null;
      const b = beliefShares(belief, list.bucketId);
      const rows = calls.map((c) => payoffRow(sheet, list.box, c.callId));
      const valueOf = (i: number): number => rows[i]!.reduce((a, x, j) => a + x * b[j]!, 0);
      const n = evidence(belief, list.bucketId);
      let path: CallRecord['path'] = 'mix';
      let chosen = -1;
      let draw: number | null = null;
      let rec = { tau: 0, sigma: [] as number[], mix1: [] as number[], leaned: [] as number[], mix2: [] as number[], mix3: [] as number[], mix4: [] as number[] };

      // K4.5.1 the opening script: used while a scripted call's band matches; skipped in clock boxes
      // (held), dropped from the head when the situation is one the script does not cover.
      const uScript = req.draws('script').uniform();
      if (offense && script.length > 0 && tempo === 'huddle' && !list.box.clock && !con?.id) {
        if (!list.box.scriptable) script = script.slice(1);
        else if (uScript >= param('script.departShare')) {
          const k = script.findIndex((e) => e.downs.includes(s.down) && s.distanceYd >= e.minDistanceYd && s.distanceYd <= e.maxDistanceYd);
          const entry = k >= 0 ? script[k]! : undefined;
          const at = entry ? calls.findIndex((c) => c.callId === entry.callId) : -1;
          const scripted = entry ? sheet.calls[entry.callId] : undefined;
          if (entry && scripted && (at >= 0 || (req.available(scripted) && (con?.allows ? con.allows(scripted) : true)))) {
            script = script.filter((_, i) => i !== k);
            path = 'script';
            if (at >= 0) chosen = at;
            else { calls.push(scripted); rows.push(payoffRow(sheet, list.box, scripted.callId)); chosen = calls.length - 1; }
          }
        }
      }
      // K4.3.4 rule 3: a queued second call.
      if (path === 'mix' && last && last.gainYd !== null) {
        const f = sheet.follows.find((x) => x.afterCallId === last!.call.callId && last!.gainYd! >= x.minGainYd);
        const at = f ? calls.findIndex((c) => c.callId === f.thenCallId) : -1;
        if (at >= 0) { path = 'queued'; chosen = at; }
      }
      if (path === 'mix') {
        const sigma = sigmaFor(list.box, calls, list.changed);
        const scale = list.box.clock ? param('tilt.clockBoxScale') : 1;
        const t = tilt({ sigma, payoff: rows.map((r) => r.map((x) => x / scale)), belief: b, zCallFit: z.callFit, evidence: n, n0: belief.n0, lastEpa: calls.map((c) => lastEpa.get(c.callId) ?? 0) }, math);
        const leaned = offense
          ? leanOffense(t.mix, calls, setup.wanted?.offenseRates ?? profile.system.offenseRates, profile.system.personnelWeights, s, setup.headCoach, math)
          : sheet.side === 'defense' ? leanDefense(t.mix, calls, setup.wanted?.defenseRates ?? profile.system.defenseRates, s, setup.headCoach, math) : normalise(t.mix);
        const mix2 = selfScoutPenalty(leaned, calls, ownCountsIn(list.bucketId), z.selfScout, math);
        const boosted = new Set<string>();
        sheet.sequences.forEach((p, i) => {
          if (packages[i]!.activeSnaps <= 0) return;
          const ids = [p.complementId, p.constraintId].filter((id): id is string => id !== null && calls.some((c) => c.callId === id));
          if (ids.length === 0) return; // not a matching bucket: the window does not run down here
          packages[i]!.activeSnaps--;
          ids.forEach((id) => boosted.add(id));
        });
        const mix3 = sequenceBoost(mix2, calls, boosted);
        const mix4 = floorPossible(readinessCheck(mix3, calls.map((c) => req.readiness(c)), math));
        draw = req.draws('call').uniform();
        chosen = drawIndex(mix4, draw);
        rec = { tau: t.tau, sigma, mix1: t.mix, leaned, mix2, mix3, mix4 };
      }
      const call = calls[chosen]!;
      const surprised = expectedBoxes.size > 0 && !expectedBoxes.has(list.bucketId);
      const callTimeS = callTime({ path, tempo, candidates: calls.length, personnelChange: last !== null && call.personnel !== last.call.personnel, surprised, zCallFit: z.callFit }, req.draws('timing'));
      const disguise = req.draws('disguise').uniform() < (sheet.side === 'defense' ? clamp(profile.system.defenseRates.disguise, 0, 1) : 0);
      const record: CallRecord = {
        bucketId: list.bucketId, sourceBoxId: list.box.bucketId, path, candidates: calls.map((c) => c.callId), belief: b, evidence: n, ...rec,
        draw, expected: valueOf(chosen), callId: call.callId, tempo, callTimeS,
      };
      const mine = ownCalls.get(list.bucketId) ?? {};
      mine[call.lookClass] = (mine[call.lookClass] ?? 0) + 1;
      ownCalls.set(list.bucketId, mine);
      last = { call, record, gainYd: null };
      expectedBoxes = lookAhead(s);
      // K4.2.2 rule 5: a report that arrived late lands now, one play after it was due.
      for (const o of late.splice(0)) applyObservation(o, req.draws);
      return { call, tempo, callTimeS, disguise, record };
    },

    observe(obs, draws) {
      if (obs.ownCallId !== null) {
        lastEpa.set(obs.ownCallId, obs.epa);
        if (last && last.call.callId === obs.ownCallId) {
          last.gainYd = obs.gainYd;
          lost.set(last.record.bucketId, (lost.get(last.record.bucketId) ?? 0) + (last.record.expected - obs.epa));
        }
      }
      if (obs.late) late.push(obs);
      else applyObservation(obs, draws);
    },

    adjust(kind, capacity, draws) {
      const d = draws('adjust');
      const u1 = d.uniform(), u2 = d.uniform();
      const ranked = [...lost.entries()].filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1));
      if (ranked.length === 0) return [];
      const zMean = (z.adjustment + setup.zBoothEvaluation) / 2;
      const span = param('adjust.findSpanZ');
      const find = param('adjust.findMin') + (param('adjust.findMax') - param('adjust.findMin')) * clamp((zMean + span) / (2 * span), 0, 1);
      const others = sheet.boxes.map((b) => b.bucketId).filter((id) => id !== ranked[0]![0]);
      const right = u1 < find || others.length === 0;
      const target = right ? ranked[0]![0] : others[Math.min(others.length - 1, Math.floor(u2 * others.length))]!;
      const zShare = clamp((z.adjustment + span) / (2 * span), 0, 1);
      const want = kind === 'series' ? param('adjust.seriesChanges')
        : param('adjust.halftimeMin') + Math.round((param('adjust.halftimeMax') - param('adjust.halftimeMin')) * zShare);
      const m = Math.max(0, Math.min(want, Math.floor(capacity)));
      const applied: AppliedChange[] = [];
      for (const c of sheet.contingencies) {
        if (applied.length >= m) break;
        if (c.bucketId !== target || usedContingencies.has(c.id)) continue;
        const box = boxById(sheet, c.bucketId);
        if (!box) continue;
        const now = overrides.get(c.bucketId) ?? box.callIds;
        const next = [...now.filter((id) => !c.removeCallIds.includes(id)), ...c.addCallIds.filter((id) => sheet.calls[id] && !now.includes(id))];
        if (next.length === 0) continue;
        overrides.set(c.bucketId, next);
        usedContingencies.add(c.id);
        applied.push({ contingency: c, errorFactor: c.inPlan ? 1 : param('adjust.offPlanErrorFactor'), identifiedTrueProblem: right });
      }
      if (applied.length > 0) lost.delete(target);
      return applied;
    },

    opponentCallerChanged() { opponentCallerChanged(belief); },
    beliefIn(bucketId) { return beliefShares(belief, bucketId); },
  };
}

/** Exposed for the explain view (N5) and tests: the sharpness of a caller's best response. */
export { temperature };
