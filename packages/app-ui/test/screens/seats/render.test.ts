// G-79 seat panels render each seat's lower panel, keyboard-reachable controls are real buttons, and every text
// id the panels use exists (O6.6.1).
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RoleReportPanel, SeatPanel, missingSeatText, type SeatPanelView } from '../../../src/screens/seats/index.ts';

const base: SeatPanelView = {
  role: 'booth_coverage', location: 'booth', channel: 'offense', canPickChannel: false, channels: ['offense'], noHeadset: false,
  panel: 'pick_lists', task: 'name_look', view: 'booth_overhead', zoomMin: 0, gameWaits: false,
  open: { ask: 'coverage', secondsLeft: 4, phase: 'post' }, pad: [{ family: 'cover3', variants: ['buzz', 'sky'] }, { family: 'cover1', variants: [] }],
  corrections: [], correctionsLeft: 0, onField: null, line: [{ id: 1, kind: 'report', fromSeat: 2, text: 'look: cover3/buzz' }], queued: [], simulated: false,
};
const html = (v: SeatPanelView | null, extra: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(SeatPanel, { view: v, send: () => {}, ...extra }));

describe('seat panels', () => {
  it('booth eyes: pick lists by family and variant, the timer, the booth line', () => {
    const out = html(base);
    for (const s of ['Booth eyes, coverage, booth, offense channel', 'coverage: 4 s', 'Name the look', '>cover3<', '>buzz<', 'look: cover3/buzz']) expect(out).toContain(s);
    expect(out.match(/<button/g)?.length).toBe(5);
  });
  it('against tempo the pad asks for the family only', () => {
    const out = html({ ...base, open: { ask: 'family', secondsLeft: 2, phase: 'post' } });
    expect(out).toContain('Family only');
    expect(out).not.toContain('>buzz<');
  });
  it('position coach: corrections with three ways to give each, and the count on the field', () => {
    const out = html({ ...base, role: 'position_bench', location: 'sideline', panel: 'position_group', view: 'sideline', corrections: [{ id: 'c:1', playerId: 72, kind: 'wide_set_late' }], correctionsLeft: 2, onField: 11 });
    for (const s of ['Corrections (2 left this series)', '#72 wide set late', 'Tell him', 'Show him', 'Walk him through it', '11 on the field']) expect(out).toContain(s);
  });
  it('head coach picks a channel; a seat with no headset says so; a caller shows the call sheet passed in', () => {
    expect(html({ ...base, role: 'head_coach', canPickChannel: true, channels: ['offense', 'defense', 'analyst'] })).toContain('Listen to');
    expect(html({ ...base, noHeadset: true })).toContain('No headset');
    expect(html({ ...base, role: 'caller_offense', panel: 'call_sheet' }, { callSheet: createElement('div', null, 'SHEET') })).toContain('SHEET');
    expect(html(null)).toContain('No seat today');
  });
  it('role report: measures, "not enough yet", and entries beside the film', () => {
    const out = renderToStaticMarkup(createElement(RoleReportPanel, { view: {
      games: 1, accuracyPct: 75, families: [{ family: 'cover3', pct: 75, n: 12 }, { family: 'cover1', pct: null, n: null }], medianSeconds: 3,
      adviceMatchedPct: null, adviceWorkedPct: null, correctionsGiven: 0, correctionsWorked: 0, signalErrorsPerGame: 0, lateRelaysPerGame: 0, estimated: false,
      events: [{ kind: 'booth', playId: 4, yours: 'cover3/sky', film: 'cover3/buzz', seconds: 2.5, estimated: false }],
    } }));
    for (const s of ['Role report', 'Recognition: 75% right', 'cover3: 75% of 12', 'cover1: not enough yet', 'You said', 'Film shows', 'cover3/buzz']) expect(out).toContain(s);
  });
  it('every text id the panels use exists', () => {
    const src = readFileSync(join(import.meta.dirname, '..', '..', '..', 'src', 'screens', 'seats', 'SeatPanel.tsx'), 'utf8');
    const ids = [...src.matchAll(/st\('([a-zA-Z0-9_.]+)'/g)].map((m) => m[1]!);
    expect(ids.length).toBeGreaterThan(20);
    expect(missingSeatText(ids)).toEqual([]);
    const dyn = ['panel.', 'role.', 'loc.', 'ch.'];
    const text = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', '..', 'src', 'screens', 'seats', 'text.json'), 'utf8')) as { strings: Record<string, string> };
    for (const p of dyn) expect(Object.keys(text.strings).some((k) => k.startsWith(p))).toBe(true);
  });
});
