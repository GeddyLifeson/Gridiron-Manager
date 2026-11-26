// The repo's own content bound to `WorldContent`: G-11 world data, G-18 name tables and the roster mix
// built from project data. The data files belong to @gm/football-content, whose entry point does not
// export them yet (integrator request CR-G81-1), so the caller hands the parsed files in as `RawContent`.
// League numbers (roster limits, season games, staff limits) are passed in from the league rules files,
// so no football number is typed here.
import { positions } from '@gm/career';
import { generator } from '@gm/people';
import { DMATH } from '@gm/engine-core';
import type { PersonRecord, RandomStream } from '@gm/schema';
import type { ContentCollege, ContentLocation, ContentProLeague, LevelSpec, PersonNameSource, WorldContent } from './content.ts';
import rosterMix from './data/roster-mix.json' with { type: 'json' };
import { param } from './params.ts';

type WeightedList = ReadonlyArray<readonly [string, number]>;
interface NameIndex { names: string[]; cum: number[]; total: number }

/** The parsed files of packages/football-content/data/world and data/names, and the helpers of data/names/lib.ts. */
export interface RawContent {
  readonly proLeague: unknown;
  readonly college: unknown;
  readonly locations: { readonly locations: unknown };
  readonly blocked: {
    readonly proNicknames: readonly string[]; readonly proCities: readonly string[]; readonly otherLeagueNicknames: readonly string[];
    readonly colleges: readonly { readonly school: string; readonly nickname: string }[];
    readonly conferencesAndLeagues: readonly string[]; readonly eventsAndTrophies: readonly string[];
  };
  readonly firstNames: { readonly football: { readonly all: { readonly names: unknown } } };
  readonly surnames: { readonly football: { readonly all: { readonly names: unknown } } };
  readonly guard: { readonly packed: string };
  readonly hometowns: { readonly states: unknown };
  readonly lib: {
    cumulative(list: WeightedList): NameIndex;
    drawWeighted(ix: NameIndex, u: number): string;
    guardHash(first: string, last: string): string;
    guardSet(packed: string): Set<string>;
  };
}

export const CONTENT_VERSION = 'g11.1-g18.1';
/** Redraws before a name that still matches a real current person is given a different surname by walking the table. */
const NAME_REDRAWS = 20;

/** Rule keys world generation reads (declared for G-10 and the integrator). */
export const RULE_KEYS: readonly { key: string; meaning: string; ownerLeaf: string; readBy: readonly string[] }[] = [
  { key: 'roster.active_inactive_limit', meaning: 'Founding roster size where the level keeps an Active/Inactive List (C5.1.1).', ownerLeaf: 'C5.1.1', readBy: ['world.generation'] },
  { key: 'league.roster_limit', meaning: 'Founding roster size where the level counts one roster (T5.1.1).', ownerLeaf: 'T5.1.1', readBy: ['world.generation'] },
  { key: 'schedule.regular_season_games', meaning: 'Regular-season games per team, for the first culture expectation (X9.2.1).', ownerLeaf: 'C2.1.1', readBy: ['world.generation'] },
];
const ROSTER_LIMIT_KEYS: readonly string[] = ['roster.active_inactive_limit', 'league.roster_limit'];

export type RuleLookup = (key: string) => number | undefined;

/** The numbers one level needs, read by key from its league rules. A feature is on when its key is present (W-13). */
export function levelNumbers(lookup: RuleLookup): Pick<LevelSpec, 'rosterLimit' | 'seasonGames' | 'staffLimits'> {
  const rosterLimit = ROSTER_LIMIT_KEYS.map(lookup).find((v) => v !== undefined);
  if (rosterLimit === undefined) throw new Error(`league rules hold none of ${ROSTER_LIMIT_KEYS.join(', ')}`);
  const seasonGames = lookup('schedule.regular_season_games');
  if (seasonGames === undefined) throw new Error('league rules do not hold schedule.regular_season_games');
  const staffLimits: Record<string, number> = {};
  for (const k of positions.RULE_KEYS) { const v = lookup(k.key); if (v !== undefined) staffLimits[k.key] = v; }
  return { rosterLimit, seasonGames, staffLimits };
}

/**
 * Tier shares on a college roster. Recruits are tracked at three per signee (X11.2.1,
 * people.cohorts.recruitTrackedPerSignee), so a roster is the top third of the tracked class: the
 * generator's tier shares (D13.3.2) cut at one third from the top and rescaled. Derived, not measured.
 */
export function rosterTierShares(trackedPerSignee: number): number[] {
  let room = 1 / trackedPerSignee;
  const out = [0, 0, 0, 0, 0];
  for (const t of [5, 4, 3, 2, 1] as const) { const take = Math.min(room, generator.TIER_SHARES[t]); out[t - 1] = take; room -= take; }
  const sum = out.reduce((a, b) => a + b, 0);
  return out.map((x) => x / sum);
}

/**
 * A founding college player's tier from his program's strength (T12.2.1, D13.3.2). Each player has a latent
 * quality `rho * programZ + sqrt(1 - rho^2) * e` with e standard normal; the tiers are its upper quantiles at
 * the national roster shares, so the world's total tier mix is unchanged and only where it lands moves.
 * rho is fitted to how real blue-chip recruits sit on rosters by program rank (research/tuning/talent-spread.md).
 */
export function tierFromProgram(s: RandomStream, programZ: number, tierShares: readonly number[]): generator.Tier {
  const rho = param('talent.programRho');
  const latent = rho * programZ + DMATH.sqrt(1 - rho * rho) * s.normal();
  let above = 0;
  for (const t of [5, 4, 3, 2] as const) {
    above += tierShares[t - 1]!;
    if (above > 0 && above < 1 && latent > generator.normalInv(1 - above, DMATH)) return t;
  }
  return 1;
}

export function makeNameSource(raw: RawContent): PersonNameSource {
  const { firstNames, surnames, guard } = raw;
  const { cumulative, drawWeighted, guardHash, guardSet } = raw.lib;
  const first = cumulative(firstNames.football.all.names as unknown as WeightedList);
  const last = cumulative(surnames.football.all.names as unknown as WeightedList);
  const real = guardSet(guard.packed);
  return (s: RandomStream): PersonRecord['name'] => {
    let f = drawWeighted(first, s.uniform()), l = drawWeighted(last, s.uniform());
    for (let i = 0; i < NAME_REDRAWS && real.has(guardHash(f, l)); i++) l = drawWeighted(last, s.uniform());
    // D13.5.2: never a real current person's full name. If every redraw collided, walk the surname table.
    for (let i = 0; real.has(guardHash(f, l)); i++) {
      if (i >= last.names.length) throw new Error(`no surname clears the real-name guard for ${f}`);
      l = last.names[i]!;
    }
    return { first: f, last: l, suffix: null, nickname: null };
  };
}

/** Regions weighted by where college players come from (G-18 hometowns, one source). */
export function makeHomeRegionSource(raw: RawContent): (s: RandomStream) => string {
  const { hometowns } = raw;
  const states = Object.values(hometowns.states as Record<string, { region: string; players: number }>);
  const byRegion = new Map<string, number>();
  for (const st of states) byRegion.set(st.region, (byRegion.get(st.region) ?? 0) + st.players);
  const regions = [...byRegion.keys()].sort();
  const weights = regions.map((r) => byRegion.get(r)!);
  return (s) => regions[s.pick(weights)]!;
}

export interface DefaultContentInput {
  readonly pro: Pick<LevelSpec, 'rosterLimit' | 'seasonGames' | 'staffLimits'>;
  readonly college: Pick<LevelSpec, 'rosterLimit' | 'seasonGames' | 'staffLimits'>;
  /** people.cohorts `recruitTrackedPerSignee`, passed by the caller so the two stay one number. */
  readonly recruitTrackedPerSignee: number;
  readonly labelIds?: readonly string[];
  readonly seasonGamesByLevelId?: Readonly<Record<string, number>>;
  readonly violationClasses?: { readonly pro: readonly string[]; readonly college: readonly string[] };
}

export function defaultContent(raw: RawContent, input: DefaultContentInput): WorldContent {
  const { blocked, proLeague, college, locations } = raw;
  const tierShares = rosterTierShares(input.recruitTrackedPerSignee);
  const tiers: readonly generator.Tier[] = [1, 2, 3, 4, 5];
  const schoolPairs = blocked.colleges.map((c) => ({ school: c.school, nickname: c.nickname }));
  return {
    contentVersion: CONTENT_VERSION,
    pro: proLeague as unknown as ContentProLeague,
    college: college as unknown as ContentCollege,
    locations: (locations.locations as unknown as (ContentLocation & { lat: number; lon: number })[]),
    blockedTerms: {
      phrases: [...blocked.conferencesAndLeagues, ...blocked.eventsAndTrophies],
      realCities: blocked.proCities, realNicknames: [...blocked.proNicknames, ...blocked.otherLeagueNicknames], schoolPairs,
    },
    // X10.2.1 rule 2. Full and Standard hold the same team levels here: the lower-division and high-school
    // levels are people pools with no schools in content (G-11 README), so Full adds no team yet.
    collegeLevelsBySize: { full: ['college_top', 'college_second'], standard: ['college_top', 'college_second'], small: ['college_top'] },
    levels: {
      pro: {
        ruleSetId: 'pro_2026', leagueRulesId: 'pro_league_2026', ...input.pro, rosterMix: rosterMix.mixes.pro.counts,
        bossChairs: ['owner'], ageModel: 'curve', playerGroup: 'pro_player', talent: () => ({ kind: 'pro_entrant' }),
        violationClasses: input.violationClasses?.pro ?? [],
      },
      college: {
        ruleSetId: 'college_2026', leagueRulesId: 'college_league_2026', ...input.college, rosterMix: rosterMix.mixes.college.counts,
        bossChairs: ['athletic_director', 'president'], ageModel: 'class_years', playerGroup: 'college_player',
        talent: (s, programZ) => ({ kind: 'tier', tier: programZ === undefined ? tiers[s.pick(tierShares)]! : tierFromProgram(s, programZ, tierShares) }),
        programStrength: true,
        violationClasses: input.violationClasses?.college ?? [],
      },
    },
    seasonGamesByLevelId: input.seasonGamesByLevelId,
    labelIds: input.labelIds ?? [],
    taxProfiles: [],
  };
}
