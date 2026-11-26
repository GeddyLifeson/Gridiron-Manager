// The enforcement procedure (B8.5.1 steps 1 to 8): from the called fouls of one down to every legal
// choice with its resulting outcome. Multiple and double fouls: B8.5.5. Dead-ball fouls: B8.5.6.
// Accept or decline: B8.5.8.
import {
  otherSide,
  type EnforcementOption, type EnforcementSummary, type FoulRecord, type PlayOutcome, type PlayTruth,
  type RulingContext, type Side,
} from '@gm/schema';
import { isSeparate } from './catalogue.ts';
import { deadPlans, livePlans, walk, type Plan, type World } from './enforce.ts';
import { factsFromOutcome, factsFromTruth, toFieldX, toTeamA, type EnforcementFacts } from './facts.ts';
import { K } from './params.ts';

/** B8.4.2 rules 2, 3 and 5: who is removed, whether the penalty is accepted, declined or offset. */
export function disqualifiedPlayers(fouls: readonly FoulRecord[]): number[] {
  const out: number[] = [];
  for (const r of fouls) {
    if (!r.called || r.playerId === null) continue;
    const dq = r.dq === 'automatic' || (r.dq === 'if_flagrant' && r.flagrant);
    if (dq && !out.includes(r.playerId)) out.push(r.playerId);
  }
  return out;
}

function summary(w: World, plan: Plan | null, calledIdx: readonly number[], runoff: boolean): EnforcementSummary {
  const enforced = plan === null ? [] : [...plan.enforced];
  return {
    enforced,
    declined: calledIdx.filter((i) => !enforced.includes(i)),
    offsetting: plan !== null && plan.offsetting,
    yardsWalked: plan === null || plan.from === null ? 0 : plan.to - plan.from,
    fromSpot: plan === null || plan.from === null ? null : { x: toFieldX(w.ctx, plan.from), y: w.outcome.spotY },
    halfDistanceApplied: plan !== null && plan.half,
    automaticFirstDown: plan !== null && plan.afd,
    lossOfDown: plan !== null && plan.lod,
    replayDown: plan !== null && plan.replayDown,
    carriedTo: plan === null ? null : plan.carriedTo,
    runoffTaken: runoff,
    disqualified: disqualifiedPlayers(w.fouls),
  };
}

/** The play outcome after `plan` is applied to the outcome in `w`. */
function apply(w: World, plan: Plan, calledIdx: readonly number[], runoff: boolean): PlayOutcome {
  const o = w.outcome;
  const f = w.facts;
  const enforcement = summary(w, plan, calledIdx, runoff);
  if (plan.safetyFor !== null) {
    const onTry = w.ctx.situation.playKind === 'try';
    return { ...o, noPlay: false, possessionAfter: plan.safetyFor, changeOfPossession: plan.safetyFor !== o.snappingSide,
      spotX: toFieldX(w.ctx, plan.to), touchback: false,
      score: { type: onTry ? 'try_safety' : 'safety', side: plan.safetyFor, points: w.rules.num(onTry ? K.trySafetyPoints : K.safetyPoints), scorerId: null },
      enforcement };
  }
  const spotX = toFieldX(w.ctx, plan.to);
  const changeOfPossession = plan.possession !== o.snappingSide;
  if (plan.keepResult) return { ...o, spotX, possessionAfter: plan.possession, changeOfPossession, enforcement };
  return {
    ...o,
    resultType: plan.noPlay ? 'no_play' : o.resultType,
    noPlay: plan.noPlay,
    possessionAfter: plan.possession, changeOfPossession, spotX,
    score: null, touchback: false, endedOutOfBounds: false, incomplete: false, runnerDownInBounds: false,
    yardsGained: plan.noPlay ? 0 : plan.possession === f.teamA ? plan.gain : o.yardsGained,
    enforcement,
  };
}

function merge(first: EnforcementSummary, second: EnforcementSummary): EnforcementSummary {
  const enforced = [...first.enforced, ...second.enforced];
  return {
    enforced,
    declined: second.declined.filter((i) => !enforced.includes(i)),
    offsetting: first.offsetting || second.offsetting,
    yardsWalked: first.yardsWalked + second.yardsWalked,
    fromSpot: first.fromSpot ?? second.fromSpot,
    halfDistanceApplied: first.halfDistanceApplied || second.halfDistanceApplied,
    automaticFirstDown: first.automaticFirstDown || second.automaticFirstDown,
    lossOfDown: first.lossOfDown || second.lossOfDown,
    replayDown: first.replayDown || second.replayDown,
    carriedTo: second.carriedTo ?? first.carriedTo,
    runoffTaken: first.runoffTaken || second.runoffTaken,
    disqualified: second.disqualified,
  };
}

/** The same down seen after `outcome`: where the ball now is and who has it. */
function after(w: World, outcome: PlayOutcome): World {
  const succeeding = toTeamA(w.ctx, outcome.spotX);
  const base = factsFromOutcome(outcome, w.ctx);
  const facts: EnforcementFacts = { ...w.facts, succeeding, deadBall: succeeding, nextSide: base.nextSide, turnoverOnDowns: base.turnoverOnDowns };
  return { ...w, outcome, facts };
}

interface Choice { readonly id: string; readonly label: string; readonly side: Side; readonly outcome: PlayOutcome }

/** Adds dead-ball or separate fouls one after another, each from the succeeding spot the one before left. */
function stack(w: World, start: Choice, idx: readonly number[], calledIdx: readonly number[]): Choice[] {
  let acc: Choice[] = [start];
  for (const i of idx) {
    const next: Choice[] = [];
    for (const c of acc) {
      const w2 = after(w, c.outcome);
      const plans = deadPlans(w2, i);
      plans.forEach((plan, k) => {
        const applied = apply(w2, plan, calledIdx, false);
        const enforcement = c.outcome.enforcement === null ? applied.enforcement! : merge(c.outcome.enforcement, applied.enforcement!);
        next.push({ id: `${c.id}+${i}${plans.length > 1 ? `.${k}` : ''}`, label: plan.carriedTo === null ? c.label : `penalty.option.${plan.kind}`, side: c.side, outcome: { ...applied, enforcement } });
      });
    }
    acc = next;
  }
  return acc;
}

function declined(w: World, calledIdx: readonly number[], side: Side): Choice {
  return { id: 'decline', label: 'penalty.option.decline', side, outcome: { ...w.outcome, enforcement: summary(w, null, calledIdx, false) } };
}

/** B1.6.1 rule 2 and B8.5.8 rule 6: is the ten-second runoff on offer with this plan? */
function runoffOffered(w: World, plan: Plan): boolean {
  const s = w.ctx.situation;
  if (!s.insideTwoMinute || plan.offsetting || plan.carriedTo !== null) return false;
  return plan.enforced.some((i) => {
    const r = w.fouls[i]!;
    if (!r.runoffEligible || r.side !== w.facts.teamA) return false;
    // Time must be in: the clock was running before a dead-ball foul, or the foul came during a timed down.
    return r.timing === 'live' ? s.clockStatus !== 'untimed' && s.clockStatus !== 'intermission' : s.clockStatus === 'running';
  });
}

function choices(w: World, plans: readonly Plan[], prefix: string, calledIdx: readonly number[], side: Side): Choice[] {
  const out: Choice[] = [];
  plans.forEach((plan, k) => {
    const id = `${prefix}${plans.length > 1 ? `.${k}` : ''}`;
    const label = `penalty.option.${plan.kind}`;
    out.push({ id, label, side, outcome: apply(w, plan, calledIdx, false) });
    if (runoffOffered(w, plan)) out.push({ id: `${id}.runoff`, label: `${label}.runoff`, side, outcome: apply(w, plan, calledIdx, true) });
    // B8.5.8 rule 2: the yardage may be declined while the penalty (a loss of down) is kept.
    if (plan.lod && plan.from !== null && plan.to !== plan.from && plan.safetyFor === null && plan.kind !== 'no_yardage') {
      const kept: Plan = { ...plan, kind: 'no_yardage', to: plan.from, half: false };
      if (kept.to !== plan.to) out.push({ id: `${id}.no_yardage`, label: 'penalty.option.no_yardage', side, outcome: apply(w, kept, calledIdx, false) });
    }
  });
  return out;
}

const OFFSET_BASE = { keepResult: false, afd: false, lod: false, half: false, safetyFor: null, carriedTo: null, gain: 0 } as const;

/** B8.5.5 rule 2: the penalties offset and the down is replayed at the previous spot. */
function offsetReplay(w: World, idx: readonly number[]): Plan {
  return { ...OFFSET_BASE, kind: 'offset', enforced: [...idx], from: null, to: w.facts.previous, possession: w.facts.teamA, noPlay: true, replayDown: true, offsetting: true };
}

/** The penalties offset and the result of the down stands, with the ball at `to`. */
function offsetKeep(w: World, idx: readonly number[], to: number, possession: Side): Plan {
  return { ...OFFSET_BASE, kind: 'offset_keep', enforced: [...idx], from: null, to, possession, keepResult: true, noPlay: false, replayDown: false, offsetting: true };
}

function isPersonal(r: FoulRecord): boolean { return r.foulClass !== 'other'; }

function simpleMinor(w: World, r: FoulRecord): boolean {
  return r.yards === w.rules.num(K.minorYards) && !r.afd && !r.lod && !r.runoffEligible && !r.spotFoul;
}

/** B8.5.5 rule 3: the index of the major foul to enforce, or null when the rule does not apply. */
function majorAgainstMinor(w: World, mine: readonly number[], theirs: readonly number[]): number | null {
  if (!w.rules.bool(K.fiveFifteenApplies)) return null;
  const major = w.rules.num(K.majorYards);
  const pick = (a: readonly number[], b: readonly number[]): number | null => {
    const m = a.find((i) => w.fouls[i]!.yards === major);
    return m !== undefined && b.every((i) => simpleMinor(w, w.fouls[i]!)) ? m : null;
  };
  const x = pick(mine, theirs);
  const y = pick(theirs, mine);
  if (x !== null && y === null) return x;
  if (y !== null && x === null) return y;
  return null;
}

function onKick(r: FoulRecord): boolean { return r.phase === 'free_kick' || r.phase === 'scrimmage_kick'; }

/** B8.5.5 rules 2 to 8 and B7.3.3 rules 6 and 7: fouls by both teams. */
function doubleFoul(w: World, live: readonly number[], dead: readonly number[], calledIdx: readonly number[]): Choice[] {
  const f = w.facts;
  const o = w.outcome;
  const all = [...live, ...dead];
  const of = (side: Side, idx: readonly number[]) => idx.filter((i) => w.fouls[i]!.side === side);
  const forced = (plan: Plan): Choice[] => choices(w, [plan], 'double', calledIdx, o.snappingSide);
  const isTry = w.ctx.situation.playKind === 'try';

  // B8.5.5 rule 5 and B8.5.6 rule 3: dead-ball fouls by both teams offset at the succeeding spot and the down counts.
  if (live.length === 0) return forced(offsetKeep(w, all, f.succeeding, f.nextSide));

  // B8.5.7 rule 5 and B7.3.3 rule 6: the scoring team's only foul is a dead-ball foul after the score.
  if (o.score !== null) {
    const scorer = o.score.side;
    const theirs = of(otherSide(scorer), all);
    if (of(scorer, live).length === 0 && theirs.every((i) => live.includes(i))) {
      if (theirs.some((i) => isPersonal(w.fouls[i]!))) return forced(offsetKeep(w, all, f.succeeding, o.possessionAfter));
      const start = declined(w, calledIdx, otherSide(scorer));
      return [start, ...stack(w, { ...start, id: 'accept', label: 'penalty.option.succeeding_spot' }, of(scorer, dead), calledIdx)];
    }
  }

  const changed = o.changeOfPossession;
  if (isTry && changed) {
    // B7.3.3 rule 7: a replay when the defense fouled before the change, otherwise the try fails.
    const defenseBefore = of(f.teamB, all).some((i) => w.fouls[i]!.beforeChangeOfPossession);
    if (defenseBefore) return forced(offsetReplay(w, all));
    return forced({ ...offsetKeep(w, all, f.succeeding, o.possessionAfter), keepResult: false });
  }

  if (!changed) {
    const mine = of(f.teamA, all);
    const theirs = of(f.teamB, all);
    const major = majorAgainstMinor(w, mine, theirs);
    if (major !== null) {
      // The major penalty is enforced from the previous spot and the minor one is ignored.
      const r = w.fouls[major]!;
      const m = walk(w, f.previous, r.yards, r.side, true);
      return forced({ ...OFFSET_BASE, kind: 'previous_spot', enforced: [major], from: f.previous, to: m.to, half: m.half,
        possession: f.teamA, noPlay: true, replayDown: true, offsetting: false, afd: r.afd && r.side === f.teamB });
    }
    const out = forced(offsetReplay(w, all));
    // B8.5.5 rule 4: the spiking team may decline the opponent's foul and take its delay penalty.
    const spikeId = w.rules.opt(K.spikeDelayFoul);
    const spike = dead.find((i) => w.fouls[i]!.foulId === spikeId);
    if (spike !== undefined) {
      const spiker = w.fouls[spike]!.side;
      if (of(otherSide(spiker), all).every((i) => live.includes(i)) && of(spiker, all).length === 1) {
        const start = declined(w, calledIdx, spiker);
        out.push(...stack(w, { ...start, id: 'spike', label: 'penalty.option.succeeding_spot' }, [spike], calledIdx));
      }
    }
    return out;
  }

  // B8.5.5 rule 6, clean hands: `last` is the team last to gain possession.
  const last = o.possessionAfter;
  const first = otherSide(last);
  const lastFouls = of(last, all);
  const firstFouls = of(first, all);
  if (lastFouls.some((i) => w.fouls[i]!.beforeChangeOfPossession)) return forced(offsetReplay(w, all));

  const ownPlans = lastFouls.flatMap((i) => (live.includes(i) ? livePlans(w, i) : deadPlans(w, i)));
  const own = ownPlans[0];
  if (own === undefined) return forced(offsetKeep(w, all, f.succeeding, last));
  const kickReplay = firstFouls.some((i) => w.fouls[i]!.beforeChangeOfPossession && onKick(w.fouls[i]!));
  const replayOption = (): Choice[] => (kickReplay ? choices(w, [offsetReplay(w, all)], 'double.replay', calledIdx, last) : []);

  const firstBefore = firstFouls.filter((i) => w.fouls[i]!.beforeChangeOfPossession);
  const keepAtOwnSpot = (): Plan => {
    // The team in possession keeps the ball where its own foul would be enforced from (rules 6 and 7).
    if (own.safetyFor !== null) {
      const yard = w.rules.num(K.doubleFoulSafetyYardline);
      return offsetKeep(w, all, last === f.teamA ? yard : f.length - yard, last);
    }
    return offsetKeep(w, all, own.from ?? f.succeeding, last);
  };
  if (firstBefore.length === 0) return [...forced(keepAtOwnSpot()), ...replayOption()];
  // If enforcing the last team's foul would give a safety, the down is replayed.
  if (own.safetyFor !== null) return forced(offsetReplay(w, all));
  if (w.rules.bool(K.cleanHandsPersonalOffsets) && firstBefore.some((i) => isPersonal(w.fouls[i]!))) {
    return [...forced(keepAtOwnSpot()), ...replayOption()];
  }
  // The last team keeps the ball after enforcement of its own foul; the other foul is ignored.
  return [...choices(w, ownPlans.filter((p) => p.safetyFor === null), 'double', calledIdx, first), ...replayOption()];
}

function toOption(c: Choice): EnforcementOption {
  return { optionId: c.id, side: c.side, labelKey: c.label, outcome: c.outcome };
}

function dedupe(list: readonly Choice[]): Choice[] {
  const seen = new Set<string>();
  const out: Choice[] = [];
  for (const c of list) {
    const o = c.outcome;
    const e = o.enforcement;
    const key = [o.spotX, o.possessionAfter, o.noPlay, o.score === null ? '' : `${o.score.type}${o.score.side}`,
      e === null ? '' : [e.enforced.join('_'), e.automaticFirstDown, e.lossOfDown, e.replayDown, e.carriedTo, e.runoffTaken, e.offsetting].join(',')].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/** The procedure on prepared facts. `optionsFromTruth` and the contract's `options` both end here. */
export function optionsWithFacts(calledOutcome: PlayOutcome, fouls: readonly FoulRecord[], facts: EnforcementFacts, ctx: RulingContext): EnforcementOption[] {
  // Step 1: collect the called fouls.
  const calledIdx: number[] = [];
  fouls.forEach((r, i) => { if (r.called) calledIdx.push(i); });
  if (calledIdx.length === 0) {
    return [{ optionId: 'play', side: calledOutcome.possessionAfter, labelKey: 'penalty.option.none', outcome: calledOutcome }];
  }
  const w: World = { ctx, rules: ctx.rules, outcome: calledOutcome, facts, fouls };

  // Step 2: set aside the fouls that are enforced on their own, from the succeeding spot.
  const separate = calledIdx.filter((i) => fouls[i]!.timing === 'between_downs' || isSeparate(fouls[i]!.foulId, ctx.rules));
  const main = calledIdx.filter((i) => !separate.includes(i));
  const dead = main.filter((i) => fouls[i]!.timing === 'dead_ball');
  const live = main.filter((i) => !dead.includes(i));
  const sides = new Set(main.map((i) => fouls[i]!.side));

  let list: Choice[];
  if (main.length === 0) {
    const start = declined(w, calledIdx, otherSide(fouls[separate[0]!]!.side));
    list = [start];
  } else if (sides.size > 1) {
    // Step 4: both teams fouled.
    list = doubleFoul(w, live, dead, calledIdx);
  } else {
    // Step 3: one team fouled, once or more. The offended team picks one live-ball foul to enforce
    // (B8.5.5 rule 1); a second record of the same act is enforced with it (B8.1.2 interference row).
    const offender = fouls[main[0]!]!.side;
    const chooser = otherSide(offender);
    const start = declined(w, calledIdx, chooser);
    list = [start];
    const bases: Choice[] = [];
    for (const i of live) {
      // Steps 5 to 7 for this foul: spot, half the distance, the down.
      for (const c of choices(w, livePlans(w, i), `accept.${i}`, calledIdx, chooser)) {
        const twin = fouls[i]!.sameAct;
        if (twin !== null && live.includes(twin) && c.outcome.enforcement!.carriedTo === null && c.outcome.score === null) {
          const w2 = after(w, c.outcome);
          const m = walk(w2, w2.facts.succeeding, fouls[twin]!.yards, offender, true);
          const e = c.outcome.enforcement!;
          bases.push({ ...c, id: `${c.id}+${twin}`, outcome: { ...c.outcome, spotX: toFieldX(ctx, m.to),
            enforcement: { ...e, enforced: [...e.enforced, twin], declined: e.declined.filter((k) => k !== twin),
              yardsWalked: e.yardsWalked + (m.to - w2.facts.succeeding), halfDistanceApplied: e.halfDistanceApplied || m.half } } });
        } else {
          bases.push(c);
        }
      }
    }
    // Dead-ball fouls of the same team are added after the play result or after the accepted penalty (B8.5.6 rule 1).
    if (dead.length === 0) list.push(...bases);
    else for (const b of [{ ...start, id: 'accept', label: 'penalty.option.succeeding_spot' }, ...bases]) list.push(...stack(w, b, dead, calledIdx));
  }

  if (separate.length > 0) {
    const out: Choice[] = [];
    list.forEach((c, k) => {
      const keepDecline = k === 0 && c.id === 'decline';
      if (keepDecline) out.push(c);
      out.push(...stack(w, keepDecline ? { ...c, id: 'accept.separate', label: 'penalty.option.succeeding_spot' } : c, separate, calledIdx));
    });
    list = out;
  }
  // Step 8: the choices go to the offended coach. Disqualified players are in every summary.
  return dedupe(list).map(toOption);
}

/** B8.5.1 on the called outcome and the truth record as the crew saw it. This is the entry the facade should use. */
export function optionsFromTruth(seen: PlayTruth, calledOutcome: PlayOutcome, fouls: readonly FoulRecord[], ctx: RulingContext): EnforcementOption[] {
  return optionsWithFacts(calledOutcome, fouls, factsFromTruth(seen, calledOutcome, ctx), ctx);
}

/** The contract's signature. Without the truth record the basic spot is taken to be the dead-ball spot. */
export function options(calledOutcome: PlayOutcome, fouls: readonly FoulRecord[], ctx: RulingContext): EnforcementOption[] {
  return optionsWithFacts(calledOutcome, fouls, factsFromOutcome(calledOutcome, ctx), ctx);
}
