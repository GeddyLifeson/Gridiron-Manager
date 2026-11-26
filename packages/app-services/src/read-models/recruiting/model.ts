// Builds the recruiting board view (O7.5.1, T4) for one staff: the board by position and class with the
// staff's grade and band, the read of interest in words with its basis, who else is in it, the next allowed
// contact, every act with its hour cost and the rule it would break, the numbers board (T4.8.1), the contact
// calendar (T4.2.1, T4.5.2), the assigned area, our own logged violations (G-28) and the transfer portal (T6).
// Pure: it reads the state and never changes it (league `peekAct`, not `previewAct`).
import { recruiting, type compliance } from '@gm/league';
import { param } from './params.ts';
import type {
  ActionView, AreaRow, BoardList, BoardRow, CalendarStretch, CalendarView, ConfidenceWord, GradeView, NumbersView,
  PortalView, ReadView, RecruitingBoardView, RecruitingVerb, RightButton, ViolationRow,
} from './types.ts';

/** Acts the screen offers on a prospect, in display order, with the verb whose right covers each (S3, T4.6.1). */
export const ACT_VERBS: Readonly<Record<recruiting.ActionKind, RecruitingVerb>> = {
  call: 'contact', message: 'contact', contact_off_campus: 'contact', home_visit: 'contact', contact_on_campus: 'contact',
  evaluation: 'evaluate', camp: 'evaluate', unofficial_visit: 'visit', official_visit: 'visit',
};
export const ACT_ORDER: readonly recruiting.ActionKind[] = [
  'evaluation', 'camp', 'call', 'message', 'contact_off_campus', 'home_visit', 'contact_on_campus', 'unofficial_visit', 'official_visit',
];
/** Looks that count as watching (MA-48). A high school coach's word narrows character but is not watching. */
export const WATCHING_LOOKS: readonly recruiting.LookKind[] = ['first_pass_film', 'full_film', 'live', 'camp'];

export interface NameSource {
  person(personId: number): string;
  team(teamId: number): string;
}

/** T6 portal entries as the world records them (public: a player's entry is announced). */
export interface PortalInput {
  readonly window: { readonly open: number; readonly close: number } | null;
  readonly entries: readonly { readonly personId: number; readonly position: string; readonly fromTeamId: number; readonly enteredDay: number }[];
}

export interface RecruitingBoardInput {
  readonly state: recruiting.RecruitingState;
  readonly ctx: recruiting.RecruitingContext;
  readonly teamId: number;
  /** The user: the staff member who would take each act. */
  readonly staffId: number;
  readonly party: compliance.PartyRef;
  readonly day: number;
  readonly classYear: number;
  /** From the seat (career ladder `seatView` rights): verbs the user owns or may suggest. Absent = none. */
  readonly rights: Partial<Record<RecruitingVerb, RightButton>>;
  readonly names: NameSource;
  /** Regions assigned to the user (T4.6.1); null shows every region with a prospect of the class. */
  readonly area?: readonly string[] | null;
  readonly list?: BoardList;
  readonly filter?: { readonly position?: string | null; readonly region?: string | null; readonly source?: string | null };
  /** Hours left this week (E7), when the host tracks them. */
  readonly hoursLeft?: number | null;
  readonly portal?: PortalInput | null;
}

const VERBS: readonly RecruitingVerb[] = ['evaluate', 'contact', 'visit', 'offer', 'plan'];

export function confidenceOf(band: Readonly<Record<string, number>>): ConfidenceWord {
  const widths = Object.values(band);
  const mean = widths.length ? widths.reduce((a, b) => a + b, 0) / widths.length : Number.POSITIVE_INFINITY;
  const prior = recruiting.P('grade.priorHalfWidth');
  if (mean <= param('recruitingBoard.confidenceFirmShare') * prior) return 'firm';
  if (mean <= param('recruitingBoard.confidenceFairShare') * prior) return 'fair';
  return 'thin';
}

/** MA-48: a grade only after watching. Unwatched (public or word-only) prospects get none. */
export function gradeView(g: recruiting.BoardGrade | null): GradeView | null {
  if (!g || g.setBy === 'public') return null;
  const watched = WATCHING_LOOKS.reduce((n, k) => n + (g.looks[k] ?? 0), 0);
  if (watched === 0) return null;
  const looks = (Object.keys(g.looks) as recruiting.LookKind[])
    .filter((k) => (g.looks[k] ?? 0) > 0)
    .map((k) => ({ kind: k, count: g.looks[k]! }));
  return {
    value: Math.round(g.mean), scaleMax: recruiting.P('grade.max'), grader: g.setBy,
    lastLookDay: g.lastLookDay ?? null, looks, confidence: confidenceOf(g.band), band: { ...g.band },
    measured: g.measured ? { ...g.measured } : null, userGrade: g.userGrade,
  };
}

function readView(r: recruiting.StaffRead | null, names: NameSource): ReadView | null {
  if (!r) return null;
  return {
    standing: r.standing, basis: r.basis?.kind ?? null, asOf: r.asOf,
    reasons: r.reasons.map((x) => ({ key: x.key, positive: x.positive, basis: x.basis, day: x.day })),
    rivals: r.rivals.map((x) => ({ team: names.team(x.teamId), basis: x.basis, day: x.day })),
  };
}

function rightsOf(input: RecruitingBoardInput): Record<RecruitingVerb, RightButton> {
  const out = {} as Record<RecruitingVerb, RightButton>;
  for (const v of VERBS) out[v] = input.rights[v] ?? 'none';
  return out;
}

function actRef(input: RecruitingBoardInput, kind: recruiting.ActionKind, prospectId: number, day: number): recruiting.ActRef {
  return { kind, teamId: input.teamId, staffId: input.staffId, prospectId, day };
}

function actionsFor(input: RecruitingBoardInput, rights: Record<RecruitingVerb, RightButton>, prospectId: number): ActionView[] {
  const out: ActionView[] = [];
  for (const kind of ACT_ORDER) {
    const verb = ACT_VERBS[kind];
    const button = rights[verb];
    if (button === 'none') continue;
    const pv = recruiting.peekAct(input.state, input.ctx, actRef(input, kind, prospectId, input.day), input.party);
    out.push({
      kind, verb, hours: recruiting.hoursOf(kind), button,
      breaches: pv.breaches.map((b) => b.rule),
      warning: pv.warning ? { classId: pv.warning.classId, ruleText: pv.warning.ruleText, body: pv.warning.body, penaltyText: pv.warning.penaltyText } : null,
    });
  }
  return out;
}

/** First day from today on which an off-campus contact breaks no rule (T4.2.1), within the scan window. */
export function nextContactDay(input: RecruitingBoardInput, prospectId: number): number | null {
  const scan = param('recruitingBoard.nextContactScanDays');
  for (let d = input.day; d <= input.day + scan; d++) {
    if (recruiting.peekBreaches(input.state, input.ctx, actRef(input, 'contact_off_campus', prospectId, d)).length === 0) return d;
  }
  return null;
}

function row(input: RecruitingBoardInput, rights: Record<RecruitingVerb, RightButton>, prospectId: number): BoardRow | null {
  const page = recruiting.prospectPage(input.state, input.teamId, prospectId);
  if (!page) return null;
  const { names } = input;
  const board = input.state.boards[input.teamId];
  const tie = recruiting.findTie(input.state, prospectId, input.teamId);
  const statusTeam = page.publicStatus.teamId;
  return {
    personId: page.personId, name: names.person(page.personId), classYear: page.classYear, position: page.position, region: page.region,
    heightIn: page.heightIn, weightLb: page.weightLb, source: page.source, publicStars: page.publicStars, publicRank: page.publicRank,
    status: { kind: page.publicStatus.kind, team: statusTeam === null ? null : names.team(statusTeam), ours: statusTeam === input.teamId },
    grade: gradeView(page.grade),
    read: readView(page.read, names),
    circle: page.circle.map((c) => ({ memberId: c.memberId, name: names.person(c.memberId), relation: c.relation, influence: c.influence, caresAbout: [...c.caresAbout], basis: c.basis })),
    firmness: page.firmness ? { ...page.firmness } : null,
    academics: page.academics ? { ...page.academics } : null,
    ourOffer: page.ourOffer ? { ...page.ourOffer } : null,
    otherOffers: page.publicOffers.filter((t) => t !== input.teamId).map((t) => names.team(t)),
    visits: { official: [...(tie?.officialVisits ?? [])], unofficial: [...(tie?.unofficialVisits ?? [])] },
    inQueue: board?.queue.includes(prospectId) ?? false,
    nextContactDay: nextContactDay(input, prospectId),
    actions: actionsFor(input, rights, prospectId),
  };
}

function matches(input: RecruitingBoardInput, p: recruiting.Prospect): boolean {
  const f = input.filter ?? {};
  if (p.classYear !== input.classYear) return false;
  if (f.position && p.position !== f.position) return false;
  if (f.region && p.region !== f.region) return false;
  if (f.source && p.source !== f.source) return false;
  return true;
}

/** Prospect ids for the list, in order: board by our grade (watched first), the pool by public rank. */
export function listIds(input: RecruitingBoardInput, list: BoardList): number[] {
  const { state, teamId } = input;
  const board = state.boards[teamId];
  const ok = (id: number) => { const p = state.prospects[id]; return !!p && matches(input, p); };
  const watched = (id: number) => gradeView(board?.grades[id] ?? null) !== null;
  const byPublic = (a: number, b: number) => (state.prospects[a]!.publicRank ?? Number.MAX_SAFE_INTEGER) - (state.prospects[b]!.publicRank ?? Number.MAX_SAFE_INTEGER) || a - b;
  const onBoard = new Set<number>([...Object.keys(board?.grades ?? {}).map(Number), ...(board?.queue ?? [])]);
  for (const o of state.offers) if (o.teamId === teamId && !o.withdrawn) onBoard.add(o.prospectId);
  if (list === 'pool') return Object.keys(state.prospects).map(Number).filter((id) => ok(id) && !onBoard.has(id)).sort(byPublic);
  if (list === 'queue') return (board?.queue ?? []).filter(ok);
  if (list === 'offered') return state.offers.filter((o) => o.teamId === teamId && !o.withdrawn).map((o) => o.prospectId).filter(ok);
  // Board: watched prospects by our grade (league board order), then the rest by public rank.
  const graded = board ? recruiting.boardOrder(state, teamId, (id) => ok(id) && watched(id)) : [];
  const rest = [...onBoard].filter((id) => ok(id) && !watched(id)).sort(byPublic);
  return [...graded, ...rest];
}

function numbersView(input: RecruitingBoardInput): NumbersView {
  const nb = recruiting.numbersBoard(input.state, input.ctx, input.teamId, input.classYear, input.day);
  return {
    rows: nb.rows.map((r) => ({ ...r })), returning: nb.returning, incoming: nb.incoming, total: nb.total,
    limit: nb.limit ?? null, signeeCap: nb.signeeCap ?? null, placesOpen: recruiting.placesOpen(nb) ?? null,
  };
}

/** Contact periods as stretches of days (T4.2.1) plus the signing dates (T4.5.2) and our official visit count (T4.5.1). */
export function calendarView(input: RecruitingBoardInput): CalendarView {
  const to = input.day + param('recruitingBoard.calendarDays') - 1;
  const stretches: CalendarStretch[] = [];
  for (let d = input.day; d <= to; d++) {
    const period = recruiting.periodOn(input.ctx, d);
    const last = stretches[stretches.length - 1];
    if (last && last.period === period && last.to === d - 1) stretches[stretches.length - 1] = { ...last, to: d };
    else stretches.push({ from: d, to: d, period });
  }
  const rules = input.ctx.rulesOn(input.day);
  const cap = recruiting.num(rules, recruiting.KEY.schoolCap);
  return {
    from: input.day, to, stretches, signing: { ...recruiting.signingDates(input.ctx, input.classYear) },
    visitsHosted: input.state.visitsHosted[`${input.teamId}:${recruiting.recruitingYear(input.day)}`] ?? 0,
    visitCap: cap ?? null,
  };
}

function areaRows(input: RecruitingBoardInput): AreaRow[] {
  const { state, teamId } = input;
  const board = state.boards[teamId];
  const rows = new Map<string, { prospects: number; graded: number; offered: number; committedToUs: number }>();
  const area = input.area ?? null;
  if (area) for (const r of area) rows.set(r, { prospects: 0, graded: 0, offered: 0, committedToUs: 0 });
  const offered = new Set(state.offers.filter((o) => o.teamId === teamId && !o.withdrawn).map((o) => o.prospectId));
  for (const p of Object.values(state.prospects)) {
    if (p.classYear !== input.classYear) continue;
    if (area && !area.includes(p.region)) continue;
    let r = rows.get(p.region);
    if (!r) { r = { prospects: 0, graded: 0, offered: 0, committedToUs: 0 }; rows.set(p.region, r); }
    r.prospects++;
    if (gradeView(board?.grades[p.personId] ?? null)) r.graded++;
    if (offered.has(p.personId)) r.offered++;
    // Public commitments only: a commitment to us is announced to us.
    const page = recruiting.prospectPage(state, teamId, p.personId);
    if (page && page.publicStatus.kind !== 'open' && page.publicStatus.teamId === teamId) r.committedToUs++;
  }
  return [...rows.entries()].map(([region, r]) => ({ region, ...r })).sort((a, b) => b.prospects - a.prospects || (a.region < b.region ? -1 : a.region > b.region ? 1 : 0));
}

function violationRows(input: RecruitingBoardInput): ViolationRow[] {
  return input.state.violations
    .filter((v) => v.teamId === input.teamId)
    .map((v) => ({ logId: v.logId, day: v.day, actor: input.names.person(v.actorId), prospect: v.prospectId === null ? null : input.names.person(v.prospectId), rules: [...v.rules] }))
    .sort((a, b) => b.day - a.day || b.logId - a.logId);
}

function portalView(input: RecruitingBoardInput): PortalView {
  const p = input.portal ?? null;
  if (!p) return { available: false, window: null, openNow: false, rows: [] };
  const w = p.window;
  return {
    available: true, window: w ? { ...w } : null, openNow: !!w && input.day >= w.open && input.day <= w.close,
    rows: p.entries.map((e) => ({ personId: e.personId, name: input.names.person(e.personId), position: e.position, fromTeam: input.names.team(e.fromTeamId), enteredDay: e.enteredDay }))
      .sort((a, b) => b.enteredDay - a.enteredDay || a.personId - b.personId),
  };
}

export function buildRecruitingBoardView(input: RecruitingBoardInput): RecruitingBoardView {
  const { state, teamId } = input;
  const rights = rightsOf(input);
  const list = input.list ?? 'board';
  const ids = listIds(input, list);
  const rows: BoardRow[] = [];
  for (const id of ids.slice(0, param('recruitingBoard.rowsMax'))) {
    const r = row(input, rights, id);
    if (r) rows.push(r);
  }
  const board = state.boards[teamId];
  const classIds = Object.values(state.prospects).filter((p) => p.classYear === input.classYear).map((p) => p.personId);
  const onBoard = listIds({ ...input, filter: {} }, 'board');
  let committed = 0; let signed = 0;
  for (const id of classIds) {
    const page = recruiting.prospectPage(state, teamId, id);
    if (!page || page.publicStatus.teamId !== teamId) continue;
    if (page.publicStatus.kind === 'committed') committed++;
    else if (page.publicStatus.kind === 'signed') signed++;
  }
  const f = input.filter ?? {};
  return {
    teamId, day: input.day, classYear: input.classYear,
    period: recruiting.periodOn(input.ctx, input.day), model: recruiting.modelOn(input.ctx, input.day),
    hoursLeft: input.hoursLeft ?? null, rights, list,
    filter: { position: f.position ?? null, region: f.region ?? null, source: f.source ?? null },
    rows, total: ids.length,
    counts: {
      onBoard: onBoard.length,
      watched: onBoard.filter((id) => gradeView(board?.grades[id] ?? null) !== null).length,
      offers: state.offers.filter((o) => o.teamId === teamId && !o.withdrawn && state.prospects[o.prospectId]?.classYear === input.classYear).length,
      committed, signed,
    },
    numbers: numbersView(input),
    calendar: calendarView(input),
    area: areaRows(input),
    violations: violationRows(input),
    portal: portalView(input),
  };
}
