// G-96 screen: lists packs with status and problems, shows pack text as plain text only (P7.2.1),
// every action is a button (Q1.5.2), and the rule-set editor is closed in a certified career.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EditorsScreen, edTextIds, et, packText, type EditorsUi, type EditorsIntent } from '../../../src/screens/editors/index.ts';
import TEXT from '../../../src/screens/editors/text.json';
import { readFileSync } from 'node:fs';

const view = (over: Partial<EditorsUi> = {}): EditorsUi => ({
  folder: 'C:/Games/Gridiron/user content', canImport: true, certified: false,
  packs: [
    { origin: 'good', packId: 'good-pack', name: 'Good <b>pack</b>', version: '1.0.0', author: 'Coach\u202E', kinds: ['playbooks'], signature: 'unsigned', selectable: true, problems: [], ignored: [], neutralisedCount: 1 },
    { origin: 'bad', packId: 'bad-pack', name: 'Bad', version: '2.0.0', author: 'X', kinds: ['world'], signature: 'signature_not_checked', selectable: false,
      problems: [{ severity: 'error', code: 'safety.web_address', file: 'world/w.json', path: '$.note', message: 'names a web address' }], ignored: [{ file: 'logo.png', reason: 'image' }], neutralisedCount: 0 },
  ],
  editors: [{ id: 'play-designer', title: 'Play designer', certifiedAllowed: true }, { id: 'rule-set-editor', title: 'Rule-set editor', certifiedAllowed: false }],
  ...over,
});
const render = (v: EditorsUi | null, readOnly = false, onIntent: (i: EditorsIntent) => void = () => {}) => renderToStaticMarkup(createElement(EditorsScreen, { view: v, readOnly, onIntent }));

describe('Mods and editors screen (P7.1.1, P7.5.1)', () => {
  it('lists every pack with version, author, kinds, signature state and status', () => {
    const html = render(view());
    expect(html).toContain('data-pack="good-pack" data-selectable="yes"');
    expect(html).toContain('data-pack="bad-pack" data-selectable="no"');
    expect(html).toContain(et('ed.signature.signature_not_checked'));
    expect(html).toContain(et('ed.problems.count', { errors: 1, warnings: 0 }));
    expect(html).toContain(et('ed.problems.export'));
  });
  it('shows pack text as plain text: markup escaped, direction characters removed', () => {
    const html = render(view());
    expect(html).toContain('Good &lt;b&gt;pack&lt;/b&gt;');
    expect(html).not.toContain('<b>pack</b>');
    expect(html).not.toContain('\u202E');
    expect(packText('a\u0000b\u200Bc')).toBe('abc');
  });
  it('closes the rule-set editor in a certified career and every editor when read only', () => {
    const html = render(view({ certified: true }));
    expect(html).toMatch(/data-editor="rule-set-editor">Rule-set editor <button type="button" disabled=""/);
    expect(html).toContain(et('ed.editors.certified'));
    expect(render(view(), true)).not.toContain(et('ed.packs.import'));
  });
  it('shows the empty folder message and the no-view frame', () => {
    expect(render(view({ packs: [] }))).toContain(et('ed.packs.none'));
    expect(render(null)).toContain(et('ed.title'));
  });
  it('every string id the screen uses exists, and every string is used', () => {
    const src = readFileSync(new URL('../../../src/screens/editors/EditorsScreen.tsx', import.meta.url), 'utf8');
    const used = new Set([...src.matchAll(/et\('([a-z_.]+)'/g)].map((m) => m[1]!));
    for (const id of used) expect(edTextIds(), id).toContain(id);
    const dynamic = ['ed.signature.', 'ed.col.', 'ed.status.', 'ed.problems.hide', 'ed.problems.show'];
    for (const id of Object.keys((TEXT as { strings: Record<string, string> }).strings)) expect(used.has(id) || dynamic.some((d) => id.startsWith(d)), id).toBe(true);
  });
});
