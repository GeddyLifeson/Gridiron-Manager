// O5.2.1, O5.2.2, O1.3.1: key map data, collisions, overrides and context resolution.
import { describe, it, expect } from 'vitest';
import { DEFAULT_KEYMAP, KEY_CONTEXTS, findCollisions, applyOverrides, rebind, actionFor, activeBindings, chordOf, normaliseChord, displayChord } from '../../src/shell/index.ts';

const B = DEFAULT_KEYMAP.bindings;

describe('default key map (O5.2.1)', () => {
  it('has no collisions in any context (acceptance)', () => { expect(findCollisions(B)).toEqual([]); });
  it('uses only the O5.2.1 contexts', () => { for (const b of B) expect(KEY_CONTEXTS).toContain(b.context); });
  it('holds the O1.3.1 global keys', () => {
    const g = (a: string) => B.find((b) => b.context === 'global' && b.action === a)?.keys;
    expect(g('hub.office')).toEqual(['Digit1']);
    expect(g('hub.school')).toEqual(['Digit0']);
    expect(g('nav.back')).toEqual(['Escape']);
    expect(g('palette.open')).toEqual(['Slash']);
    expect(g('help.keys')).toEqual(['Shift+Slash']);
    expect(g('help.screen')).toEqual(['F1']);
    expect(g('nav.history_back')).toEqual(['Alt+ArrowLeft']);
    expect(g('office.advance')).toEqual(['Space']);
  });
  it('every action has a binding or is marked "no default"', () => {
    for (const b of B) if (!b.keys.length) expect(b.note ?? '', b.action).toMatch(/no default/);
  });
});

describe('chords', () => {
  it('reads physical codes with modifiers in a fixed order', () => {
    expect(chordOf({ code: 'Slash', shiftKey: true })).toBe('Shift+Slash');
    expect(chordOf({ code: 'KeyB', shiftKey: true, ctrlKey: true })).toBe('Ctrl+Shift+KeyB');
    expect(chordOf({ code: 'ShiftLeft', shiftKey: true })).toBe('');
    expect(normaliseChord('Shift+Ctrl+KeyA')).toBe('Ctrl+Shift+KeyA');
    expect(displayChord('Shift+Slash')).toBe('?');
    expect(displayChord('Digit7')).toBe('7');
  });
  it('the innermost context wins', () => {
    expect(actionFor('Digit1', ['global'], B)).toBe('hub.office');
    expect(actionFor('Digit1', ['global', 'console.offense'], B)).toBe('call.entry_1');
    expect(actionFor('Escape', ['global', 'console.offense'], B)).toBe('nav.back');
  });
  it('active bindings drop keys shadowed by an inner context', () => {
    const act = activeBindings(['global', 'console.offense'], B);
    expect(act.find((b) => b.action === 'hub.office')).toBeUndefined();
    expect(act.find((b) => b.action === 'palette.open')).toBeUndefined(); // '/' is playbook search in the console
    expect(act.find((b) => b.action === 'playbook.search')?.keys).toEqual(['Slash']);
  });
});

describe('remapping (O5.2.2)', () => {
  it('overrides are differences from the default; resetting to the default removes the row', () => {
    const r = rebind({}, 'global', 'palette.open', ['KeyK']);
    expect(r).toEqual({ ok: true, overrides: { 'global|palette.open': ['KeyK'] } });
    const back = rebind((r as { overrides: Record<string, string[]> }).overrides, 'global', 'palette.open', ['Slash']);
    expect(back).toEqual({ ok: true, overrides: {} });
    expect(actionFor('KeyK', ['global'], applyOverrides({ 'global|palette.open': ['KeyK'] }).bindings)).toBe('palette.open');
  });
  it('refuses a key already used in the context and names the holder', () => {
    expect(rebind({}, 'global', 'palette.open', ['Digit1'])).toEqual({ ok: false, reason: 'Digit1 is already bound to hub.office' });
  });
  it('an imported profile row with an unknown action is ignored and reported', () => {
    const r = applyOverrides({ 'global|no.such': ['KeyQ'] });
    expect(r.problems).toHaveLength(1);
    expect(r.bindings).toEqual(B);
  });
});
