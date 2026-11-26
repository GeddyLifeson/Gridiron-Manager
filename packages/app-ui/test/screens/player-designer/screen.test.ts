// G-92 screen: renders the real designer model (the people designer's screen model is assignable to the
// screen's declared type, so the two cannot drift), shows warnings and blockers from the model, and every
// action is a native control.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ATTRIBUTE_IDS } from '@gm/schema';
import FIXTURES from './fixtures.json';
import { PlayerDesignerScreen, pdTextIds, pt, warningText, fieldLabel, SCREEN_ID, type PlayerDesignerUi, type DesignerUiIntent } from '../../../src/screens/player-designer/index.ts';

// Built from the people designer's screen model by packages/people/test/designer/screen-fixture.test.ts,
// which fails when the model and this fixture differ.
const F = FIXTURES as unknown as Record<'empty' | 'closed' | 'archetype' | 'warned' | 'blank', PlayerDesignerUi>;
const html = (view: PlayerDesignerUi, readOnly = false) => renderToStaticMarkup(createElement(PlayerDesignerScreen, { view, readOnly, onIntent: (_i: DesignerUiIntent) => {} }));

describe('player designer screen', () => {
  it('names its screen id and has every archetype label in its text', () => {
    expect(SCREEN_ID).toBe('people.player_designer');
    const ids = new Set(pdTextIds());
    for (const list of Object.values(F.empty.archetypeCatalog)) for (const a of list) expect(ids.has(a.labelId), a.labelId).toBe(true);
    expect(Object.values(F.empty.archetypeCatalog).flat().length).toBeGreaterThan(30);
  });
  it('shows the start panel and no sheet before a start; a closed designer shows why', () => {
    const open = html(F.empty);
    expect(open).toContain(pt('pd.start.title'));
    expect(open).not.toContain('pd-sheet');
    const closed = html(F.closed);
    expect(closed).toContain('role="alert"');
    expect(closed).not.toContain(pt('pd.start.title'));
  });
  it('an archetype start shows every section, the physical panel, the staff grade and a Save button that works', () => {
    const v = F.archetype;
    const h = html(v);
    for (const s of v.sections) expect(h).toContain(`data-section="${s.id}"`);
    expect(h).toContain('position coach, graded 300 snaps of film');
    expect(h).toContain(pt('pd.panel.noWarnings'));
    expect(h).toMatch(/<button type="button">Save player<\/button>/);
  });
  it('a warning reads as a sentence with its rarity, marks its fields, and disables Save until sandbox', () => {
    const v = F.warned;
    expect(v.canCommit).toBe(false);
    const h = html(v);
    expect(h).toContain('aria-invalid="true"');
    expect(h).toMatch(/<button type="button" disabled="">Save player<\/button>/);
    const w = v.warnings.find((x) => x.fields.includes('tests.fortyS'))!;
    expect(warningText(w, 'OT')).toMatch(/40-yard dash/);
    expect(h).toContain(pt('pd.blocker.warnings'));
  });
  it('labels attributes by id when there is no text row, and read-only hides the start panel', () => {
    expect(fieldLabel('attributes.zone_coverage')).toBe('zone coverage');
    expect(fieldLabel('tests.fortyS')).toBe('40-yard dash (s)');
    const h = html(F.blank, true);
    expect(h).not.toContain(pt('pd.start.title'));
    expect(h).toContain(pt('pd.missing', { count: 8 + 2 * ATTRIBUTE_IDS.length }));
    expect(h).toContain(pt('pd.edited'));
    for (const tag of h.match(/<(input|select)[^>]*>/g) ?? []) expect(tag).toContain('disabled');
  });
});
