// Defensive call designer screen (G-91, O3.2.1, O3.7.2). The fixtures in views.json are real read-model
// output (app-services defenseDesignerView bound to the football-content designer core): Nickel 1 Robber
// against the empty look (a check fires, the Mike selected, hours strip set) and a college view with a
// flagged gap and an uncovered eligible. Checks: every region renders from the view, gap labels carry one
// name per gap with zero/two flagged, the right panel shows responsibility by action, the checks table has
// one row per look, findings for the shown look come first, the route keeps look/slot/family in the view
// options, and no literal display text sits in the screen code.
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Shell, SCREENS, type ScreenProps } from '../../../src/shell/index.ts';
import {
  DefenseDesignerScreen, defenseDesignerRoute, designerTextIds, dt, dutyText, canvasMap, parseQuery, parseFamily,
  DEFENSE_DESIGNER_SCREEN_ID, RUN_FAMILY_IDS, type DefenseDesignerView, type DefenseDesignerQuery,
} from '../../../src/screens/defense-designer/index.ts';
import VIEWS from './views.json';

const here = dirname(fileURLToPath(import.meta.url));
const base = VIEWS.base as unknown as DefenseDesignerView;
const flagged = VIEWS.flagged as unknown as DefenseDesignerView;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const html = (v: DefenseDesignerView, extra: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(DefenseDesignerScreen, { view: v, ...extra }));

describe('O3.2.1 layout', () => {
  it('draws the canvas with eleven defenders, every offensive player and the gap labels', () => {
    const out = html(base);
    expect(base.defenders).toHaveLength(11);
    for (const d of base.defenders) expect(out).toContain(`data-def="${d.slot}"`);
    for (const p of base.offense) expect(out).toContain(`data-off="${p.role}"`);
    for (const g of base.gaps) expect(out).toContain(`data-gap="${g.side}:${g.gap}"`);
    expect(out).toContain('data-los=""');
    const m = canvasMap(base);
    expect(m.width).toBeCloseTo(2 * base.field.halfWidthYd, 6);
    expect(m.y(0)).toBeGreaterThan(m.y(5));
  });

  it('zone droppers draw their window; the selected one is highlighted', () => {
    const out = html(base);
    for (const d of base.defenders.filter((x) => x.zone !== null)) expect(out).toContain(`data-zone="${d.slot}"`);
    expect(out).toContain(`data-def="${base.selected}" data-selected="1"`);
  });

  it('left: the layers in order (package, front, stunts, pressure, coverage, checks, disguise)', () => {
    const out = html(base);
    const order = ['package', 'front', 'stunts', 'pressure', 'coverage', 'checks', 'disguise'].map((k) => out.indexOf(`data-layer="${k}"`));
    for (const i of order) expect(i).toBeGreaterThan(-1);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(out).toContain(esc(base.layers.coverage.name));
  });

  it('right: the selected defender with alignment, technique, key and responsibility by action', () => {
    const out = html(base);
    const d = base.defenders.find((x) => x.slot === base.selected)!;
    for (const k of ['align', 'technique', 'key', 'run_to', 'run_away', 'pass']) expect(out).toContain(`data-row="${k}"`);
    expect(out).toContain(esc(dutyText(d.pass)));
    expect(out).toContain(esc(dutyText(d.runTo)));
    expect(html({ ...base, selected: null })).toContain(esc(dt('dd.defender.none')));
  });

  it('a lineman shows his technique label and his key', () => {
    const dl = base.defenders.find((x) => x.technique !== null && x.key !== null)!;
    const out = html({ ...base, selected: dl.slot });
    expect(out).toContain(`>${esc(dl.technique!)}<`);
    expect(out).toContain(`>${dl.key}<`);
  });

  it('bottom: validator messages, the shown look first', () => {
    const out = html(base);
    expect(base.findings.length).toBeGreaterThan(0);
    const firstOther = base.findings.findIndex((f) => f.lookId !== null && f.lookId !== base.look.id);
    const lastMine = base.findings.map((f) => f.lookId === base.look.id).lastIndexOf(true);
    if (firstOther >= 0 && lastMine >= 0) expect(lastMine).toBeLessThan(firstOther);
    expect(out).toContain('data-view="findings"');
    expect(out).toContain(`data-code="${base.findings[0]!.code}"`);
    expect(html({ ...base, findings: [] })).toContain(esc(dt('dd.findings.none')));
  });

  it('the checks table has one row per look in the switcher set, with the adjustment that fires', () => {
    const out = html(base);
    expect(base.checks.map((c) => c.lookId)).toEqual(base.looks.map((l) => l.id));
    for (const c of base.checks) expect(out).toContain(`data-look="${c.lookId}" data-current="${c.lookId === base.look.id ? 1 : 0}"`);
    const fired = base.checks.find((c) => c.lookId === base.look.id)!;
    expect(fired.checkId).toBe(base.checkApplied!.id);
    expect(out).toContain(esc(fired.note!));
  });

  it('gap labels: one name per gap; a gap with zero or two names is flagged (acceptance: named defender or validator message)', () => {
    const out = html(flagged);
    const bad = flagged.gaps.filter((g) => g.flag !== 'ok');
    expect(bad.length).toBeGreaterThan(0);
    for (const g of flagged.gaps) {
      expect(g.flag).toBe(g.owners.length === 0 ? 'none' : g.owners.length > 1 ? 'double' : 'ok');
      expect(out).toContain(`data-gap="${g.side}:${g.gap}" data-flag="${g.flag}"`);
    }
    for (const g of bad.filter((x) => x.flag === 'none')) expect(flagged.findings.some((f) => f.code === 'gap.unowned' && f.lookId === flagged.look.id && f.message.startsWith(`${g.side} ${g.gap}`))).toBe(true);
    for (const r of flagged.uncovered) expect(flagged.findings.some((f) => f.code === 'coverage.uncovered' && f.lookId === flagged.look.id)).toBe(true);
    expect(out).toContain('data-flag="uncovered"');
  });
});

describe('O3.7.2 hours strip', () => {
  it('shows hours used, hours left and the owner, with a hand-to control only when a handler is given', () => {
    const out = html(base, { onHandTo: () => {} });
    expect(out).toContain(esc(dt('dd.hours.used', { h: base.hours!.usedH.toFixed(1) })));
    expect(out).toContain(esc(dt('dd.hours.left', { h: base.hours!.leftH.toFixed(1) })));
    expect(out).toContain(esc(dt('dd.hours.hand_to')));
    expect(html(base)).not.toContain(esc(dt('dd.hours.hand_to')));
    expect(html({ ...base, hours: { ...base.hours!, owner: 'assistant', ownerName: 'A. Coach' } })).toContain(esc(dt('dd.hours.owner.assistant', { name: 'A. Coach' })));
    expect(html({ ...base, hours: null })).toContain(esc(dt('dd.hours.none')));
  });
});

describe('text', () => {
  it('every duty, area, technique, shell, family and severity the views use has a text id', () => {
    const ids = new Set(designerTextIds());
    for (const v of [base, flagged]) {
      for (const d of v.defenders) for (const x of [d.runTo, d.runAway, d.pass]) {
        if (x === null) continue;
        const t = dutyText(x);
        expect(t.startsWith('dd.')).toBe(false);
        if (x.area !== null) expect(ids.has(`dd.area.${x.area}`)).toBe(true);
      }
      for (const f of v.findings) expect(ids.has(`dd.severity.${f.severity}`)).toBe(true);
      expect(ids.has(`dd.pfam.${v.pressure.family}`)).toBe(true);
      expect(ids.has(`dd.shell.${v.layers.coverage.shell}`)).toBe(true);
      expect(ids.has(`dd.convention.${v.layers.convention}`)).toBe(true);
      expect(ids.has(`dd.status.${v.status}`)).toBe(true);
    }
    for (const f of RUN_FAMILY_IDS) expect(ids.has(`dd.family.${f}`)).toBe(true);
    for (const k of ['rush', 'gap', 'force', 'alley', 'spill', 'box', 'bounce', 'cutback', 'pursuit', 'passFirst']) expect(dutyText({ kind: k, gap: 'B', side: 'left', target: null, area: null, technique: null, delayS: null }).startsWith('dd.')).toBe(false);
  });

  it('the screen code holds no literal display text (P4.6.1)', () => {
    const dir = join(here, '../../../src/screens/defense-designer');
    const ATTR = /\b(title|label|placeholder|alt|aria-label)\s*=\s*(["'])([^"']*[A-Za-z][^"']*)\2/;
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.tsx'))) {
      const src = readFileSync(join(dir, f), 'utf8').replace(/\/\/.*$/gm, '');
      expect(ATTR.test(src)).toBe(false);
      for (const m of src.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)) expect(/[;=()&|]|=>/.test(m[1]!.trim()) || m[1]!.trim() === '').toBe(true);
    }
  });
});

describe('route entry', () => {
  it('fills the registered designer screen; look, slot and family come from the view options', () => {
    const screen = SCREENS.find((s) => s.id === DEFENSE_DESIGNER_SCREEN_ID)!;
    expect(screen.bible).toContain('O3.2.1');
    let seen: { p: ScreenProps; q: DefenseDesignerQuery } | null = null;
    const routes = { [DEFENSE_DESIGNER_SCREEN_ID]: defenseDesignerRoute((p, q) => { seen = { p, q }; return base; }) };
    const out = renderToStaticMarkup(createElement(Shell, { initialPath: `${screen.route}?look=${base.look.id}&slot=M&family=power`, routes }));
    expect(out).toContain('data-screen="defense-designer"');
    expect(seen).not.toBeNull();
    expect(seen!.q).toEqual({ lookId: base.look.id, slot: 'M', family: 'power' });
  });

  it('parses unknown or missing options to defaults', () => {
    expect(parseQuery({})).toEqual({ lookId: null, slot: null, family: 'insideZone' });
    expect(parseFamily('sweep')).toBe('insideZone');
    expect(parseFamily('counter')).toBe('counter');
  });
});
