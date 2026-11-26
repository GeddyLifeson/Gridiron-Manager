// Game plan and call sheet read model (G-68 screens; O3.4.1 game plan builder, O3.4.2 call sheet editor with
// the scripts, wristband, head coach card and pre-lock review, O3.4.3 print). Every figure comes from the
// G-68 module (@gm/football-content gameplan): this file only joins and renders. The screen shows cost and
// never suggests plays (O3.4.1); a coordinator's draft arrives only as a proposal. Readiness is the staff's
// estimate (G5.4.1); no true rating reaches the model (MA-48).
import { gameplan as gp, playbook as pb } from '@gm/football-content';
import type { RuleSet } from '@gm/schema';
import type {
  ApprovalView, BookRow, CardView, GameplanLock, GameplanView, GameplanWarning, MatchupRuleRow, PlanSituation, PlanView, PrintView, ProposalView,
  ReviewView, ScriptRow, ScriptView, SheetView, WristbandView,
} from './types.ts';

export type GameplanUnit = 'offense' | 'defense' | 'special_teams';

/** A delegated draft from a coordinator (K6): the menu he proposes, kept apart from the plan. */
export interface Proposal { readonly id: string; readonly from: string; readonly menu: readonly gp.MenuEntry[] }

/** Everything the builder reads. Owned elsewhere and injected: scouting (H2/G-66), install (G5/H1), readiness (D9), reps (H3), call records (N3), availability (H5). */
export interface GameplanInput {
  readonly teamId: number;
  readonly unit: GameplanUnit;
  readonly holder: pb.Holder;
  readonly book: pb.Playbook;
  readonly words: pb.WordList;
  readonly template: pb.Template;
  /** Coach-to-player cutoff from the rule set (radioRules), for the length check; null = no radio. */
  readonly cutoffS: number | null;
  readonly rules: Pick<RuleSet, 'num'>;
  // ---- plan (G6)
  readonly menu: readonly gp.MenuEntry[];
  readonly board: gp.LooksBoard;
  readonly week: gp.WeekInstall;
  readonly newParts?: readonly gp.NewPart[];
  readonly addedDay?: (entryId: string) => number;
  readonly themes: readonly gp.Theme[];
  readonly sequences: readonly gp.Sequence[];
  readonly culled: number;
  readonly approval: gp.Approval;
  readonly matchups: readonly MatchupRuleRow[];
  readonly proposal: Proposal | null;
  /** Practice reps assigned so far to a plan entry (H3). */
  readonly repsAssigned: (entryId: string) => number;
  readonly repsAvailable: number;
  readonly qbDislikes: ReadonlySet<string>;
  // ---- sheet (G7)
  readonly sheet: gp.Sheet;
  readonly card: gp.HeadCoachCard | null;
  readonly table: gp.ReferenceTable | null;
  /** Staff readiness estimate of a call, 0 to 1, or null when the staff has none. */
  readonly readiness: (c: pb.Call) => number | null;
  /** Times the call was made this season in the given sheet situation (N3); null situation = any. */
  readonly timesCalled: (c: pb.Call, situationId: string | null) => number;
  readonly practiced: (c: pb.Call) => boolean;
  readonly needsDoubtful: (c: pb.Call) => string | null;
  readonly audibleReps: (playId: string) => number;
  // ---- view options
  readonly selectedSituation: string | null;
  readonly paper: gp.Paper;
  readonly keyHints: boolean;
}

const r2 = (x: number): number => Math.round(x * 100) / 100;

export function lockOf(holder: pb.Holder, action: pb.PlaybookAction, side: GameplanUnit): GameplanLock {
  const a = pb.access(holder, action, side);
  return a.allowed ? { allowed: true, heldBy: null, suggest: false } : { allowed: false, heldBy: a.heldBy, suggest: a.suggest };
}

/** The head coach card is the head coach's (G7, career rung); nobody else edits it. */
export function cardLock(holder: pb.Holder): GameplanLock {
  return holder.job === 'head_coach' ? { allowed: true, heldBy: null, suggest: false } : { allowed: false, heldBy: 'head_coach', suggest: false };
}

/** A call as the caller says it (G4); a play missing from the book shows its id, marked broken by the caller of this. */
export function callText(inp: Pick<GameplanInput, 'book' | 'words' | 'template'>, c: pb.Call): string {
  if (!inp.book.plays.has(c.playId) || (c.second && !inp.book.plays.has(c.second.playId))) return gp.callKey(c);
  return pb.renderCall(inp.book, inp.words, inp.template, c).text;
}

export function isBroken(book: pb.Playbook, c: pb.Call): boolean {
  const live = (id: string) => { const p = book.plays.get(id); return !!p && p.status !== 'retired'; };
  return !live(c.playId) || (!!c.second && !live(c.second.playId));
}

export function overLimit(inp: Pick<GameplanInput, 'book' | 'words' | 'template' | 'cutoffS'>, c: pb.Call): boolean {
  if (!inp.book.plays.has(c.playId) || (c.second && !inp.book.plays.has(c.second.playId))) return false;
  const w = pb.lengthWarning(pb.renderCall(inp.book, inp.words, inp.template, c), inp.words, inp.cutoffS, !!c.second);
  return w.overSeconds || w.overWords;
}

const warn = (w: gp.PlanWarning): GameplanWarning => ({ leaf: w.leaf, code: w.code, subject: w.subject, text: w.text, severity: w.severity });

function situationLabel(id: string, sheet: gp.Sheet): string {
  return sheet.situations.find((s) => s.id === id)?.label ?? gp.CATALOGUE_BY_ID.get(id)?.label ?? id;
}

function approvalView(a: gp.Approval): ApprovalView {
  switch (a.state) {
    case 'draft': return { state: 'draft', at: null, by: null, notes: null };
    case 'submitted': return { state: 'submitted', at: a.at, by: null, notes: null };
    case 'approved': return { state: 'approved', at: a.at, by: a.by, notes: null };
    case 'sent_back': return { state: 'sent_back', at: a.at, by: null, notes: a.notes };
  }
}

function proposalView(p: Proposal | null, menu: readonly gp.MenuEntry[]): ProposalView | null {
  if (!p) return null;
  const now = new Set(menu.map((m) => m.id)), next = new Set(p.menu.map((m) => m.id));
  return { id: p.id, from: p.from, entries: p.menu.length, added: [...next].filter((x) => !now.has(x)).sort(), removed: [...now].filter((x) => !next.has(x)).sort() };
}

/** Plays of the unit's book that fit a situation: tagged with it (G3 situations), or all live plays when none is selected. */
function bookRows(inp: GameplanInput, selected: string | null): BookRow[] {
  const inPlan = new Set(inp.menu.map((m) => m.call.playId));
  const out: BookRow[] = [];
  for (const p of inp.book.plays.values()) {
    if (p.book !== inp.unit || p.status === 'retired') continue;
    if (selected !== null && !p.situations.includes(selected)) continue;
    out.push({ playId: p.id, call: callText(inp, { playId: p.id, tags: [] }), section: p.section.join('/'), status: p.status, inPlan: inPlan.has(p.id) });
  }
  return out.sort((a, b) => (a.call < b.call ? -1 : a.call > b.call ? 1 : 0));
}

export function buildPlanView(inp: GameplanInput): PlanView {
  const items = gp.newForWeek(inp.menu, inp.book, inp.week, inp.addedDay, inp.newParts ?? []);
  const meter = gp.installMeter(items, inp.menu, inp.week);
  const newPlays = new Set(items.filter((i) => i.kind === 'play' || i.kind === 'known_concept_new_look').map((i) => i.playId));
  const ids: string[] = [];
  for (const m of inp.menu) for (const s of m.situationIds) if (!ids.includes(s)) ids.push(s);
  const situations: PlanSituation[] = ids.map((id) => ({
    id, label: situationLabel(id, inp.sheet),
    entries: inp.menu.filter((m) => m.situationIds.includes(id)).map((m) => {
      const est = inp.readiness(m.call);
      return {
        entryId: m.id, playId: m.call.playId, call: callText(inp, m.call), readinessEstimate: est === null ? null : r2(est),
        repsAssigned: inp.repsAssigned(m.id), targetReps: m.targetReps, isNew: newPlays.has(m.call.playId), broken: isBroken(inp.book, m.call),
      };
    }),
  }));
  const unique = new Map(inp.menu.map((m) => [m.id, m] as const));
  const bal = gp.balance(inp.menu, inp.book);
  const readinessValues = inp.menu.map((m) => inp.readiness(m.call)).filter((x): x is number => x !== null);
  const repsNeeded = inp.menu.reduce((a, m) => a + m.targetReps, 0);
  const review = gp.reviewPlan({
    menu: inp.menu, culled: inp.culled, themes: inp.themes, sequences: inp.sequences, cells: inp.board.cells, book: inp.book,
    repsNeeded, repsAvailable: inp.repsAvailable,
    projectedReadiness: readinessValues.length ? readinessValues.reduce((a, b) => a + b, 0) / readinessValues.length : 0,
    extra: [...meter.warnings], qbDislikes: [...inp.qbDislikes],
  });
  const selected = inp.selectedSituation;
  return {
    looks: inp.board.cells.map((c) => ({ bucket: c.bucket, look: c.look, count: c.count, n: c.n, rate: c.rate === null ? null : r2(c.rate), lo: c.lo === null ? null : r2(c.lo), hi: c.hi === null ? null : r2(c.hi) })),
    looksStale: inp.board.stale, callerChanged: inp.board.callerChanged,
    situations, selected,
    book: bookRows(inp, selected),
    summary: {
      total: unique.size, newThisWeek: newPlays.size, unitsUsed: r2(meter.units), capacity: meter.capacity,
      repsAssigned: [...unique.keys()].reduce((a, id) => a + inp.repsAssigned(id), 0), repsAvailable: inp.repsAvailable,
      runPass: { run: bal.runPass.run, pass: bal.runPass.pass, other: bal.runPass.other },
    },
    matchups: [...inp.matchups],
    approval: approvalView(inp.approval),
    proposal: proposalView(inp.proposal, inp.menu),
    warnings: review.warnings.map(warn),
  };
}

export function buildSheetView(inp: GameplanInput): SheetView {
  const s = inp.sheet;
  const sits = gp.situationMap(s);
  const keys = gp.keyMap(s);
  const views = new Map(gp.entryViews(s, inp.menu, (c) => inp.readiness(c) ?? 0).map((e) => [`${e.boxId}/${e.entryId}`, e] as const));
  const snaps = new Map(gp.boxSnaps(s, inp.table).map((b) => [b.boxId, b] as const));
  const rules = gp.checkRules(s.boxes, sits, gp.situationGrid());
  const present = new Set<gp.Category>(s.script.length > 0 ? ['script'] : []);
  const catalogue = gp.checkCatalogue(s.boxes, sits, gp.situationGrid(), inp.table, present);
  const d = gp.density(s);
  const size = gp.sizeReport(s, inp.repsAvailable, inp.table);
  return {
    unit: s.unit, gameId: s.gameId, version: s.version, lockedAt: s.lockedAt,
    page: { ...s.page },
    situations: s.situations.map((x) => ({ id: x.id, label: x.label })),
    boxes: gp.readingOrder(s.boxes).map((b) => {
      const sn = snaps.get(b.id);
      return {
        id: b.id, title: b.title, side: b.side, col: b.col, row: b.row, w: b.w, h: b.h, situationId: b.situationId, category: b.category, colour: b.colour,
        key: (keys.boxes.get(b.id) ?? []).join(''), priority: b.priority,
        expectedSnaps: sn?.expected ? r2(sn.expected.value) : null, expectedSource: sn?.expected?.source ?? null, expectedGames: sn?.expected?.games ?? null,
        depthMark: sn?.mark ?? null,
        entries: b.entries.map((e) => {
          const ev = views.get(`${b.id}/${e.id}`);
          const est = inp.readiness(e.call);
          return {
            id: e.id, call: callText(inp, e.call), playId: e.call.playId, key: (keys.entries.get(`${b.id}/${e.id}`) ?? []).join(''),
            readinessEstimate: est === null ? null : r2(est), timesCalled: inp.timesCalled(e.call, b.situationId),
            notInPlan: ev?.notInPlan ?? false, broken: isBroken(inp.book, e.call), overLimit: overLimit(inp, e.call),
            note: e.note ?? null, rank: e.rank ?? null, bandNumber: gp.bandNumberOf(s, e.call),
          };
        }),
      };
    }),
    layoutProblems: gp.layoutProblems(s).map((p) => ({ kind: p.kind, boxes: [...p.boxes] })),
    coverage: gp.coverageMap(s.boxes, sits),
    unmatchedStates: rules.unmatched.length, shadowedStates: rules.shadowed.length,
    catalogue: catalogue.map((c) => ({ id: c.row.id, label: c.row.label, status: c.status, tier: c.tier, expectedSnaps: c.expectedSnaps === null ? null : r2(c.expectedSnaps), severity: c.severity })),
    density: { entriesBySide: [...d.entriesBySide], bandBySide: [...d.bandBySide], smallestTextPt: r2(d.smallestTextPt), overflow: [...d.overflow] },
    size: { unique: size.unique, repsAvailable: size.repsAvailable, overReps: size.overReps },
    tooLongKeys: [...keys.tooLong],
    warnings: size.warnings.map(warn),
  };
}

function scriptRows(inp: GameplanInput, rows: readonly gp.ScriptEntry[]): ScriptRow[] {
  return rows.map((e) => ({ id: e.id, call: callText(inp, e.call), purpose: e.purpose, purposeText: e.purposeText ?? null, watchingFor: e.watchingFor ?? null }));
}

export function buildScriptView(inp: GameplanInput): ScriptView {
  const s = inp.sheet;
  const v = gp.scriptVariety(s.script, inp.book);
  const half = gp.secondHalfLengthNote(s.secondHalfScript.length);
  return {
    mode: s.scriptMode,
    opening: scriptRows(inp, s.script),
    secondHalf: scriptRows(inp, s.secondHalfScript),
    variety: { personnel: { ...v.personnel }, formation: { ...v.formation }, runPass: { ...v.runPass }, direction: { ...v.direction } },
    reveals: [...v.reveals],
    mustCalls: s.mustCalls.map((m) => ({ id: m.id, call: callText(inp, m.call), target: m.target.kind === 'by_half' ? 'by_half' : `at_least:${m.target.times}` })),
    notes: s.notes.map((n) => ({ id: n.id, boxId: n.boxId, kind: n.kind, text: gp.noteLine(n) })),
    warnings: [...gp.checkScript(s.script), ...(half ? [half] : [])].map(warn),
  };
}

export function buildWristbandView(inp: GameplanInput): WristbandView {
  const s = inp.sheet;
  return {
    cells: s.wristband.map((c) => ({ label: c.label, call: callText(inp, c.call) })),
    problems: gp.bandProblems(s.wristband),
    audibles: s.audibleList.map((a) => ({ name: a.name, call: callText(inp, a.call) })),
    relay: s.relayDefault, qbFreedom: s.qbFreedomDefault,
    warnings: gp.checkAudibles(s.audibleList, inp.book, inp.audibleReps).map(warn),
  };
}

export function buildCardView(card: gp.HeadCoachCard | null, rules: Pick<RuleSet, 'num'>): CardView | null {
  if (!card) return null;
  return {
    fourth: card.fourth.map((c) => ({ distanceYd: c.distanceYd, yardsToGoalYd: c.yardsToGoalYd, call: c.call, edited: gp.isEdited(card, 'fourth', `${c.distanceYd}@${c.yardsToGoalYd}`) })),
    twoPoint: card.twoPoint.map((r) => ({ scoreDiff: r.scoreDiff, goForTwo: r.goForTwo, edited: gp.isEdited(card, 'two_point', String(r.scoreDiff)) })),
    kneel: card.kneel.length ? card.kneel.map((k) => ({ ...k })) : gp.kneelTable(rules),
    fieldGoalLine: { ...card.fieldGoalLine },
    inBoundsPlayS: card.inBoundsPlayS,
    timeoutRules: [...card.timeoutRules], crewTendencies: [...card.crewTendencies], trickHistory: [...card.trickHistory],
    depthCard: [...card.depthCard], standingInstructions: [...card.standingInstructions],
    edits: card.edits.map((e) => ({ ...e })), stale: [...card.stale],
  };
}

export function sheetReview(inp: GameplanInput): gp.SheetReview {
  return gp.reviewSheet({
    sheet: inp.sheet, book: inp.book, table: inp.table, practiced: inp.practiced, readiness: (c) => inp.readiness(c) ?? 0,
    overLimit: (c) => overLimit(inp, c), needsDoubtful: inp.needsDoubtful, repsAvailable: inp.repsAvailable, qbDislikes: inp.qbDislikes,
  });
}

export function buildReviewView(inp: GameplanInput): ReviewView {
  const r = sheetReview(inp);
  return { items: r.items.map((x) => ({ ...x })), canLock: inp.sheet.lockedAt === null && !r.items.some((x) => x.blocks), locked: inp.sheet.lockedAt !== null };
}

const PAPER_IN: Readonly<Record<gp.Paper, readonly [number, number]>> = { letter: [11, 8.5], legal: [14, 8.5], tabloid: [17, 11] };

/** O3.4.3 print preview: the same grid as the console scaled to the paper, with or without key hints. */
export function buildPrintView(inp: GameplanInput): PrintView {
  const keys = inp.keyHints ? gp.keyMap(inp.sheet).entries : null;
  const render = (e: gp.Entry, key: string | null): string => {
    const text = callText(inp, e.call);
    const parts = [key ? `${key} ${text}` : text];
    if (e.note) parts.push(`(${e.note})`);
    return parts.join(' ');
  };
  const boxes = gp.printLayout(inp.sheet, inp.paper, render, keys);
  const [long, short] = PAPER_IN[inp.paper];
  const [widthIn, heightIn] = inp.sheet.page.orientation === 'landscape' ? [long, short] : [short, long];
  return {
    paper: inp.paper, keyHints: inp.keyHints, widthIn, heightIn,
    boxes: boxes.map((b) => ({ id: b.id, side: b.side, xIn: r2(b.xIn), yIn: r2(b.yIn), wIn: r2(b.wIn), hIn: r2(b.hIn), textPt: r2(b.textPt), lines: [...b.lines], overflow: b.overflow })),
    overflow: boxes.filter((b) => b.overflow).length,
  };
}

/** Build the whole view (O3.4.1 to O3.4.3). */
export function buildGameplanView(inp: GameplanInput): GameplanView {
  return {
    teamId: inp.teamId, unit: inp.unit,
    locks: { build: lockOf(inp.holder, 'build_plan_and_sheet', inp.unit), approve: lockOf(inp.holder, 'approve', inp.unit), card: cardLock(inp.holder) },
    plan: buildPlanView(inp),
    sheet: buildSheetView(inp),
    script: buildScriptView(inp),
    wristband: buildWristbandView(inp),
    card: buildCardView(inp.card, inp.rules),
    review: buildReviewView(inp),
    print: buildPrintView(inp),
  };
}
