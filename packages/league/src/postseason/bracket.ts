// The bracket (C3.4.1 pro, T3.5.1 college). One engine runs every format from rule keys: field size,
// byes, reseeding or a fixed bracket, how many rounds are on the higher seed's field, and whether
// groups (conferences) end in a final between their champions.
//   Pro: 7 per conference, 1 bye, reseeded, 3 campus rounds, conference grouping, neutral final.
//   College 2026: 12 national, 4 byes, fixed, 1 campus round. College 2027: 24, 8 byes, fixed, 2 campus rounds.
// The fixed bracket pairs by slot: a round-one winner takes the slot of the higher seed in its game, and
// each round pairs the best slot with the worst. That is the standard bracket; the exact 2027 pairing is
// not in the bible (named assumption, see the PR notes).
import { flag, num, str } from '../standings/params.ts';
import type { RuleValues, TeamId } from '../standings/types.ts';
import { GROUP_CONFERENCE, KEY } from './params.ts';

/** Two teams meet in each game. Bracket shape, not a football number. */
const TEAMS_PER_GAME = 1 + 1;

export interface BracketFormat {
  readonly grouping: 'conference' | 'national';
  readonly fieldSize: number;
  readonly byes: number;
  readonly reseed: boolean;
  readonly campusRounds: number;
}

export function formatFromRules(rules: RuleValues): BracketFormat {
  const f: BracketFormat = {
    grouping: str(rules, KEY.grouping) === GROUP_CONFERENCE ? 'conference' : 'national',
    fieldSize: num(rules, KEY.fieldSize),
    byes: num(rules, KEY.byes),
    reseed: flag(rules, KEY.reseed),
    campusRounds: num(rules, KEY.campusRounds),
  };
  const problems = formatProblems(f);
  if (problems.length) throw new Error(`bad bracket format: ${problems.join('; ')}`);
  return f;
}

function isPowerOfTwo(n: number): boolean { return n >= 1 && (n & (n - 1)) === 0; }

export function formatProblems(f: BracketFormat): string[] {
  const out: string[] = [];
  const firstRound = f.fieldSize - f.byes;
  if (f.byes < 0 || f.byes > f.fieldSize) out.push('byes outside the field');
  if (firstRound % TEAMS_PER_GAME !== 0) out.push('an odd number of teams plays the first round');
  if (!isPowerOfTwo(f.byes + firstRound / TEAMS_PER_GAME)) out.push('teams after round one are not a power of two');
  return out;
}

export interface BracketGame {
  /** Stable key: group, round, slot. */
  readonly key: string;
  readonly group: number | null;
  /** 1-based round. The final between group champions is the round after the groups' last. */
  readonly round: number;
  /** Teams, higher seed first. */
  readonly teams: readonly [TeamId, TeamId];
  readonly seeds: readonly [number, number];
  /** Hosting team, or null at a neutral site. */
  readonly host: TeamId | null;
  readonly winner: TeamId | null;
}

export interface BracketGroup { readonly groupId: number; readonly seeds: readonly TeamId[] }

export interface Bracket {
  readonly format: BracketFormat;
  readonly groups: readonly BracketGroup[];
  readonly games: readonly BracketGame[];
  readonly champion: TeamId | null;
  /** Rounds per group (the final between groups, if any, is round groupRounds + 1). */
  readonly groupRounds: number;
}

interface Entrant { readonly team: TeamId; readonly seed: number; readonly slot: number }

function roundsFor(f: BracketFormat): number {
  let teams = f.byes + (f.fieldSize - f.byes) / TEAMS_PER_GAME;
  let rounds = 1;
  while (teams > 1) { teams /= TEAMS_PER_GAME; rounds++; }
  return rounds;
}

function pair(entrants: readonly Entrant[], byKey: (e: Entrant) => number): [Entrant, Entrant][] {
  const sorted = [...entrants].sort((a, b) => byKey(a) - byKey(b));
  const out: [Entrant, Entrant][] = [];
  for (let i = 0, j = sorted.length - 1; i < j; i++, j--) out.push([sorted[i]!, sorted[j]!]);
  return out;
}

function makeGame(group: number | null, round: number, a: Entrant, b: Entrant, campus: boolean): BracketGame {
  const [hi, lo] = a.seed <= b.seed ? [a, b] : [b, a];
  return {
    key: `${group ?? 'final'}:${round}:${Math.min(a.slot, b.slot)}`, group, round,
    teams: [hi.team, lo.team], seeds: [hi.seed, lo.seed], host: campus ? hi.team : null, winner: null,
  };
}

/** A new bracket from seeded groups (seed 1 first). Round one games are created at once. */
export function createBracket(format: BracketFormat, groups: readonly BracketGroup[]): Bracket {
  const problems = formatProblems(format);
  if (problems.length) throw new Error(`bad bracket format: ${problems.join('; ')}`);
  if (format.grouping === 'national' && groups.length !== 1) throw new Error('a national bracket has one group');
  const games: BracketGame[] = [];
  for (const g of groups) {
    if (g.seeds.length !== format.fieldSize) throw new Error(`group ${g.groupId} has ${g.seeds.length} teams, format needs ${format.fieldSize}`);
    const players = g.seeds.slice(format.byes).map((team, i) => ({ team, seed: format.byes + i + 1, slot: format.byes + i + 1 }));
    for (const [a, b] of pair(players, (e) => e.seed)) games.push(makeGame(groupKey(format, g), 1, a, b, format.campusRounds >= 1));
  }
  return { format, groups, games, champion: null, groupRounds: roundsFor(format) };
}

function groupKey(f: BracketFormat, g: BracketGroup): number | null { return f.grouping === 'conference' ? g.groupId : null; }

/** Games waiting for a winner. */
export function pendingGames(b: Bracket): BracketGame[] { return b.games.filter((g) => g.winner === null); }

/**
 * Record a winner (no ties in the postseason, C3.4.1 rule 5). When a round of a group is complete, the
 * next round's games are added; when every group has a champion, the final between them is added.
 */
export function recordWinner(b: Bracket, key: string, winner: TeamId): Bracket {
  const game = b.games.find((g) => g.key === key);
  if (!game) throw new Error(`no bracket game ${key}`);
  if (game.winner !== null) throw new Error(`game ${key} already has a winner`);
  if (!game.teams.includes(winner)) throw new Error(`team ${winner} did not play in ${key}`);
  let games = b.games.map((g) => (g.key === key ? { ...g, winner } : g));
  const f = b.format;

  if (game.round > b.groupRounds) return { ...b, games, champion: winner };

  const groupGames = games.filter((g) => g.group === game.group && g.round === game.round);
  if (groupGames.some((g) => g.winner === null)) return { ...b, games };

  const seedOf = (g: BracketGroup, t: TeamId) => g.seeds.indexOf(t) + 1;
  const group = f.grouping === 'conference' ? b.groups.find((g) => g.groupId === game.group)! : b.groups[0]!;

  if (game.round === b.groupRounds) {
    // Group champion. A national bracket ends here; conference groups go on to the final.
    if (f.grouping === 'national') return { ...b, games, champion: winner };
    const champs = b.groups.map((g) => games.find((x) => x.group === g.groupId && x.round === b.groupRounds && x.winner !== null)?.winner ?? null);
    if (champs.some((c) => c === null)) return { ...b, games };
    if (champs.length === 1) return { ...b, games, champion: champs[0]! };
    const [c0, c1] = champs as TeamId[];
    const final: BracketGame = { key: `final:${b.groupRounds + 1}:1`, group: null, round: b.groupRounds + 1, teams: [c0!, c1!], seeds: [seedOf(b.groups[0]!, c0!), seedOf(b.groups[1]!, c1!)], host: null, winner: null };
    return { ...b, games: [...games, final] };
  }

  // Survivors: winners of this round plus, after round one, the teams with byes.
  const winners: Entrant[] = groupGames.map((g) => ({ team: g.winner!, seed: seedOf(group, g.winner!), slot: slotOf(g) }));
  if (game.round === 1) for (let s = 1; s <= f.byes; s++) winners.push({ team: group.seeds[s - 1]!, seed: s, slot: s });
  const next = game.round + 1;
  const campus = next <= f.campusRounds;
  const newGames = pair(winners, (e) => (f.reseed ? e.seed : e.slot)).map(([x, y]) => makeGame(game.group, next, x, y, campus));
  games = [...games, ...newGames];
  return { ...b, games };
}

/** Slot carried forward from a game: the best slot that played in it. */
function slotOf(g: BracketGame): number { return Number(g.key.split(':')[g.key.split(':').length - 1]); }

/** The round each team lost in (null for the champion and for teams still alive). */
export function roundLost(b: Bracket): Map<TeamId, number> {
  const out = new Map<TeamId, number>();
  for (const g of b.games) if (g.winner !== null) out.set(g.teams[0] === g.winner ? g.teams[1] : g.teams[0], g.round);
  return out;
}

/** Designated home team of the neutral final alternates by group each year (C3.4.1 rule 4: jersey and bench only). */
export function designatedHomeGroup(groupIds: readonly number[], year: number): number {
  return groupIds[year % groupIds.length]!;
}
