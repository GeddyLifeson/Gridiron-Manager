import { describe, expect, it } from 'vitest';
import { apply, canonical, changedFields, createDraft, isDirty, live, publish, redo, restore, undo, valueOf, PARAMS } from '../../src/editor/index.ts';

interface Doc { name: string; n: number; tags: string[] }
type Edit = { set: 'name'; to: string } | { set: 'n'; to: number } | { tag: string };
const reduce = (d: Doc, e: Edit): Doc => ('tag' in e ? { ...d, tags: [...d.tags, e.tag] } : e.set === 'name' ? { ...d, name: e.to } : { ...d, n: e.to });

describe('editor core (O3.7.1)', () => {
  it('undo returns a byte-identical earlier state, redo goes forward', () => {
    let d = createDraft<Doc>('x', { name: 'a', n: 1, tags: [] });
    const start = d.json;
    d = apply(d, { set: 'name', to: 'b' }, reduce);
    const mid = d.json;
    d = apply(d, { tag: 't' }, reduce);
    d = undo(d);
    expect(d.json).toBe(mid);
    d = undo(d);
    expect(d.json).toBe(start);
    d = redo(redo(d));
    expect(valueOf(d).tags).toEqual(['t']);
  });
  it('keeps at least 200 undo steps', () => {
    let d = createDraft<Doc>('x', { name: 'a', n: 0, tags: [] });
    for (let i = 1; i <= 250; i++) d = apply(d, { set: 'n', to: i }, reduce);
    expect(d.past.length).toBe(PARAMS.undoSteps);
    for (let i = 0; i < 200; i++) d = undo(d);
    expect(valueOf(d).n).toBe(50);
  });
  it('a no-op edit adds no step; a new edit clears redo', () => {
    let d = createDraft<Doc>('x', { name: 'a', n: 0, tags: [] });
    d = apply(d, { set: 'name', to: 'a' }, reduce);
    expect(d.past.length).toBe(0);
    d = undo(apply(d, { set: 'n', to: 2 }, reduce));
    d = apply(d, { set: 'n', to: 3 }, reduce);
    expect(d.future.length).toBe(0);
  });
  it('publishes, refuses only on the caller rule, restores versions', () => {
    let d = createDraft<Doc>('x', { name: 'a', n: 0, tags: [] });
    expect(live(d)).toBeNull();
    const r1 = publish(d, 'week 1');
    d = r1.draft;
    expect(r1.published?.n).toBe(1);
    expect(isDirty(d)).toBe(false);
    d = apply(d, { set: 'n', to: 12 }, reduce);
    const refused = publish(d, 'week 2', (v) => (v.n > 11 ? 'more than eleven slots' : null));
    expect(refused.published).toBeNull();
    expect(refused.refusedBecause).toBe('more than eleven slots');
    d = apply(d, { set: 'n', to: 5 }, reduce);
    d = publish(d, 'week 2').draft;
    expect(live(d)?.n).toBe(5);
    d = restore(d, 1);
    expect(valueOf(d).n).toBe(0);
    expect(valueOf(undo(d)).n).toBe(5);
  });
  it('canonical JSON ignores key order; changedFields lists differing fields', () => {
    expect(canonical({ b: 1, a: { d: 2, c: 3 } })).toBe(canonical({ a: { c: 3, d: 2 }, b: 1 }));
    expect(changedFields({ a: 1, b: [1], c: 'x' }, { a: 1, b: [2], d: 1 })).toEqual(['b', 'c', 'd']);
  });
});
