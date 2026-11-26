// Read models for delegation (O4.3.2), meetings (O4.4.2) with the game-week staff one-on-one, the
// decision log (N3) and the glossary (A4, N5.2.1).
import { describe, expect, it } from 'vitest';
import { life, players } from '@gm/career';
import { glossary as gl } from '@gm/football-content';
import type { decisions } from '@gm/models';
import type { staff as staffNs } from '@gm/coach-ai';
import {
  DELEGABLE_TASKS, buildDelegation, presetAssignments, taskHours, recordKey, type DelegationInputs, type PresetId,
} from '../../../src/read-models/delegation/index.ts';
import { FOOTBALL_SUBJECTS, buildMeeting, buildStaffOneOnOne, type MeetingInputs } from '../../../src/read-models/meeting/index.ts';
import { buildDecisionLog } from '../../../src/read-models/decision-log/index.ts';
import { buildGlossary, hoverCard, linkText, termCard } from '../../../src/read-models/glossary/index.ts';

// --- delegation --------------------------------------------------------------------------------------

const HC = 1, OC = 10, DC = 11, QB = 12;
const staff = [
  { personId: OC, name: 'Oscar Coord', titleKey: 'job.oc', available: true, loadHours: 40, capacityHours: 70 },
  { personId: DC, name: 'Dan Coord', titleKey: 'job.dc', available: true, loadHours: 40, capacityHours: 70 },
  { personId: QB, name: 'Quinn Coach', titleKey: 'job.qb', available: true, loadHours: 50, capacityHours: 60 },
];
const tasks = ['calling.offense', 'calling.defense', 'gameplan.offense', 'gameplan.defense', 'film_breakdown.offense', 'opponent_report.defense', 'room.qb', 'install.offense', 'strength.program'];
const defaultOwner: Record<string, number | null> = {
  'calling.offense': OC, 'calling.defense': DC, 'gameplan.offense': OC, 'gameplan.defense': DC, 'film_breakdown.offense': QB,
  'opponent_report.defense': DC, 'room.qb': QB, 'install.offense': OC, 'strength.program': null,
};
const qualified: Record<string, number[]> = Object.fromEntries(tasks.map((t) => [t, t === 'strength.program' ? [] : [defaultOwner[t]!, ...(t.endsWith('offense') ? [HC] : [])]]));
const base: DelegationInputs = { headCoachId: HC, userIsHeadCoach: true, budgetHours: 84, fixedHours: 30, tasks, staff, defaultOwner, qualified, assignments: {} };

/** E7's computation, written out independently: full rows for a kept task, review rows for a proposed one, nothing for decided. */
function e7Hours(assign: Record<string, { holderId: number | null; autonomy: string }>): number {
  const rows: Record<string, [string, number][]> = {
    'calling.offense': [['plan.callSheetBuild', 1]], 'calling.defense': [['plan.callSheetBuild', 1]], 'gameplan.offense': [['plan.sectionBuild', 4]],
    'gameplan.defense': [['plan.sectionBuild', 4]], 'film_breakdown.offense': [['film.opponentOneSide', 3]], 'opponent_report.defense': [['film.reportBuild', 1]],
    'room.qb': [['film.gradeOwnSide', 1]], 'install.offense': [['plan.scriptWrite', 3]], 'strength.program': [],
  };
  let q = life.taskCost('block.scheduled', 1, { blockHours: base.fixedHours }).q;
  for (const t of tasks) {
    const a = assign[t]!;
    for (const [row, units] of rows[t]!) {
      if (a.autonomy === 'keeps') q += life.taskCost(row, units).q;
      else if (a.autonomy === 'proposes' && life.taskRow(row).reviewTask) q += life.taskCost(life.taskRow(row).reviewTask!, units).q;
    }
  }
  return q / life.QUARTERS_PER_HOUR;
}

describe('delegation settings (O4.3.2)', () => {
  it('every L4.1.1 task of the position catalogue has a weekly load', () => {
    for (const t of tasks) expect(DELEGABLE_TASKS).toContain(t);
    expect(taskHours('gameplan.offense')).toEqual({ keeps: 4, proposes: 1, decides: 0 });
    expect(taskHours('adjustments.offense')).toEqual({ keeps: 0, proposes: 0, decides: 0 });
  });

  it('projected hours equal E7\'s computation for the preset tables (acceptance)', () => {
    for (const p of ['ceo', 'offense_caller', 'defense_caller', 'do_everything'] as PresetId[]) {
      const assignments = presetAssignments(p, base);
      const v = buildDelegation({ ...base, assignments });
      expect(v.totals.projectedHours).toBe(e7Hours(assignments));
    }
    const ceo = buildDelegation({ ...base, assignments: presetAssignments('ceo', base) });
    const all = buildDelegation({ ...base, assignments: presetAssignments('do_everything', base) });
    expect(ceo.totals.projectedHours).toBeLessThan(all.totals.projectedHours); // good staff means less work
    expect(ceo.totals.projectedHours).toBe(30);
    expect(all.totals.savedHours).toBe(0);
  });

  it('the offensive play caller keeps his calling and plan, and hands the rest to the staff default', () => {
    const a = presetAssignments('offense_caller', base);
    expect(a['calling.offense']).toEqual({ holderId: null, autonomy: 'keeps' });
    expect(a['gameplan.offense']).toEqual({ holderId: null, autonomy: 'keeps' });
    expect(a['calling.defense']).toEqual({ holderId: DC, autonomy: 'decides' });
    expect(a['room.qb']).toEqual({ holderId: QB, autonomy: 'decides' });
  });

  it('proposing costs the review rows; a task nobody may hold says why; the record is products, never a number about him', () => {
    const v = buildDelegation({
      ...base, assignments: { 'gameplan.offense': { holderId: OC, autonomy: 'proposes' } },
      records: { [recordKey(OC, 'gameplan.offense')]: { products: 11, held: 9, replaced: 1, eventIds: [5, 6] } },
      statements: [{ personId: OC, textKey: 'staff.say.wants_more', eventId: 77, wants: 'more' }],
    });
    const plan = v.rows.find((r) => r.taskId === 'gameplan.offense')!;
    expect(plan).toMatchObject({ autonomy: 'proposes', coachHours: 1, hoursSaved: 3, record: { products: 11, held: 9 } });
    const strength = v.rows.find((r) => r.taskId === 'strength.program')!;
    expect(strength.candidates).toEqual([]);
    expect(strength.blockedKey).toBe('dg.blocked.noQualified');
    expect(v.statements).toHaveLength(1);
    expect(JSON.stringify(v)).not.toMatch(/candor|ego|workHabits|loyalty|facet|skill/i);
  });

  it('an absent holder hands the task back; delegated work lands on the assistant\'s own week', () => {
    const away = staff.map((s) => (s.personId === QB ? { ...s, available: false } : s));
    const v = buildDelegation({ ...base, staff: away, assignments: { 'room.qb': { holderId: QB, autonomy: 'decides' } } });
    expect(v.rows.find((r) => r.taskId === 'room.qb')).toMatchObject({ holderId: null, autonomy: 'keeps', coachHours: 2 });
    const full = buildDelegation({ ...base, assignments: presetAssignments('ceo', base) });
    const qb = full.staff.find((s) => s.personId === QB)!;
    expect(qb.delegatedHours).toBe(taskHours('room.qb').keeps + taskHours('film_breakdown.offense').keeps);
    expect(qb.overloaded).toBe(false); // 50 + 5.75 inside 60
    const tight = buildDelegation({ ...base, staff: staff.map((s) => (s.personId === QB ? { ...s, capacityHours: 55 } : s)), assignments: presetAssignments('ceo', base) });
    expect(tight.staff.find((s) => s.personId === QB)!.overloaded).toBe(true); // E7.3.1 rule 3
  });

  it('below head coach the table is read only', () => {
    expect(buildDelegation({ ...base, userIsHeadCoach: false }).readOnly).toBe(true);
  });
});

// --- meetings -------------------------------------------------------------------------------------------

const d = (dayIndex: number) => ({ seasonYear: 2030, dayIndex });
const promise = (over: Partial<players.LedgerPromise>): players.LedgerPromise => ({
  id: 1, fromPersonId: HC, toPersonId: 200, type: 'start', measure: { games: 2 }, madeOn: d(10), due: d(40), status: 'open', room: 'wr', onBehalfOf: null,
  rung: 'head_coach', beyondAuthority: false, fromRecruiting: false, pathBack: false, ...over,
});
const meetingBase: MeetingInputs = {
  userId: HC, rung: 'head_coach', playerContracts: true, today: d(50),
  subject: { personId: 200, name: 'Will Receiver', roleKey: 'role.backup', depthChartRole: 'rotation', mood: { textKey: 'mood.frustrated', reasons: [{ textKey: 'reason.snaps_down', eventId: 9 }], trend: 'down' }, lastTalk: null, imported: false, positionCoachId: QB },
  promises: [promise({}), promise({ id: 2, toPersonId: 201, status: 'kept', due: d(20) }), promise({ id: 3, fromPersonId: QB, onBehalfOf: HC, due: d(60) }), promise({ id: 4, fromPersonId: 99, onBehalfOf: null })],
  wordEvents: [{ kind: 'promise_kept', sourceEventId: 30 }, { kind: 'promise_broken', sourceEventId: 31 }, { kind: 'caught_falsehood', sourceEventId: 32 }],
};

describe('meeting and conversation screen (O4.4.2)', () => {
  it('every conversation offered renders at least two responses, each with a stance (acceptance)', () => {
    const v = buildMeeting(meetingBase);
    expect(v.subjects.length).toBe(players.typesOffered('head_coach', true).length);
    for (const s of v.subjects) {
      expect(s.responses.length).toBeGreaterThanOrEqual(2);
      for (const r of s.responses) expect(['honest', 'encouraging', 'demanding', 'promise', 'hand_off']).toContain(r.stance);
    }
  });

  it('a promise the depth chart contradicts is flagged as a lie risk', () => {
    const role = buildMeeting(meetingBase).subjects.find((s) => s.typeId === 'role_definition')!;
    expect(role.responses.find((r) => r.promiseType === 'start')!.lieRisk).toBe(true);
    expect(role.responses.find((r) => r.promiseType === 'compete')!.lieRisk).toBe(false);
    const starter = buildMeeting({ ...meetingBase, subject: { ...meetingBase.subject!, depthChartRole: 'starter' } }).subjects.find((s) => s.typeId === 'role_definition')!;
    expect(starter.responses.find((r) => r.promiseType === 'start')!.lieRisk).toBe(false);
  });

  it('every promise the user answers for is in the tracker, open first, overdue marked (acceptance)', () => {
    const v = buildMeeting(meetingBase);
    expect(v.tracker.map((p) => p.promiseId)).toEqual([1, 3, 2]);
    expect(v.tracker.find((p) => p.promiseId === 3)!.madeByAssistant).toBe(true);
    expect(v.subject!.openPromises.map((p) => p.promiseId)).toEqual([1, 3]);
    expect(buildMeeting({ ...meetingBase, today: d(45) }).tracker[0]!.overdue).toBe(true);
  });

  it('honesty shows the logged events, never coach_word; morale is a word read', () => {
    const v = buildMeeting(meetingBase);
    expect(v.honesty).toMatchObject({ kept: 1, broken: 1, caughtOut: 1, contradictedInPublic: 0, eventIds: [30, 31, 32] });
    expect(JSON.stringify(v)).not.toMatch(/coach_?word|"value":|satisfaction/i);
    expect(v.subject!.mood!.textKey).toBe('mood.frustrated');
  });

  it('imported real players: football subjects only (A6); below position coach no promise authority', () => {
    const v = buildMeeting({ ...meetingBase, subject: { ...meetingBase.subject!, imported: true } });
    for (const s of v.subjects) expect(FOOTBALL_SUBJECTS).toContain(s.typeId);
    const ga = buildMeeting({ ...meetingBase, rung: 'graduate_assistant' });
    expect(ga.mayPromise).toBe(false);
  });

  it('the staff one-on-one shows what he learned and what he suggests, in words and counts', () => {
    const agenda: staffNs.OneOnOneAgenda = {
      staffId: OC, history: { safety: 1, responses: [], pushesThisSeries: 0 }, weighed: [],
      learned: [{ staffId: OC, type: 'fourth_down', bucket: 'short_opp', chosen: 'go', times: 7, of: 9, decisionIds: ['a'] }],
      suggestions: [{ staffId: OC, type: 'fourth_down', bucket: 'short_opp', yourHabit: 'go', times: 7, of: 9, hisPick: 'field_goal', gap: 0.03, decisionIds: ['a'] }],
    };
    const labels = { type: (t: string) => `dt.${t}`, bucket: (b: string) => `bucket.${b}`, option: (t: string, o: string) => `opt.${t}.${o}` };
    const v = buildStaffOneOnOne({ personId: OC, name: 'Oscar Coord', titleKey: 'job.oc' }, agenda, labels, life.taskCost('people.staffTalk', 1, { long: true }).hours, [{ boxId: 'b1', callKey: 'call.a', removedWeeks: 1 }, { boxId: 'b2', callKey: 'call.b', removedWeeks: 3 }]);
    expect(v.sheetSuggestions.map((s) => s.boxId)).toEqual(['b2', 'b1']);
    expect(v.hours).toBe(0.5);
    expect(v.learned[0]).toMatchObject({ typeKey: 'dt.fourth_down', chosenKey: 'opt.fourth_down.go', times: 7, of: 9 });
    expect(v.suggestions[0]).toMatchObject({ index: 0, habitKey: 'opt.fourth_down.go', pickKey: 'opt.fourth_down.field_goal' });
    expect(JSON.stringify(v)).not.toMatch(/gap|safety|candor/);
  });
});

// --- decision log -----------------------------------------------------------------------------------------

function dv(id: string, over: { type?: string; teamId?: number; actor?: 'user' | 'staff'; date?: string; play?: number; model?: decisions.ModelView | null; outcome?: decisions.DecisionOutcome | null } = {}): decisions.DecisionView {
  const record = {
    id, time: { worldDate: over.date ?? '2030-10-05', gameId: 7, playIndex: over.play ?? 1, period: 4, gameClockTenths: 900 },
    actor: { kind: over.actor ?? 'user', personId: HC }, rung: 'head_coach', type: over.type ?? 'fourth_down', owner: 'I5', teamId: over.teamId ?? 3,
    situation: {}, options: [{ optionId: 'go', labelKey: 'opt.go', detail: null }, { optionId: 'punt', labelKey: 'opt.punt', detail: null }], chosen: 'go',
    information: [{ source: 'scouting.tendencies', viewed: false, value: 1, modelLacks: null }], timeTaken: { tenthsFromPrompt: 85, playClockLeftTenths: 120 },
    attribution: { creditedPersonId: HC, basis: over.actor === 'staff' ? 'delegated' : 'own_decision', viaPersonId: null }, notMade: false, supersedes: null, snapshotId: null, violationLogId: null,
  } as unknown as decisions.DecisionRecord;
  return { record, modelView: over.model === undefined ? null : over.model, outcome: over.outcome ?? null, followUps: [], supersededBy: [] };
}
const gm = (cls: decisions.DecisionClass, cost: number): decisions.ModelView => ({
  kind: 'game_management', modelId: 'wp.v1', chosen: 'go', best: cls === 'clearly_wrong' ? 'punt' : 'go', cost, margin: 0.01, class: cls, lacks: ['injured kicker'],
  options: [{ optionId: 'go', value: 0.4, low: 0.38, high: 0.42, sparse: false }, { optionId: 'punt', value: 0.4 + cost, low: 0.4, high: 0.45, sparse: true }],
});

describe('decision log (N3)', () => {
  const views = [
    dv('a', { model: gm('clearly_right', 0), outcome: { result: { converted: true }, luck: null } }),
    dv('b', { play: 30, model: gm('clearly_wrong', 0.05) }),
    dv('c', { type: 'offensive_play_call', play: 5, model: { kind: 'play_call', modelId: 'ep.v1', foresight: 0.12, foresightSample: 140, predictability: 0.6 } }),
    dv('d', { type: 'depth_chart_change', date: '2030-10-02', model: { kind: 'none', followUps: ['2030-10-30'] } }),
    dv('e', { actor: 'staff', play: 12 }),
    dv('x', { teamId: 9 }),
  ];
  it('shows every decision of the team, newest first, with the model\'s view and outcome', () => {
    const v = buildDecisionLog(views, 3);
    expect(v.total).toBe(5);
    expect(v.rows.map((r) => r.id)).toEqual(['b', 'e', 'c', 'a', 'd']);
    const b = v.rows[0]!;
    expect(b.model).toMatchObject({ kind: 'game_management', class: 'clearly_wrong', bestLabelKey: 'opt.punt', lacks: ['injured kicker'], sparse: true });
    expect(v.rows.find((r) => r.id === 'a')!.outcome).toEqual({ result: { converted: true }, luck: null });
    expect(v.rows.find((r) => r.id === 'c')!.model).toMatchObject({ kind: 'play_call', foresightSample: 140 });
    expect(v.rows.find((r) => r.id === 'd')!.model).toMatchObject({ kind: 'follow_up', due: ['2030-10-30'] });
    expect(v.rows.find((r) => r.id === 'e')!.model.kind).toBe('pending');
    expect(v.summary).toMatchObject({ clearlyRight: 1, clearlyWrong: 1, tossUp: 0, costTotal: 0.05, pendingModel: 1 });
    expect(v.types).toEqual(['offensive_play_call', 'fourth_down', 'depth_chart_change']);
  });
  it('filters by scope, type, who and clearly wrong; a play call is never classed', () => {
    expect(buildDecisionLog(views, 3, { scope: 'week' }).rows.map((r) => r.id)).toEqual(['d']);
    expect(buildDecisionLog(views, 3, { who: 'staff' }).rows.map((r) => r.id)).toEqual(['e']);
    expect(buildDecisionLog(views, 3, { clearlyWrongOnly: true }).rows.map((r) => r.id)).toEqual(['b']);
    expect(buildDecisionLog(views, 3, { type: 'offensive_play_call' }).rows[0]!.model).not.toHaveProperty('class');
  });
  it('never carries a truth view', () => {
    expect(JSON.stringify(buildDecisionLog(views, 3))).not.toMatch(/hindsight|engineForesight|truth/);
  });
});

// --- glossary -------------------------------------------------------------------------------------------

describe('glossary (A4) and term links (N5.2.1)', () => {
  it('lists every term at the save\'s level with its computed status and sources', () => {
    const pro = buildGlossary('pro');
    const college = buildGlossary('college');
    const both = gl.TERMS.filter((t) => t.level === 'both').length;
    expect(pro.rows.length).toBe(both + gl.TERMS.filter((t) => t.level === 'pro').length);
    expect(college.rows.length).toBe(both + gl.TERMS.filter((t) => t.level === 'college').length);
    expect(buildGlossary('pro', { levelOnly: false }).rows.length).toBe(gl.TERMS.length);
    for (const r of pro.rows) expect(['Verified', '2 of 3', '1 of 3', 'Rulebook only', 'Conflict', 'Assumption', 'Unverified']).toContain(r.status);
    const card = termCard(pro.rows[0]!.id, 'pro')!;
    expect(card.sources.length).toBeGreaterThan(0);
    expect(card.status).toBe(gl.glossaryFactStatus(card.factRow));
  });
  it('search matches term, alias or definition; flagged shows only terms short of Verified', () => {
    const blitz = buildGlossary('pro', { query: 'blitz' });
    expect(blitz.rows.some((r) => r.term.toLowerCase() === 'blitz')).toBe(true);
    for (const r of buildGlossary('pro', { flaggedOnly: true }).rows) expect(r.status).not.toBe('Verified');
  });
  it('links terms in free text at the level in play and gives a hover card', () => {
    const segs = linkText('Bring a blitz on third down.', 'pro');
    const term = segs.find((s) => s.kind === 'term');
    expect(term).toBeDefined();
    const hc = hoverCard((term as { id: string }).id, 'pro')!;
    expect(hc.definition.length).toBeGreaterThan(0);
    expect(segs.map((s) => s.text).join('')).toBe('Bring a blitz on third down.');
  });
});
