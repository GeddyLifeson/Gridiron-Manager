// Lineage (K2.5.2): what a coach takes from the people he worked under.
import { clamp, type Draws } from './draws.ts';
import { DEFENSE_RATE_KEYS, OFFENSE_RATE_KEYS, PERSONNEL_KEYS, TENDENCY_KEYS } from './keys.ts';
import type { CoachPopulation } from './population.ts';
import { ASSUMPTIONS } from './sources.ts';
import type { PersonnelKey, SystemBlock, TendencyBlock } from './types.ts';

/**
 * One person the coach worked under. `system` is the mentor's profile system, or for the user the
 * system read from his playbook and tendency store (K2.5.2 rule 5). `tendencies` is absent for the
 * user, who has no profile.
 */
export interface MentorInput {
  readonly mentorId: string;
  readonly seasons: number;
  readonly lastSeason: number;
  readonly system: SystemBlock;
  readonly tendencies?: TendencyBlock;
}

/** K2.5.2 rule 2 with K2.2.1 rule 3: individual variation after the blend, in SDs of each field. */
export const MENTOR_SYSTEM_NOISE_SD = { value: 0.5, status: 'Assumption' as const, citation: 'K2.5.2 rule 2, K2.2.1 rule 3 (noise size borrowed from the behaviour rule)' };

/** K2.5.2 rule 1: weights by seasons, the most recent mentor's doubled. Ties on lastSeason break by id. */
export function mentorWeights(mentors: readonly MentorInput[]): { mentor: MentorInput; weight: number }[] {
  if (mentors.length === 0) return [];
  const sorted = [...mentors].sort((a, b) => (a.mentorId < b.mentorId ? -1 : a.mentorId > b.mentorId ? 1 : 0));
  let recent = sorted[0]!;
  for (const m of sorted) if (m.lastSeason > recent.lastSeason) recent = m;
  return sorted.map((m) => ({ mentor: m, weight: Math.max(m.seasons, 0) * (m === recent ? 2 : 1) }));
}

function heaviest(ws: { mentor: MentorInput; weight: number }[]): MentorInput {
  let best = ws[0]!;
  for (const w of ws) if (w.weight > best.weight) best = w;
  return best.mentor;
}

/**
 * K2.5.2 rules 1 to 3: the starting system is a weighted blend of the mentors' systems with individual
 * variation; family, playbook and terminology come from the heaviest-weight mentor. The coach's own
 * side (`own.primarySide`) is kept.
 */
export function blendMentorSystems(mentors: readonly MentorInput[], own: SystemBlock, pop: CoachPopulation, d: Draws): SystemBlock {
  const ws = mentorWeights(mentors);
  const total = ws.reduce((s, w) => s + w.weight, 0);
  if (total <= 0) return own;
  const avg = (f: (s: SystemBlock) => number) => ws.reduce((s, w) => s + w.weight * f(w.mentor.system), 0) / total;
  const noisy = (path: string, x: number) => {
    const spec = pop.fields[path]!;
    return clamp(x + spec.sd * MENTOR_SYSTEM_NOISE_SD.value * d.normal(), spec.min, spec.max);
  };
  const offenseRates = { ...own.offenseRates };
  for (const k of OFFENSE_RATE_KEYS) offenseRates[k] = noisy(`offenseRates.${k}`, avg((s) => s.offenseRates[k]));
  const defenseRates = { ...own.defenseRates };
  for (const k of DEFENSE_RATE_KEYS) defenseRates[k] = noisy(`defenseRates.${k}`, avg((s) => s.defenseRates[k]));
  const noHuddle = noisy('tempo.noHuddleShare', avg((s) => s.tempoBase.noHuddleShare));
  const personnel = {} as Record<PersonnelKey, number>;
  let sum = 0;
  for (const k of PERSONNEL_KEYS) {
    const x = Math.max(avg((s) => s.personnelWeights[k]) * (1 + pop.personnelRelativeSd * MENTOR_SYSTEM_NOISE_SD.value * d.normal()), 1e-4);
    personnel[k] = x; sum += x;
  }
  for (const k of PERSONNEL_KEYS) personnel[k] = personnel[k] / sum;
  const top = heaviest(ws).system;
  return {
    primarySide: own.primarySide,
    offenseFamily: top.offenseFamily,
    defenseFamily: top.defenseFamily,
    specialTeamsFamily: top.specialTeamsFamily,
    playbookId: top.playbookId,
    personnelWeights: personnel,
    tempoBase: { huddleShare: 1 - noHuddle, noHuddleShare: noHuddle, snapAtPlayClockS: noisy('tempo.snapAtPlayClockS', avg((s) => s.tempoBase.snapAtPlayClockS)) },
    offenseRates,
    defenseRates,
    sheetSize: {
      offenseCalls: Math.round(noisy('sheet.offenseCalls', avg((s) => s.sheetSize.offenseCalls))),
      defenseCalls: Math.round(noisy('sheet.defenseCalls', avg((s) => s.sheetSize.defenseCalls))),
    },
  };
}

/** Terminology comes from the heaviest-weight mentor (K2.5.2 rule 3): his id, or null with no mentors. */
export function terminologySource(mentors: readonly MentorInput[]): string | null {
  const ws = mentorWeights(mentors);
  return ws.length ? heaviest(ws).mentorId : null;
}

/** K2.5.2 rule 4: tendencies inherit weakly from mentors who have them; behaviour never inherits. */
export function inheritTendencies(mentors: readonly MentorInput[], own: TendencyBlock, pop: CoachPopulation): TendencyBlock {
  const ws = mentorWeights(mentors).filter((w) => w.mentor.tendencies && w.weight > 0);
  const total = ws.reduce((s, w) => s + w.weight, 0);
  if (total <= 0) return own;
  const k0 = ASSUMPTIONS.tendencyInheritWeight.value;
  const out = { ...own };
  for (const k of TENDENCY_KEYS) {
    const m = ws.reduce((s, w) => s + w.weight * w.mentor.tendencies![k], 0) / total;
    const spec = pop.fields[`tendencies.${k}`]!;
    out[k] = clamp(k0 * m + (1 - k0) * own[k], spec.min, spec.max);
  }
  return out;
}
