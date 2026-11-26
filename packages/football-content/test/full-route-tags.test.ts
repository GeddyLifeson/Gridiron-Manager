// Route tags: shapes come from routes already in the content, re-laid from the tagged receiver's alignment.
import { describe, expect, it } from 'vitest';
import { full } from '../src/index.ts';

const play = full.FULL_PLAYS.find((p) => p.id === 'pass_y_cross')!;
const slot = (p: typeof play, role: string) => p.slots.find((s) => s.role === role)!;

describe('route tags', () => {
  it('the tree holds the common routes, each from a real play', () => {
    for (const r of ['go', 'slant', 'hitch', 'post', 'corner', 'dig', 'curl']) expect(full.ROUTE_TREE.has(r)).toBe(true);
    for (const r of full.ROUTE_TREE.values()) expect(full.FULL_PLAYS.some((p) => p.id === r.from)).toBe(true);
  });
  it('a tag changes only that receiver; depths are as authored and the break side follows his side', () => {
    const t = full.withRouteTags(play, [full.routeTagId('Z', 'hitch'), full.routeTagId('X', 'hitch')]);
    expect(t.id).not.toBe(play.id);
    const hitch = full.ROUTE_TREE.get('hitch')!;
    expect(slot(t, 'Z').path!.map((q) => q.px)).toEqual(hitch.points.map((q) => q.px));
    expect(slot(t, 'Z').params!.route).toBe('hitch');
    // Z is on the right and X on the left: the same shape mirrors.
    const zOut = slot(t, 'Z').path!.map((q) => q.py - slot(t, 'Z').at[1]);
    const xOut = slot(t, 'X').path!.map((q) => -(q.py - slot(t, 'X').at[1]));
    expect(xOut.map((v) => Math.round(v * 100) + 0)).toEqual(zOut.map((v) => Math.round(v * 100) + 0));
    expect(slot(t, 'Y')).toBe(slot(play, 'Y'));
  });
  it('no route tag, or an unknown one, returns the play untouched', () => {
    expect(full.withRouteTags(play, [])).toBe(play);
    expect(full.withRouteTags(play, ['route:Z:nosuch', 'relay:radio'])).toBe(play);
  });
  it('lists tags for each receiver except the route he already runs; routesRun names installed routes', () => {
    const tags = full.routeTagsFor(play);
    expect(tags.some((t) => t.id === full.routeTagId('Z', String(slot(play, 'Z').params!.route)))).toBe(false);
    expect(tags.some((t) => t.id === 'route:Z:hitch')).toBe(true);
    expect(full.routesRun([play]).has('post')).toBe(true);
  });
  it('a re-laid route stays inside the sideline', () => {
    const t = full.withRouteTags(play, ['route:Z:corner']);
    for (const q of slot(t, 'Z').path!) expect(Math.abs(q.py)).toBeLessThanOrEqual(25);
  });
});
