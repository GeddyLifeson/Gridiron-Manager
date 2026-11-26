// College playoff field and seeds (T3.5.1). Automatic places, then at-large teams in ranking order
// until the field is full; seeds by final ranking; byes to the top seeds (bracket.ts).
// If an automatic team sits below the at-large cut, it still gets in and the last at-large drops out
// (T3.5.1 edge case): at-large teams only fill what the automatic places leave.
import { flag, num } from '../standings/params.ts';
import type { RuleValues, TeamId } from '../standings/types.ts';
import { ERA_KEY, eraFlag, eraNum } from './era-keys.ts';
import { KEY } from './params.ts';

export interface CollegeConference {
  readonly conferenceId: number;
  /** Power conference flag (T2 tiers). */
  readonly power: boolean;
  readonly champion: TeamId | null;
  readonly teamIds: readonly TeamId[];
}

export interface FieldInput {
  /** Final committee ranking, best first; every team in the competition appears. */
  readonly ranking: readonly TeamId[];
  readonly conferences: readonly CollegeConference[];
  /** Power-level independents (T3.5.1 2026 row). */
  readonly independents: readonly TeamId[];
}

export interface CollegeField {
  /** Seeds 1 to playoff.field_size, by ranking. */
  readonly seeds: readonly TeamId[];
  readonly automatic: readonly TeamId[];
  readonly atLarge: readonly TeamId[];
  /** Why each team is in: 'power_champion', 'other_best', 'champion', 'independent', 'at_large'. */
  readonly reason: ReadonlyMap<TeamId, string>;
}

export function selectCollegeField(input: FieldInput, rules: RuleValues): CollegeField {
  const size = num(rules, KEY.fieldSize);
  const rankOf = new Map(input.ranking.map((t, i) => [t, i + 1]));
  const rank = (t: TeamId) => rankOf.get(t) ?? Number.MAX_SAFE_INTEGER;
  const reason = new Map<TeamId, string>();

  if (flag(rules, KEY.powerChampionsAuto)) {
    for (const c of input.conferences) if (c.power && c.champion !== null) reason.set(c.champion, 'power_champion');
  }
  // 2024 and 2025 (T3.5.1 eras): the highest-ranked conference champions, from any conference.
  const champAuto = eraNum(rules, ERA_KEY.championAutoBids);
  if (champAuto > 0) {
    const champs = input.conferences.map((c) => c.champion).filter((t): t is TeamId => t !== null && !reason.has(t)).sort((a, b) => rank(a) - rank(b));
    for (const t of champs.slice(0, champAuto)) reason.set(t, 'champion');
  }
  const otherTeams = input.conferences.filter((c) => !c.power).flatMap((c) => c.teamIds).filter((t) => !reason.has(t)).sort((a, b) => rank(a) - rank(b));
  for (const t of otherTeams.slice(0, num(rules, KEY.otherAutoBids))) reason.set(t, 'other_best');
  const indRank = num(rules, KEY.independentAutoRank);
  if (indRank > 0) for (const t of input.independents) if (rank(t) <= indRank && !reason.has(t)) reason.set(t, 'independent');

  const automatic = [...reason.keys()];
  if (automatic.length > size) throw new Error(`${automatic.length} automatic places exceed a field of ${size}`);
  const pool = num(rules, KEY.atLargePoolRank);
  const atLarge: TeamId[] = [];
  for (const t of input.ranking) {
    if (automatic.length + atLarge.length >= size) break;
    if (reason.has(t)) continue;
    if (pool > 0 && rank(t) > pool) break;
    atLarge.push(t); reason.set(t, 'at_large');
  }
  if (automatic.length + atLarge.length < size) throw new Error('not enough eligible teams to fill the field');
  let seeds = [...automatic, ...atLarge].sort((a, b) => rank(a) - rank(b));
  // 2024 (T3.5.1 eras): the bye seeds go to the highest-ranked conference champions; everyone else follows by ranking.
  if (eraFlag(rules, ERA_KEY.byesChampionsOnly)) {
    const champions = new Set(input.conferences.map((c) => c.champion).filter((t): t is TeamId => t !== null));
    const top = seeds.filter((t) => champions.has(t)).slice(0, num(rules, KEY.byes));
    seeds = [...top, ...seeds.filter((t) => !top.includes(t))];
  }
  return { seeds, automatic, atLarge, reason };
}
