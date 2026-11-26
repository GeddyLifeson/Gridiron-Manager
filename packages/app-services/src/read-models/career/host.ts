// The coach screens' host over the running save (O4.6, O7.2.1, O7.6.1). It reads the save's tables for the
// coach (liveCareerTables), opens them to his own observer, registers careerSpecs over CareerSources built from
// that observed world, and serves each screen's read model. A screen whose model is empty (the save holds no
// data for it yet, CR-CS-2) gets its empty view, so the screen shows "nothing yet" rather than a made-up value.
import { CAREER_SCREEN_SCHEMAS } from '@gm/schema';
import { ladder, positions } from '@gm/career';
import type { loop } from '@gm/world';
import { ObservedWorld, ReadModelRegistry, buildReadModel, observerFor } from '../../observer/index.ts';
import { careerSourcesOf, type TeamSeasonLine } from './live.ts';
import { liveCareerTables } from './live-tables.ts';
import { CAREER_MODELS } from './spec.ts';
import { careerSpecs } from './spec.ts';
import type { AssignmentsView, CareerView, ContractView, FinanceView, JobMarketView, LifeView, RecordView } from './types.ts';

type LiveWorld = loop.LiveWorld;

export interface CareerHostOptions {
  /** The coach whose screens these are; defaults to the save's user. */
  readonly personId?: number;
  /** The kind of week (S3.1.1); defaults to offseason before the season's first weekly pass, else a game week. */
  week?(world: LiveWorld): ladder.WeekKind;
  /** The finish in words of one team's season, when the host words standings (C3); null otherwise. */
  finish?(teamId: number, seasonYear: number): string | null;
  readonly catalogue?: positions.Catalogue;
}

export interface CareerHost {
  /** The coach, or null when the save has no user (a history draft). */
  readonly personId: number | null;
  career(): CareerView;
  jobMarket(): JobMarketView;
  contract(): ContractView;
  record(): RecordView;
  finance(): FinanceView;
  life(): LifeView;
  /** The Office list, or null when he holds no ladder seat. */
  assignments(): AssignmentsView | null;
}

/** A team's regular-season line in one season: the season summary once folded, the played games before. */
export function teamSeasonOf(world: LiveWorld, teamId: number, seasonYear: number): Omit<TeamSeasonLine, 'finish'> | null {
  const done = world.seasons.find((s) => s.seasonYear === seasonYear);
  if (done) return done.records[teamId] ?? null;
  if (seasonYear !== world.date.seasonYear) return null;
  let wins = 0, losses = 0, ties = 0, played = 0;
  for (const g of world.results) {
    if (g.seasonYear !== seasonYear || g.kind !== 'regular' || (g.homeTeamId !== teamId && g.awayTeamId !== teamId)) continue;
    const us = g.homeTeamId === teamId ? g.homePoints : g.awayPoints, them = g.homeTeamId === teamId ? g.awayPoints : g.homePoints;
    played++;
    if (us > them) wins++; else if (us < them) losses++; else ties++;
  }
  return played > 0 ? { wins, losses, ties } : null;
}

const SELF = (): readonly string[] => [...ladder.SCREEN_TABLE.selfCommands];

/** Empty views: what each screen shows when the save holds nothing for it. */
export const EMPTY_VIEWS = {
  career: (rights: readonly string[], name = ''): CareerView => ({ rights: [...rights], name, level: '', jobTitle: '', ladder: { college: [], pro: [] }, history: [], network: [], reputation: [], enrolment: null }),
  jobMarket: (rights: readonly string[]): JobMarketView => ({ rights: [...rights], windowOpen: false, windowLine: '', openings: [], applications: [], interviews: [], offers: [], signs: [], yearOut: null }),
  contract: (rights: readonly string[]): ContractView => ({ rights: [...rights], team: null, jobTitle: null, terms: [], yearsLeft: null, clauses: [] }),
  record: (rights: readonly string[]): RecordView => ({ rights: [...rights], seasons: [], families: [], certified: [] }),
  finance: (rights: readonly string[]): FinanceView => ({
    rights: [...rights], currency: '', netWorth: [], income: [], taxes: [], spending: [], holdings: [], advisers: [], offers: [],
    plan: { savingRatePct: 0, risk: '' }, projection: null,
  }),
  life: (rights: readonly string[]): LifeView => ({
    rights: [...rights], week: '', hours: [], hoursAvailable: 0, sleep: { word: '', trend: 'same' }, energy: { word: '', trend: 'same' },
    health: [], family: [], template: [], effects: [],
  }),
};

interface Built { readonly key: string; readonly model: (name: string) => unknown }

/** The host for the save's coach. Models rebuild when the world moves (a pass or a day), never per call. */
export function careerHost(world: LiveWorld, opts: CareerHostOptions = {}): CareerHost {
  const personId = opts.personId ?? world.userPersonId;
  let built: Built | null = null;
  const stamp = (): string => `${world.passHash}|${world.passes}|${world.date.seasonYear}|${world.date.dayIndex}|${world.dayInWeek}`;
  const get = (): Built | null => {
    if (personId === null) return null;
    const key = stamp();
    if (built?.key === key) return built;
    const { source, how } = liveCareerTables(world, personId);
    const observer = observerFor(source, personId);
    const observed = new ObservedWorld(source, observer);
    const week = opts.week?.(world) ?? (world.week === 0 ? 'offseason' : 'game');
    const src = careerSourcesOf(observed, {
      how, week, seasonYear: world.date.seasonYear, catalogue: opts.catalogue,
      teamSeason: (teamId, y) => { const l = teamSeasonOf(world, teamId, y); return l ? { ...l, finish: opts.finish?.(teamId, y) ?? null } : null; },
    });
    const registry = new ReadModelRegistry();
    for (const s of careerSpecs(CAREER_SCREEN_SCHEMAS, src)) registry.register(s);
    const cache = new Map<string, unknown>();
    built = {
      key,
      model: (name) => {
        if (!cache.has(name)) cache.set(name, buildReadModel(registry, source, observer, name, { personId }).model.data);
        return cache.get(name);
      },
    };
    return built;
  };
  const rights = (): readonly string[] => (get()?.model(CAREER_MODELS.assignments) as AssignmentsView | null)?.rights ?? SELF();
  const view = <V>(name: string, empty: (r: readonly string[]) => V): V => (get()?.model(name) as V | null | undefined) ?? empty(rights());
  return {
    personId,
    career: () => view(CAREER_MODELS['coach.career'], (r) => EMPTY_VIEWS.career(r)),
    jobMarket: () => view(CAREER_MODELS['coach.job_market'], EMPTY_VIEWS.jobMarket),
    contract: () => view(CAREER_MODELS['coach.contract'], EMPTY_VIEWS.contract),
    record: () => view(CAREER_MODELS['coach.record'], EMPTY_VIEWS.record),
    finance: () => view(CAREER_MODELS['coach.finance'], EMPTY_VIEWS.finance),
    life: () => view(CAREER_MODELS['coach.life'], EMPTY_VIEWS.life),
    assignments: () => (get()?.model(CAREER_MODELS.assignments) as AssignmentsView | null | undefined) ?? null,
  };
}
