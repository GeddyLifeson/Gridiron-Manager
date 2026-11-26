// coach.career (O7.6.1, O4.6.1): the ladder with where he is and what he has held (S1), his job history, the
// people he has worked with and where they are now, and his reputation by audience as a word with reasons
// (E5). The word is the core's band (`reputation.bandOf`, E5.1.1 rule 4); the value under it never reaches the
// view (A3 ruling 21). A graduate assistant sees his term in words (S3.3.4, G-55 enrolment).
import { ladder, positions, reputation } from '@gm/career';
import { t, years } from './text.ts';
import type { CareerStint, CareerView, LadderRungView, NetworkPerson, ReputationLine } from './types.ts';

type Level = positions.CatalogueLevel;
const LEVELS: readonly Level[] = ['college', 'pro'];

export interface StintInput {
  readonly startSeason: number;
  readonly endSeason: number | null;
  /** Catalogue job id (positions/catalogue.json). */
  readonly jobId: string;
  readonly team: string;
  readonly level: Level;
  /** How he got the job, a history key (E9.3), e.g. `hired_by_contact`. */
  readonly how: string;
}

export interface NetworkInput {
  readonly name: string;
  readonly team: string;
  readonly fromSeason: number;
  readonly toSeason: number | null;
  /** Catalogue job id he holds now, or null when out of coaching. */
  readonly nowJobId: string | null;
  readonly nowTeam: string | null;
  readonly imported: boolean;
}

/** One audience's opinion as the coach can know it: the effective regard, how known he is, and the lines it rests on. */
export interface AudienceInput {
  readonly audience: reputation.AudienceId;
  readonly regard: number;
  readonly known: number;
  /** Plain reasons, each from a logged event the coach saw (X2.3.1 "what the view rests on"). */
  readonly reasons: readonly string[];
}

export interface CareerInput {
  readonly name: string;
  /** His seat now, or null when he holds no job. */
  readonly seat: ladder.SeatView | null;
  readonly jobId: string | null;
  readonly team: string | null;
  readonly stints: readonly StintInput[];
  readonly network: readonly NetworkInput[];
  readonly audiences: readonly AudienceInput[];
  /** Graduate assistant term (S3.3.4), when he holds that seat. */
  readonly enrolment: { readonly state: ladder.GaSeatState; readonly rules: ladder.GaRules } | null;
  readonly catalogue?: positions.Catalogue;
}

const GROUP: Readonly<Partial<Record<reputation.AudienceId, ReputationLine['group']>>> = {
  players: 'players', peers: 'coaches', administrators_and_owners: 'owners', media: 'media', fans: 'fans',
};

export function jobOf(cat: positions.Catalogue, id: string): positions.CatalogueRow {
  const j = cat.jobs.find((x) => x.id === id);
  if (!j) throw new Error(`career read models: unknown catalogue job ${id}`);
  return j;
}

/** Rungs a coach can hold on each ladder (S1.2.1, S1.3.1): catalogue rungs 1 to 9 the user may hold, per level. */
export function ladderRungs(cat: positions.Catalogue, level: Level, currentRung: number | null, held: ReadonlySet<number>): LadderRungView[] {
  const rungs = new Set<number>();
  for (const j of cat.jobs) if (j.onStaff && j.userHoldable && j.rung !== null && j.rung >= 1 && j.levels.includes(level)) rungs.add(j.rung);
  return [...rungs].sort((a, b) => a - b).map((rung) => ({ rung, title: t(`rung.${level}.${rung}`), current: rung === currentRung, held: held.has(rung) }));
}

export function buildCareerView(x: CareerInput): CareerView {
  const cat = x.catalogue ?? positions.CATALOGUE;
  const job = x.jobId ? jobOf(cat, x.jobId) : null;
  const level = x.seat?.level ?? null;
  const ladderView = {} as Record<Level, LadderRungView[]>;
  for (const lv of LEVELS) {
    const held = new Set<number>();
    for (const s of x.stints) { const r = jobOf(cat, s.jobId).rung; if (s.level === lv && r !== null) held.add(r); }
    ladderView[lv] = ladderRungs(cat, lv, level === lv ? (job?.rung ?? null) : null, held);
  }
  const history: CareerStint[] = [...x.stints]
    .sort((a, b) => a.startSeason - b.startSeason)
    .map((s) => ({ season: s.startSeason, endSeason: s.endSeason, jobTitle: jobOf(cat, s.jobId).title, team: s.team, level: t(`level.${s.level}`), how: s.how }));
  const network: NetworkPerson[] = x.network.map((p) => ({
    name: p.name,
    together: p.toSeason === null ? t('together.open', { team: p.team, from: p.fromSeason }) : t('together', { team: p.team, from: p.fromSeason, to: p.toSeason }),
    nowJob: p.nowJobId ? jobOf(cat, p.nowJobId).title : t('noJob'),
    nowTeam: p.nowTeam ?? '',
    imported: p.imported,
  }));
  const rep: ReputationLine[] = [];
  for (const a of x.audiences) {
    const group = GROUP[a.audience];
    if (!group) continue;
    const band = reputation.bandOf(a.regard, a.known);
    rep.push({ group, word: t(`band.${band}`), reasons: band === 'unknown' ? [] : [...a.reasons] });
  }
  return {
    rights: x.seat ? [...x.seat.rights] : [...ladder.SCREEN_TABLE.selfCommands],
    name: x.name,
    level: level ? t(`level.${level}`) : '',
    jobTitle: job ? job.title : t('noJob'),
    ladder: { college: ladderView.college, pro: ladderView.pro },
    history, network, reputation: rep,
    enrolment: x.enrolment ? { line: enrolmentLine(x.enrolment.state) } : null,
  };
}

export function enrolmentLine(s: ladder.GaSeatState): string {
  if (s.status === 'lost_enrolment') return t('enrol.lost');
  if (s.status === 'term_ended') return t('enrol.ended');
  const left = s.yearsGranted;
  if (left === null || left <= 1) return t('enrol.lastYear', { credits: s.creditsCompleted });
  return t('enrol.active', { credits: s.creditsCompleted, years: years(left) });
}
