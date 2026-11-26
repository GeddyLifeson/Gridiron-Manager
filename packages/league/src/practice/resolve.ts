// Resolving a practice (H3.5.1): planned periods become knowledge exposures (D9, G-64), technique
// exposures (D7), load counts (D10, the WP-18 DayActivity fields), injury events (D11) and rep outcomes
// for grading and film. This module sends what practice produced; D7, D9, D10 and D11 own the formulas
// that turn it into change (H3 "What a builder needs"). Card match is not applied here: it is applied at
// game time against what the opponent shows (H3.2.2), so each knowledge exposure carries its card.
import { PROB_FLOOR, type RandomStream } from '@gm/schema';
import { P } from './params.ts';
import { padsLimitTechnique, periodType, tempoMultipliers, drill } from './practice.ts';
import { assignPractice, newCounters, type AssignContext, type RepAssignment } from './reps.ts';
import type { Period, Practice, Script, Tempo } from './types.ts';

/** Load counts for one player for the day, in the WP-18 `DayActivity` field names (D10.3.1). */
export interface PracticeLoad {
  liveReps: number;
  thudReps: number;
  /** Jog-tempo team and group reps. */
  teamReps: number;
  walkThroughReps: number;
  individualMinutes: number;
  /** Conditioning minutes; D10 converts them to load units (`otherLoad`). */
  conditioningMinutes: number;
  /** Reps run as a scout player (they count toward load, H3.2.3). */
  scoutReps: number;
  /** Outdoors in bad weather (H3.4.1): D10 and D11 apply the slight raise. */
  badWeather: boolean;
}

/** One knowledge exposure for G-64 (D9): the play, the look it ran against, and its weight before learning rate. */
export interface KnowledgeExposure {
  readonly personId: string;
  readonly elementId: string;
  readonly cardId: string | null;
  readonly mode: 'taken' | 'mental';
  readonly period: number;
  /** Product of H3.5.1 rule 3 terms except card match (game time) and the player's learning rate (D4, applied by D9). */
  readonly weight: number;
}

/** One technique exposure for D7: the techniques trained and the weight per rep or minute. */
export interface TechniqueExposure {
  readonly personId: string;
  readonly techniques: readonly string[];
  readonly period: number;
  readonly weight: number;
  readonly scout: boolean;
}

export interface RepOutcome {
  readonly period: number;
  readonly rep: number;
  readonly personId: string;
  readonly position: string;
  readonly assignment: 'right' | 'wrong';
  /** Graded reps only (competition periods and open positions, H3.3.3). */
  readonly won: boolean | null;
}

export interface PracticeInjury { readonly personId: string; readonly period: number; readonly rep: number }

export interface ResolveInput {
  readonly practice: Practice;
  readonly scripts: ReadonlyMap<string, Script>;
  readonly ctx: AssignContext;
  /** Scout players per period number (H3.2.3), each taking every rep of the period as a scout rep. */
  readonly scoutPlayers?: ReadonlyMap<number, readonly string[]>;
  /** Scout-team quality factor per period (H3.2.3); missing means the floor of the range. */
  readonly scoutFactor?: ReadonlyMap<number, number>;
  /** Teaching term per period leader (0.8 to 1.2): an AI coach's hidden K6 value or the user's built term. */
  readonly teachingTerm: (per: Period) => number;
  /** Mental error chance for one player on one play (D9 readiness). Default is the assumption constant. */
  readonly errorChance?: (personId: string, elementId: string | null) => number;
  /** Win chance for a graded rep (J6 contest in practice mode). Default is the assumption constant. */
  readonly winChance?: (personId: string, period: number) => number;
  /** Player-state multiplier on injury hazard (D10 fatigue, D11 history). Default 1. */
  readonly injuryState?: (personId: string) => number;
  /** Positions open to competition this week (H3.3.3). */
  readonly openPositions?: ReadonlySet<string>;
  /** D5 competitiveness and D12 security of candidates, for the competition effect. */
  readonly temperament?: (personId: string) => { readonly competitiveness: number; readonly security: number };
  readonly rng: RandomStream;
}

export interface PracticeResult {
  readonly practiceId: string;
  readonly load: ReadonlyMap<string, PracticeLoad>;
  readonly knowledge: readonly KnowledgeExposure[];
  readonly technique: readonly TechniqueExposure[];
  readonly outcomes: readonly RepOutcome[];
  readonly injuries: readonly PracticeInjury[];
  readonly assignments: readonly RepAssignment[];
  /** Full pads: one padded practice is used from the counter now, when it resolves (H3.1.1 acceptance). */
  readonly paddedUsed: boolean;
  /** Periods that ran short-handed (H3.1.2 edge case). */
  readonly shortPeriods: readonly number[];
  /** Team periods that ran on the coordinator's unapproved draft (H3.1.2 acceptance, H3.2.1 rule 5). */
  readonly draftRun: readonly number[];
  /** Players unsettled by an open competition (D12, L1 morale events). */
  readonly unsettled: readonly string[];
}

const clampP = (p: number) => (p < PROB_FLOOR ? PROB_FLOOR : p > 1 - PROB_FLOOR ? 1 - PROB_FLOOR : p);

function emptyLoad(): PracticeLoad {
  return { liveReps: 0, thudReps: 0, teamReps: 0, walkThroughReps: 0, individualMinutes: 0, conditioningMinutes: 0, scoutReps: 0, badWeather: false };
}

function addRep(l: PracticeLoad, tempo: Tempo): void {
  if (tempo === 'live') l.liveReps += 1;
  else if (tempo === 'thud') l.thudReps += 1;
  else if (tempo === 'jog') l.teamReps += 1;
  else l.walkThroughReps += 1;
}

function techniquesOf(per: Period): string[] {
  const out: string[] = [];
  for (const d of per.drills ?? []) for (const t of drill(d).techniques) if (!out.includes(t)) out.push(t);
  return out.length > 0 ? out : [per.type];
}

const tacklingTech = (per: Period) => techniquesOf(per).some((t) => t === 'tackling' || t === 'ball_security');

/** Injury hazard for one exposure (H3.5.1 rule 4): never 0, so nothing possible is impossible (MA-52). */
export function injuryHazard(practice: Practice, per: Period, afterWarmup: boolean, state: number): number {
  const t = periodType(per.type);
  let h = P('base_hazard_per_rep') * (t.injury / P('max_weight')) * tempoMultipliers(per.tempo).injury * state;
  if (afterWarmup) h *= P('warmup_injury_factor');
  if (per.tempo === 'live' && practice.pads !== 'full') h *= P('live_without_pads_injury');
  if (practice.environment.badWeather && !practice.environment.indoors) h *= P('bad_weather_injury');
  return clampP(h);
}

/** Knowledge weight of one taken rep before card match and learning rate (H3.5.1 rule 3). */
export function knowledgeWeight(practice: Practice, per: Period, scout: number, teaching: number): number {
  const t = periodType(per.type);
  let w = (t.knowledge / P('max_weight')) * tempoMultipliers(per.tempo).knowledge * scout * teaching;
  if (padsLimitTechnique(per, practice.pads)) w *= P('no_pads_run_readiness');
  if (practice.headCoachPresent) w *= P('presence_effort_bonus');
  return w;
}

/** Technique weight of one rep or minute (H3.1.2, H3.1.3, H3.5.1). */
export function techniqueWeight(practice: Practice, per: Period, teaching: number): number {
  const t = periodType(per.type);
  let w = (t.technique / P('max_weight')) * tempoMultipliers(per.tempo, tacklingTech(per)).technique * teaching;
  if (padsLimitTechnique(per, practice.pads)) w *= P('no_pads_line_technique');
  if (practice.headCoachPresent) w *= P('presence_effort_bonus');
  return w;
}

/**
 * Rep-level resolution. Draw order is fixed (period, rep, side, taker), so the same seed and plan give
 * identical results (acceptance 1). An injured player leaves the practice at once.
 */
export function resolvePractice(inp: ResolveInput): PracticeResult {
  const { practice, rng } = inp;
  const load = new Map<string, PracticeLoad>();
  const L = (id: string) => { let l = load.get(id); if (!l) { l = emptyLoad(); load.set(id, l); } l.badWeather = practice.environment.badWeather && !practice.environment.indoors; return l; };
  const knowledge: KnowledgeExposure[] = [];
  const technique: TechniqueExposure[] = [];
  const outcomes: RepOutcome[] = [];
  const injuries: PracticeInjury[] = [];
  const out = new Set(inp.ctx.out);
  const counters = newCounters();
  const assignments: RepAssignment[] = [];
  const shortPeriods: number[] = [];
  const draftRun: number[] = [];
  const unsettled: string[] = [];
  const errChance = inp.errorChance ?? (() => P('default_error_chance'));
  const winChance = inp.winChance ?? (() => P('default_win_chance'));
  const state = inp.injuryState ?? (() => 1);
  const effort = (id: string, pos: string) => {
    if (!inp.openPositions?.has(pos) || !inp.temperament) return 1;
    return inp.temperament(id).competitiveness >= P('competitive_threshold') ? P('competition_effort') : 1;
  };
  if (inp.openPositions && inp.temperament) {
    for (const pos of inp.openPositions) for (const id of inp.ctx.depth[pos] ?? []) {
      if (inp.temperament(id).security <= P('insecure_threshold') && !unsettled.includes(id)) unsettled.push(id);
    }
  }
  let warmedUp = false;
  const present = (id: string) => !out.has(id) && inp.ctx.participation.get(id)?.label !== 'did_not_participate';
  const shareOf = (id: string) => {
    const p = inp.ctx.participation.get(id);
    return p?.label === 'limited' ? (p.share ?? P('limited_share')) / P('percent') : 1;
  };

  for (const per of practice.periods) {
    const t = periodType(per.type);
    const teaching = inp.teachingTerm(per);
    const flagged = new Set(per.corrections ?? []);
    const after = warmedUp;
    if (t.kind === 'warmup') { warmedUp = true; continue; }
    if (t.kind === 'individual' || t.kind === 'conditioning') {
      const ids = new Set<string>();
      for (const g of per.groups) for (const id of inp.ctx.depth[g] ?? []) ids.add(id);
      for (const side of ['offense', 'defense', 'special_teams'] as const) if (per.groups.includes(side)) for (const pos of inp.ctx.shapes[side]) for (const id of inp.ctx.depth[pos] ?? []) ids.add(id);
      for (const id of [...ids].sort()) {
        if (!present(id)) continue;
        const minutes = per.minutes * shareOf(id);
        const l = L(id);
        if (t.kind === 'conditioning') l.conditioningMinutes += minutes;
        else {
          l.individualMinutes += minutes;
          const bonus = flagged.has(id) ? P('correction_bonus') : 1;
          technique.push({ personId: id, techniques: techniquesOf(per), period: per.number, weight: techniqueWeight(practice, per, teaching) * minutes * bonus, scout: false });
        }
        const exposures = Math.floor(minutes * P('individual_reps_per_minute'));
        const h = injuryHazard(practice, per, after, state(id));
        for (let k = 0; k < exposures; k++) if (rng.chance(h)) { injuries.push({ personId: id, period: per.number, rep: k + 1 }); out.add(id); break; }
      }
      continue;
    }
    const script = per.scriptRef ? inp.scripts.get(per.scriptRef) : undefined;
    if (t.needsScript && script && !script.approved) draftRun.push(per.number);
    const scout = t.kind === 'team' && t.knowledge > 0 ? (inp.scoutFactor?.get(per.number) ?? P('scout_factor_min')) : 1;
    const kw = knowledgeWeight(practice, per, scout, teaching);
    const tw = techniqueWeight(practice, per, teaching);
    const one: Practice = { ...practice, periods: [per] };
    const reps = assignPractice(one, inp.scripts, { ...inp.ctx, out }, counters);
    const scoutIds = inp.scoutPlayers?.get(per.number) ?? [];
    const graded = t.id === 'competition';
    for (const a of reps) {
      assignments.push(a);
      if (a.short && !shortPeriods.includes(per.number)) shortPeriods.push(per.number);
      for (const tk of a.takers) {
        const id = tk.personId;
        if (out.has(id)) continue;
        addRep(L(id), per.tempo);
        const wrong = rng.chance(clampP(errChance(id, a.slot.callId)));
        const won = graded || inp.openPositions?.has(tk.position) ? rng.chance(clampP(winChance(id, per.number))) : null;
        outcomes.push({ period: per.number, rep: a.slot.index, personId: id, position: tk.position, assignment: wrong ? 'wrong' : 'right', won });
        const bonus = (wrong ? P('correction_bonus') : 1) * (flagged.has(id) ? P('correction_bonus') : 1) * effort(id, tk.position);
        if (a.slot.callId && kw > 0) knowledge.push({ personId: id, elementId: a.slot.callId, cardId: a.slot.cardId, mode: 'taken', period: per.number, weight: kw * bonus });
        if (tw > 0) technique.push({ personId: id, techniques: techniquesOf(per), period: per.number, weight: tw * effort(id, tk.position) * (flagged.has(id) ? P('correction_bonus') : 1), scout: false });
        if (rng.chance(injuryHazard(practice, per, after, state(id)))) { injuries.push({ personId: id, period: per.number, rep: a.slot.index }); out.add(id); }
      }
      if (a.slot.callId && kw > 0) for (const w of a.watchers) {
        if (out.has(w)) continue;
        knowledge.push({ personId: w, elementId: a.slot.callId, cardId: a.slot.cardId, mode: 'mental', period: per.number, weight: kw * P('mental_rep_share') });
      }
    }
    // Scout players: every rep of the period, technique at half rate, load counted (H3.2.3).
    const repCount = new Set(reps.map((r) => r.slot.index)).size;
    for (const id of scoutIds) {
      for (let k = 0; k < repCount; k++) {
        if (out.has(id)) break;
        const l = L(id);
        addRep(l, per.tempo);
        l.scoutReps += 1;
        technique.push({ personId: id, techniques: techniquesOf(per), period: per.number, weight: tw * P('scout_technique_rate'), scout: true });
        if (rng.chance(injuryHazard(practice, per, after, state(id)))) { injuries.push({ personId: id, period: per.number, rep: k + 1 }); out.add(id); }
      }
    }
  }
  return {
    practiceId: practice.id, load, knowledge, technique, outcomes, injuries, assignments,
    paddedUsed: practice.pads === 'full', shortPeriods, draftRun, unsettled,
  };
}

/** Total knowledge weight per player (for the fast-mode comparison and the week summary). */
export function knowledgeTotals(r: Pick<PracticeResult, 'knowledge'>): Map<string, number> {
  const m = new Map<string, number>();
  for (const k of r.knowledge) m.set(k.personId, (m.get(k.personId) ?? 0) + k.weight);
  return m;
}

/**
 * Fast mode for AI clubs (H3.5.1 AI use, J14): the same formulas with no rep-level draws. Mental errors
 * enter as their expected correction bonus and injuries are not drawn here (the fast injury pass in D11
 * draws them from the summed hazard). Average gains match rep-level mode within 5 percent (acceptance 3).
 */
export function resolvePracticeFast(inp: Omit<ResolveInput, 'rng' | 'winChance'>): Pick<PracticeResult, 'practiceId' | 'load' | 'knowledge' | 'paddedUsed'> & { readonly hazard: ReadonlyMap<string, number> } {
  const { practice } = inp;
  const load = new Map<string, PracticeLoad>();
  const knowledge: KnowledgeExposure[] = [];
  const hazard = new Map<string, number>();
  const errChance = inp.errorChance ?? (() => P('default_error_chance'));
  const state = inp.injuryState ?? (() => 1);
  const counters = newCounters();
  let warmedUp = false;
  for (const per of practice.periods) {
    const t = periodType(per.type);
    if (t.kind === 'warmup') { warmedUp = true; continue; }
    if (t.kind === 'individual' || t.kind === 'conditioning') continue;
    const teaching = inp.teachingTerm(per);
    const scout = t.kind === 'team' && t.knowledge > 0 ? (inp.scoutFactor?.get(per.number) ?? P('scout_factor_min')) : 1;
    const kw = knowledgeWeight(practice, per, scout, teaching);
    const reps = assignPractice({ ...practice, periods: [per] }, inp.scripts, inp.ctx, counters);
    for (const a of reps) for (const tk of a.takers) {
      const id = tk.personId;
      let l = load.get(id);
      if (!l) { l = emptyLoad(); load.set(id, l); }
      addRep(l, per.tempo);
      hazard.set(id, (hazard.get(id) ?? 0) + injuryHazard(practice, per, warmedUp, state(id)));
      const expBonus = 1 + clampP(errChance(id, a.slot.callId)) * (P('correction_bonus') - 1);
      if (a.slot.callId && kw > 0) knowledge.push({ personId: id, elementId: a.slot.callId, cardId: a.slot.cardId, mode: 'taken', period: per.number, weight: kw * expBonus * ((per.corrections ?? []).includes(id) ? P('correction_bonus') : 1) });
    }
    for (const a of reps) if (a.slot.callId && kw > 0) for (const w of a.watchers) knowledge.push({ personId: w, elementId: a.slot.callId, cardId: a.slot.cardId, mode: 'mental', period: per.number, weight: kw * P('mental_rep_share') });
  }
  return { practiceId: practice.id, load, knowledge, paddedUsed: practice.pads === 'full', hazard };
}
