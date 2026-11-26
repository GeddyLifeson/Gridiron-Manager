// The new-game flow's logic (X10.1, X10.3, E1.7; Marlon 2026-11-26): pick how long the past runs, from a
// few seasons up to the full span since football began in 1869; watch it being played; look it over;
// rerun it with a fresh seed as often as wanted; then confirm the coach against the world and start the
// career in the modern day. Everything is fictional. Baked master data is only read.
import * as engineCore from '@gm/engine-core';
import * as career from '@gm/career';
import { generation, loop, season, turnover } from '@gm/world';
import { appWorldContent } from './content.ts';
import { bindDraft, draftSetup, type BindingOptions } from './binding.ts';
import type { BakedHistory } from './baked.ts';

export const GAME_VERSION = 'gridiron-manager';
export const RULE_SET_OF_LEVEL = { pro: 'pro_2026', college: 'college_2026' } as const;

// ---------- setup ----------

export interface HistoryChoice {
  readonly seasons: number;
  readonly firstSeasonYear: number;
  /** The longest history: back to football's first season. */
  readonly full: boolean;
}

/** Offered lengths for a career start: the X10.1.1 presets below the span, then the full span from 1869. */
export function historyChoices(careerStartYear: number): HistoryChoice[] {
  const full = generation.fullHistorySeasons(careerStartYear);
  return generation.historyPresetsFor(careerStartYear).map((seasons) => ({ seasons, firstSeasonYear: generation.firstSeasonFor(careerStartYear, seasons), full: seasons === full }));
}

export interface WorldChoice {
  readonly seedHex: string;
  readonly size: generation.SizePreset;
  readonly historySeasons: number;
  readonly careerStartYear: number;
}

/** Problems with a world choice in words; empty when it may run. */
export function worldChoiceProblems(c: WorldChoice): string[] {
  const out = generation.historyChoiceProblems(c.careerStartYear, c.historySeasons);
  if (!/^[0-9a-f]{16}$/.test(c.seedHex)) out.push('seed: 16 hex digits');
  if (!generation.SIZE_PRESETS.includes(c.size)) out.push(`size: one of ${generation.SIZE_PRESETS.join(', ')}`);
  return out;
}

export interface Estimate { readonly seconds: number; readonly provisional: boolean; readonly shape: ReturnType<BakedHistory['shapeAt']> }

export function estimate(baked: BakedHistory, c: WorldChoice, benchmarkRatio = 1): Estimate {
  return {
    seconds: Math.round(baked.estimateHistorySeconds({ seasons: c.historySeasons, size: c.size, benchmarkRatio })),
    provisional: baked.provisional, shape: baked.shapeAt(c.historySeasons),
  };
}

// ---------- the run ----------

export interface Progress {
  readonly rerun: number;
  /** 0, or 1 when the first try failed validation and the run is redone with seed plus 1 (X10.3.2). */
  readonly seedStep: number;
  /** Seasons finished. */
  readonly done: number;
  readonly of: number;
  /** The season being played (or just finished) and its week; games played so far in this try. */
  readonly seasonYear: number;
  readonly week: number;
  readonly gamesPlayed: number;
  /** Champions of the season just played, by competition, with names (the ticker on the progress screen). */
  readonly champions: readonly { readonly competition: string; readonly team: string }[];
  readonly teamsActive: number;
  readonly people: number;
  readonly hallMembers: number;
  readonly elapsedMs: number;
}

export interface Draft {
  readonly choice: WorldChoice;
  readonly rerun: number;
  readonly seedHex: string;
  readonly built: loop.BuiltHistory;
  readonly setup: generation.SetupRecord;
  readonly worldCode: string;
}

const teamName = (w: loop.LiveWorld, id: number): string => w.teams.find((t) => t.id === id)?.identity.name ?? `team ${id}`;
const compName = (w: loop.LiveWorld, id: number): string => w.competitions.find((c) => c.id === id)?.name ?? `competition ${id}`;

/**
 * Generate draft `rerun` of the past for a world choice. Rerun 0 uses the chosen seed; each rerun derives
 * a fresh seed from it (loop.rerunSeedHex), so the seed and the rerun count name the world.
 */
export function runDraft(
  c: WorldChoice, rerun: number,
  opts: { readonly onProgress?: (p: Progress) => void; readonly now?: () => number; readonly binding?: BindingOptions } = {},
): Draft {
  const problems = worldChoiceProblems(c);
  if (problems.length) throw new Error(`world choice refused: ${problems.join('; ')}`);
  const now = opts.now ?? (() => 0);
  const t0 = now();
  let current: loop.LiveWorld | null = null;
  let currentStep = 0;
  let done = 0, games = 0, lastWeek = -1, lastChampions: Progress['champions'] = [];
  const setupOf = (seedHex: string) => draftSetup({ ...c, seedHex });
  const base = opts.binding?.games ?? season.historyGamePort();
  const report = (seasonYear: number, week: number, of: number) => {
    const w = current!;
    opts.onProgress?.({
      rerun, seedStep: currentStep, done, of, seasonYear, week, gamesPlayed: games, champions: lastChampions,
      teamsActive: w.teams.filter((t) => loop.isActive(w, t.id, seasonYear)).length,
      people: w.people.size, hallMembers: w.hall.members.length, elapsedMs: now() - t0,
    });
  };
  // Progress inside a season too: one report as each week's first game starts (a season takes minutes).
  const games$: loop.GamePort = (req) => {
    if (req.week !== lastWeek) { lastWeek = req.week; report(req.seasonYear, req.week, c.historySeasons); }
    games++;
    return base(req);
  };
  const make = bindDraft(setupOf, {
    ...opts.binding,
    games: games$,
    onSeason: (s, d) => {
      const w = current!;
      done = d; lastWeek = -1;
      lastChampions = Object.entries(s.champions).map(([cid, tid]) => ({ competition: compName(w, Number(cid)), team: teamName(w, tid) }));
      report(s.seasonYear, -1, c.historySeasons);
    },
  });
  const draft = loop.draftHistory(c.seedHex, rerun, (seedHex, step) => {
    const parts = make(seedHex, step);
    current = parts.world;
    currentStep = step; done = 0; games = 0; lastWeek = -1; lastChampions = [];
    return parts;
  });
  const setup = draft.built.world.setup;
  return { choice: c, rerun, seedHex: draft.seedHex, built: draft.built, setup, worldCode: generation.worldCode(setup, GAME_VERSION, appWorldContent().content.contentVersion) };
}

// ---------- the review ----------

export interface ReviewTeam {
  readonly id: number; readonly name: string; readonly competition: string; readonly level: string;
  readonly founded: number; readonly folded: number | null; readonly titles: number;
  readonly wins: number; readonly losses: number; readonly ties: number;
}
export interface ReviewSeason { readonly seasonYear: number; readonly games: number; readonly points: number; readonly champions: readonly { readonly competition: string; readonly teamId: number; readonly team: string }[] }
export interface ReviewCoach { readonly personId: number; readonly name: string; readonly headSeasons: number; readonly teams: readonly string[]; readonly titles: number }
export interface ReviewHall { readonly personId: number; readonly name: string; readonly hall: string; readonly kind: 'player' | 'coach'; readonly season: number; readonly charter: boolean }

/** What the review screen draws. Plain data, so it crosses the worker boundary as it is. */
export interface DraftReview {
  readonly rerun: number;
  readonly seedHex: string;
  readonly seedStep: number;
  readonly worldCode: string;
  readonly firstSeasonYear: number;
  readonly careerStartYear: number;
  readonly seasonsRun: number;
  readonly validation: { readonly pass: boolean; readonly failures: readonly string[]; readonly notChecked: readonly string[] };
  readonly failedTwice: boolean;
  /** Steps whose owning system is not built yet: the history ran without them. */
  readonly unbound: readonly { readonly step: string; readonly reason: string }[];
  readonly people: { readonly active: number; readonly inactive: number; readonly deceased: number };
  /** Newest first. */
  readonly seasons: readonly ReviewSeason[];
  readonly teams: readonly ReviewTeam[];
  readonly coaches: readonly ReviewCoach[];
  readonly hall: readonly ReviewHall[];
}

const personName = (w: loop.LiveWorld, id: number): string => { const p = w.people.get(id); return p ? `${p.name.first} ${p.name.last}` : `person ${id}`; };

export function reviewOf(d: Draft, coachRows = 12): DraftReview {
  const w = d.built.world;
  const titles = new Map<number, number>();
  for (const s of w.seasons) for (const tid of Object.values(s.champions)) titles.set(tid, (titles.get(tid) ?? 0) + 1);
  const record = new Map<number, { wins: number; losses: number; ties: number }>();
  for (const s of w.seasons) for (const [tid, r] of Object.entries(s.records)) {
    const e = record.get(Number(tid)) ?? { wins: 0, losses: 0, ties: 0 };
    e.wins += r.wins; e.losses += r.losses; e.ties += r.ties;
    record.set(Number(tid), e);
  }
  const compOf = new Map(w.competitions.flatMap((c) => c.teamIds.map((t) => [t, c] as const)));
  const teams: ReviewTeam[] = w.teams.map((t) => {
    const span = w.teamSpans.get(t.id);
    const r = record.get(t.id) ?? { wins: 0, losses: 0, ties: 0 };
    const c = compOf.get(t.id);
    return {
      id: t.id, name: t.identity.name, competition: c?.name ?? '', level: c?.level ?? '', founded: span?.founded ?? d.setup.firstSeasonYear,
      folded: span?.folded ?? null, titles: titles.get(t.id) ?? 0, ...r,
    };
  }).filter((t) => t.founded < d.choice.careerStartYear)
    .sort((a, b) => b.titles - a.titles || b.wins - a.wins || a.id - b.id);

  const head = new Map<number, { seasons: number; teams: Set<number>; titles: number }>();
  const champOf = new Map(w.seasons.map((s) => [s.seasonYear, new Set(Object.values(s.champions))]));
  for (const s of w.staffSeasons) {
    if (s.headCoachId === null) continue;
    const e = head.get(s.headCoachId) ?? { seasons: 0, teams: new Set<number>(), titles: 0 };
    e.seasons++; e.teams.add(s.teamId);
    if (champOf.get(s.seasonYear)?.has(s.teamId)) e.titles++;
    head.set(s.headCoachId, e);
  }
  const coaches: ReviewCoach[] = [...head.entries()]
    .sort((a, b) => b[1].titles - a[1].titles || b[1].seasons - a[1].seasons || a[0] - b[0]).slice(0, coachRows)
    .map(([id, e]) => ({ personId: id, name: personName(w, id), headSeasons: e.seasons, teams: [...e.teams].sort((a, b) => a - b).map((t) => teamName(w, t)), titles: e.titles }));

  const last = w.seasons.at(-1);
  return {
    rerun: d.rerun, seedHex: d.seedHex, seedStep: d.built.seedStep, worldCode: d.worldCode, firstSeasonYear: d.setup.firstSeasonYear,
    careerStartYear: d.choice.careerStartYear, seasonsRun: d.built.report.seasonsRun,
    validation: { pass: d.built.validation.pass, failures: d.built.validation.failures, notChecked: d.built.validation.notChecked },
    failedTwice: d.built.failedTwice, unbound: d.built.report.unbound,
    people: last?.people ?? { active: w.people.size, inactive: 0, deceased: 0 },
    seasons: [...w.seasons].reverse().map((s) => ({
      seasonYear: s.seasonYear, games: s.games, points: s.points,
      champions: Object.entries(s.champions).map(([cid, tid]) => ({ competition: compName(w, Number(cid)), teamId: tid, team: teamName(w, tid) })),
    })),
    teams, coaches,
    hall: w.hall.members.map((m) => ({ personId: m.personId, name: personName(w, m.personId), hall: m.hallId, kind: m.kind, season: m.ballotSeason, charter: m.charter })),
  };
}

// ---------- the coach, confirmed against the world (E1.7.1 checks 5 and 8 read the world) ----------

/** E1.6.2 and E1.2.2 read the generated world: teams by level, head coach stints, staff seasons, vacancies. */
export function creationWorld(w: loop.LiveWorld, careerStartYear: number): career.coach.CreationWorld {
  const teams = w.teams.filter((t) => loop.isActive(w, t.id, careerStartYear)).map((t) => ({ id: t.id, level: turnover.levelOfTeam(w, t.id) as career.coach.Level }));
  const rows = [...w.staffSeasons].sort((a, b) => a.teamId - b.teamId || a.seasonYear - b.seasonYear);
  const lastSeason = w.seasons.at(-1)?.seasonYear ?? careerStartYear - 1;
  const stints: career.coach.HeadStint[] = [];
  let cur: { personId: number; teamId: number; firstSeason: number; lastSeason: number } | null = null;
  const flush = () => { if (cur) stints.push({ ...cur, lastSeason: cur.lastSeason >= lastSeason ? null : cur.lastSeason, offensiveFamily: null, defensiveFamily: null }); cur = null; };
  for (const r of rows) {
    if (r.headCoachId === null) { flush(); continue; }
    if (cur && cur.personId === r.headCoachId && cur.teamId === r.teamId && r.seasonYear === cur.lastSeason + 1) cur.lastSeason = r.seasonYear;
    else { flush(); cur = { personId: r.headCoachId, teamId: r.teamId, firstSeason: r.seasonYear, lastSeason: r.seasonYear }; }
  }
  flush();
  const staffSeasons = w.staffSeasons.flatMap((s) => s.staffIds.map((personId) => ({ personId, teamId: s.teamId, seasonYear: s.seasonYear })));
  const heldNow = new Set(stints.filter((s) => s.lastSeason === null).map((s) => s.teamId));
  return { year: careerStartYear, teams, headStints: stints, staffSeasons, vacantTeamIds: teams.map((t) => t.id).filter((id) => !heldNow.has(id)) };
}

/** The S3.3.4 graduate assistant limits creation checks, from the college rule set. */
export function coachRules(): career.coach.CoachRules {
  const lk = appWorldContent().lookup.college;
  const gaMaxSeasons = lk('staff.ga_max_seasons'), gaDegreeWindowYears = lk('staff.ga_degree_window_years');
  if (gaMaxSeasons === undefined || gaDegreeWindowYears === undefined) throw new Error('rule set lacks staff.ga_max_seasons or staff.ga_degree_window_years');
  return { gaMaxSeasons, gaDegreeWindowYears };
}

export function validateCoach(d: Draft, choices: career.coach.CreationChoices): career.coach.Validation {
  return career.coach.validateCreation(choices, creationWorld(d.built.world, d.choice.careerStartYear), coachRules());
}

// ---------- the start ----------

/**
 * What the career starts from. The world is the chosen draft's world, in the season the career starts;
 * the setup, seed and rerun count rebuild it exactly (the history is a pure function of them).
 */
export interface CareerStart {
  readonly setup: generation.SetupRecord;
  readonly baseSeedHex: string;
  readonly rerun: number;
  readonly seedHex: string;
  readonly seedStep: number;
  readonly worldCode: string;
  readonly worldHash: string;
  readonly careerStartYear: number;
  /** The level the coach starts at, and its rule set id. */
  readonly level: 'pro' | 'college';
  readonly ruleSetId: string;
  /** The coach's team (his first job's team, or the home program); null when he starts with no team. */
  readonly seatTeamId: number | null;
  readonly seatTeamName: string | null;
  readonly saveName: string;
  readonly coach: career.coach.CreatedCoach;
}

export type StartResult =
  | { readonly ok: true; readonly start: CareerStart; readonly world: loop.LiveWorld }
  | { readonly ok: false; readonly problems: readonly career.coach.CreationProblem[]; readonly notices: readonly career.coach.CreationNotice[] };

/** Confirm (E1.7.1): refused while any check fails. The coach takes the next person id of the world. */
export function startCareer(d: Draft, choices: career.coach.CreationChoices, saveName: string): StartResult {
  const w = d.built.world;
  const rng = engineCore.stream(engineCore.seedFromHex(d.seedHex), 'career.coach_creation', [choices.seed]);
  const r = career.coach.createCoach(choices, creationWorld(w, d.choice.careerStartYear), coachRules(), { uniform: () => rng.uniform() }, w.nextIds['person'] ?? w.people.size + 1);
  if (!r.ok) return { ok: false, problems: r.problems, notices: r.notices };
  return {
    ok: true, world: w,
    start: {
      setup: d.setup, baseSeedHex: d.choice.seedHex, rerun: d.rerun, seedHex: d.seedHex, seedStep: d.built.seedStep, worldCode: d.worldCode,
      worldHash: loop.worldHash(w), careerStartYear: d.choice.careerStartYear,
      level: r.coach.level, ruleSetId: RULE_SET_OF_LEVEL[r.coach.level],
      seatTeamId: r.coach.firstJob?.teamId ?? choices.firstTeamId, seatTeamName: (() => { const id = r.coach.firstJob?.teamId ?? choices.firstTeamId; return id === null ? null : teamName(w, id); })(),
      saveName, coach: r.coach,
    },
  };
}

// ---------- coach cards for the screen (app-ui reads app-services only) ----------

export type CreationChoices = career.coach.CreationChoices;
export type CreationValidation = career.coach.Validation;
/** Origin cards (S2.1.1) and archetype presets (E1.7.2), and how each fills the creation choices. */
export const coachCards = {
  origins: career.coach.ORIGINS.map((o) => ({ id: o.id, ageMin: o.ageMin, ageMax: o.ageMax, costKey: o.costKey })),
  presets: career.coach.PRESETS.map((p) => ({ id: p.id, start: p.start, level: p.level, age: p.age, patternKey: p.patternKey })),
  levels: career.coach.LEVELS,
  fromOrigin: (id: string, level: career.coach.Level, seed: number): CreationChoices => career.coach.choicesFromOrigin(id, level, seed),
  fromPreset: (id: string, seed: number, firstTeamId: number | null, openJobsOnly: boolean): CreationChoices => {
    const p = career.coach.PRESETS.find((x) => x.id === id);
    if (!p) throw new Error(`coach: unknown preset ${id}`);
    return career.coach.choicesFromPreset(p, seed, firstTeamId, openJobsOnly);
  },
  /** Starts that place the coach in a chosen team's job (E1.6.2). */
  needsFirstTeam: (c: CreationChoices): boolean => c.start === 'coordinator' || c.start === 'head_coach',
};
