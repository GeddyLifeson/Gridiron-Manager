// Recruiting board screen (O7.5.1): renders in the shell for league.recruiting, shows grades only with
// grader, date, amount watched and confidence in words (MA-48), keeps acts that break a rule offered and
// marked (L8.2.5), hides verbs outside the job and labels suggestions (S3), and reads colours from theme
// tokens only (Classic theme, PV-18).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Shell } from '../../../src/shell/index.ts';
import { RecruitingScreen, recruitingRoute, rb, rbTextIds, hasRbText, SCREEN_ID, type RecruitingUi, type Tab, type UiRow } from '../../../src/screens/recruiting/index.ts';

const watched = {
  value: 72, scaleMax: 100, grader: 'position_coach' as const, lastLookDay: 500, looks: [{ kind: 'full_film', count: 2 }, { kind: 'live', count: 1 }],
  confidence: 'fair' as const, band: { production: 4.2, athletic: 5, measurables: 8, character: 9 }, measured: null, userGrade: null,
};
function row(personId: number, over: Partial<UiRow> = {}): UiRow {
  return {
    personId, name: `Prospect ${personId}`, classYear: 2027, position: 'DB', region: 'TX', heightIn: 72, weightLb: 190, source: 'high_school',
    publicStars: 4, publicRank: personId, status: { kind: 'open', team: null, ours: false }, grade: null,
    read: { standing: 'warm', basis: 'family_says', asOf: 490, reasons: [{ key: 'playingTime', positive: true, basis: 'family_says', day: 490 }], rivals: [{ team: 'Team 4', basis: 'visit_taken', day: 480 }] },
    circle: [{ memberId: 9, name: 'Parent 9', relation: 'parent', influence: 'decides', caresAbout: ['academics'], basis: 'family_says' }],
    firmness: null, academics: { word: 'on_track', basis: 'transcript', day: 470 }, ourOffer: null, otherOffers: ['Team 2'],
    visits: { official: [], unofficial: [480] }, inQueue: false, nextContactDay: 530,
    actions: [
      { kind: 'evaluation', verb: 'evaluate', hours: 6, button: 'do_it', breaches: [], warning: null },
      { kind: 'contact_off_campus', verb: 'contact', hours: 5, button: 'do_it', breaches: ['contact_out_of_period'], warning: { classId: 'recruiting_contact', ruleText: 'rule.recruiting_contact', body: 'association', penaltyText: 'league_default' } },
    ],
    ...over,
  };
}
function view(over: Partial<RecruitingUi> = {}): RecruitingUi {
  return {
    teamId: 1, day: 500, classYear: 2027, period: 'evaluation', model: 'days_2025', hoursLeft: 31,
    rights: { evaluate: 'do_it', contact: 'do_it', visit: 'do_it', offer: 'suggest', plan: 'none' },
    list: 'board', filter: { position: null, region: null, source: null },
    rows: [row(1, { grade: watched }), row(2)], total: 2,
    counts: { onBoard: 2, watched: 1, offers: 0, committed: 0, signed: 0 },
    numbers: { rows: [{ position: 'DB', returning: 15, target: 5, committed: 1, signed: 0, offersOut: 7, open: -1, heldForTransfer: 1 }], returning: 15, incoming: 1, total: 16, limit: 105, signeeCap: null, placesOpen: 20 },
    calendar: { from: 500, to: 619, stretches: [{ from: 500, to: 525, period: 'evaluation' }, { from: 526, to: 619, period: 'dead' }], signing: { earlyOpen: 700, earlyClose: 702, february: 760 }, visitsHosted: 3, visitCap: null },
    area: [{ region: 'TX', prospects: 40, graded: 6, offered: 2, committedToUs: 1 }],
    violations: [{ logId: 7, day: 495, actor: 'Coach 101', prospect: 'Prospect 2', rules: ['contact_out_of_period'] }],
    portal: { available: false, window: null, openNow: false, rows: [] },
    ...over,
  };
}
const day = (d: number) => `D${d}`;
const html = (v: RecruitingUi | null, tab: Tab = 'board', cardId: number | null = null, readOnly = false) =>
  renderToStaticMarkup(createElement(RecruitingScreen, { view: v, tab, cardId, readOnly, dayLabel: day, onTab: () => {}, onCard: () => {}, onIntent: () => {} }));

describe('recruiting board screen (O7.5.1)', () => {
  it('renders inside the shell at its registry route', () => {
    const out = renderToStaticMarkup(createElement(Shell, { initialPath: '/league/recruiting?tab=board', routes: { [SCREEN_ID]: recruitingRoute({ view: () => view(), dispatch: () => {} }) } }));
    expect(out).toContain(`data-screen="${SCREEN_ID}"`);
  });
  it('a watched prospect shows the grade and confidence; an unwatched one says so (MA-48)', () => {
    const out = html(view());
    expect(out).toContain(rb('rb.grade.value', { value: 72, max: 100 }));
    expect(out).toContain(rb('rb.grade.confidence', { word: rb('rb.grade.confidence.fair') }));
    expect(out).toContain(rb('rb.grade.none'));
  });
  it('the card names grader, date and amount watched; the band is behind a button', () => {
    const out = html(view(), 'board', 1);
    expect(out).toContain(rb('rb.grade.by', { grader: rb('rb.grade.grader.position_coach'), date: 'D500', watched: '2 full film, 1 seen live' }));
    expect(out).toContain(rb('rb.grade.showBand'));
    expect(out).not.toContain(rb('rb.grade.band', { family: 'production', width: '4.2' }));
  });
  it('an act that breaks a rule stays offered, marked with the rule (L8.2.5)', () => {
    const out = html(view(), 'board', 2);
    expect(out).toMatch(/data-act="contact_off_campus" data-breaks="yes"><button type="button">/);
    expect(out).toContain(rb('rb.act.breaks', { rules: rb('rb.breach.contact_out_of_period') }));
    expect(out).toContain('data-act="evaluation" data-breaks="no"');
  });
  it('offers are suggestions for an assistant; a verb outside the job is not shown (S3)', () => {
    const out = html(view(), 'board', 2);
    expect(out).toContain(rb('rb.act.suggest', { act: rb('rb.act.offer') }));
    const none = html(view({ rights: { evaluate: 'do_it', contact: 'do_it', visit: 'do_it', offer: 'none', plan: 'none' } }), 'board', 2);
    expect(none).not.toContain('data-act="offer"');
  });
  it('read-only seats see the card without working buttons', () => {
    const out = html(view(), 'board', 2, true);
    expect(out).toMatch(/data-act="evaluation" data-breaks="no"><button type="button" disabled="">/);
  });
  it('calendar, numbers, area, violations and portal tabs render their data', () => {
    expect(html(view(), 'calendar')).toContain(rb('rb.cal.stretch', { from: 'D526', to: 'D619', period: rb('rb.period.dead') }));
    expect(html(view(), 'calendar')).toContain(rb('rb.cal.february', { date: 'D760' }));
    expect(html(view(), 'numbers')).toContain('data-position="DB"');
    expect(html(view(), 'area')).toContain('data-region="TX"');
    expect(html(view(), 'violations')).toContain('data-log="7"');
    expect(html(view(), 'portal')).toContain(rb('rb.portal.none'));
  });
  it('no view says why', () => {
    expect(html(null)).toContain(rb('rb.empty'));
  });
  it('every string id the screen uses exists, and no literal colour is written', () => {
    const src = readFileSync(new URL('../../../src/screens/recruiting/RecruitingScreen.tsx', import.meta.url), 'utf8');
    const ids = [...src.matchAll(/rb\('([a-z0-9_.A-Z]+)'/g)].map((m) => m[1]!);
    for (const id of ids) expect(hasRbText(id), id).toBe(true);
    for (const p of [...src.matchAll(/rb\(`([a-z0-9_.A-Z]+)\.\$\{/g)].map((m) => m[1]!)) expect(rbTextIds().some((k) => k.startsWith(`${p}.`)), p).toBe(true);
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgb\(/);
  });
});
