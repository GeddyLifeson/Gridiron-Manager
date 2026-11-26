// What a person believes about coaching, as stances on a few axes. There is no right end of any axis:
// a stance is a view, not a quality (Marlon 2026-11-26 14:26, "answer how you best feel"). Every axis
// is a topic real interviews cover (facts.json rows named per axis).
//
// For a generated person the stances are drawn once from his X1 trait block plus his own spread, with
// a stream keyed by his person id, so the same person believes the same things on every machine and in
// every interview. Truth only: no screen reads these numbers. The user's coach has no stances: the user
// answers in the room and the answers are the record (X1.1.1 rule 3: the user's trait maps are empty).
import type { RandomStream, TraitBlock } from '@gm/schema';
import { clamp, param } from './params.ts';

/** One trait's pull on a stance: `facet` 0..100 or `value` -50..50, with a sign. */
interface Pull { readonly kind: 'facet' | 'value'; readonly key: string; readonly sign: 1 | -1 }

export interface StanceDef {
  readonly id: string;
  /** What -1 and +1 mean, for docs and the screen's notes. Neither end is better. */
  readonly low: string;
  readonly high: string;
  readonly pulls: readonly Pull[];
  /** Fact row naming real interviews that cover this topic. */
  readonly fact: string;
  /** Asked only at this level (college: academics), else both. */
  readonly level: 'both' | 'college';
}

const f = (key: string, sign: 1 | -1 = 1): Pull => ({ kind: 'facet', key, sign });
const v = (key: string, sign: 1 | -1 = 1): Pull => ({ kind: 'value', key, sign });

export const STANCES: readonly StanceDef[] = [
  { id: 'discipline', low: 'case by case, second chances', high: 'one rule for everyone, no exceptions', pulls: [f('discipline'), f('rule_respect')], fact: 'F-interview-0002', level: 'both' },
  { id: 'player_relations', low: 'demanding, the coach sets the standard', high: 'relationships first, players have a voice', pulls: [f('sociability'), f('discipline', -1)], fact: 'F-interview-0002', level: 'both' },
  { id: 'personnel_say', low: 'scouts and the front office pick the players', high: 'coaches have the final say on players', pulls: [f('ego'), v('independence')], fact: 'F-interview-0004', level: 'both' },
  { id: 'analytics', low: 'feel and experience decide', high: 'the numbers decide', pulls: [f('risk_tolerance'), v('tradition', -1)], fact: 'F-interview-0003', level: 'both' },
  { id: 'youth', low: 'proven veterans play', high: 'young players get real snaps', pulls: [v('development'), v('winning', -1)], fact: 'F-interview-0006', level: 'both' },
  { id: 'flexibility', low: 'we do what we do', high: 'build the system around the players', pulls: [f('coachability'), f('ego', -1)], fact: 'F-interview-0005', level: 'both' },
  { id: 'practice_contact', low: 'protect bodies, little contact', high: 'physical practice, pads often', pulls: [f('competitiveness'), f('patience', -1)], fact: 'F-interview-0006', level: 'both' },
  { id: 'aggression', low: 'keep it in front, win the field position game', high: 'attack, take risks, pressure', pulls: [f('risk_tolerance')], fact: 'F-interview-0003', level: 'both' },
  { id: 'run_pass', low: 'run the ball to win', high: 'throw it to win', pulls: [], fact: 'F-interview-0005', level: 'both' },
  { id: 'delegation', low: 'hands on, the head man checks everything', high: 'hire good people and let them work', pulls: [f('ego', -1), f('patience')], fact: 'F-interview-0001', level: 'both' },
  { id: 'dissent', low: 'disagree in private, then back the boss', high: 'push back openly in the staff room', pulls: [f('candor'), f('loyalty', -1)], fact: 'F-interview-0008', level: 'both' },
  { id: 'media', low: 'say little, keep it in the building', high: 'open with the press and fans', pulls: [f('candor'), f('sociability')], fact: 'F-interview-0002', level: 'both' },
  { id: 'academics', low: 'football comes first', high: 'school and growing up come first', pulls: [v('development'), v('winning', -1)], fact: 'F-interview-0014', level: 'college' },
];

export type StanceId = string;
/** Stance per axis, -1 to +1. */
export type Beliefs = Readonly<Record<StanceId, number>>;

const STANCE_IDS = new Set(STANCES.map((s) => s.id));

export function stanceDef(id: StanceId): StanceDef {
  const s = STANCES.find((x) => x.id === id);
  if (!s) throw new Error(`interviews: unknown stance ${id}`);
  return s;
}

/** Mean pull of the traits, -1 to +1 (a missing trait reads as the middle). */
function traitScore(t: TraitBlock | null, pulls: readonly Pull[]): number {
  if (t === null || pulls.length === 0) return 0;
  let s = 0;
  for (const p of pulls) {
    const raw = p.kind === 'facet' ? ((t.facets[p.key] ?? 50) - 50) / 50 : (t.values[p.key] ?? 0) / 50;
    s += p.sign * raw;
  }
  return clamp(s / pulls.length, -1, 1);
}

/**
 * Draw a generated person's stances. One normal per axis in STANCES order. `stream` must be keyed by
 * the person (the caller names it), so beliefs never depend on who else was drawn first.
 */
export function drawBeliefs(traits: TraitBlock | null, stream: RandomStream): Beliefs {
  const w = param('belief.traitWeight'); const sd = param('belief.ownSd');
  const out: Record<string, number> = {};
  for (const s of STANCES) out[s.id] = clamp(w * traitScore(traits, s.pulls) + sd * stream.normal(), -1, 1);
  return out;
}

/** Beliefs from explicit stances (tests, imported profiles); unknown axes are refused, missing ones are the middle. */
export function beliefsFrom(stances: Readonly<Record<string, number>>): Beliefs {
  for (const k of Object.keys(stances)) if (!STANCE_IDS.has(k)) throw new Error(`interviews: unknown stance ${k}`);
  return Object.fromEntries(STANCES.map((s) => [s.id, clamp(stances[s.id] ?? 0, -1, 1)]));
}

/** How much a person cares about a stance: more the further from the middle he stands. */
export function care(b: Beliefs, id: StanceId): number {
  return param('care.base') + param('care.perConviction') * Math.abs(b[id] ?? 0);
}
