// PV-18 film look on a canvas (the film room's FilmLookPort): draws only over the frame, never moves it,
// replays identically from the same cosmetic.display scope, takes its colours from the theme's era tokens.
import { describe, it, expect } from 'vitest';
import { filmLookCanvas, type FilmCanvas } from '../../../src/presentation/era/index.ts';
import { resolveColours } from '../../../src/tokens/index.ts';
import { cosmeticStream } from './fake-cosmetic.ts';

interface Call { op: string; args: unknown[]; fill: unknown; alpha: number }
function fakeCtx(): FilmCanvas & { calls: Call[] } {
  const calls: Call[] = [];
  const ctx = {
    calls, fillStyle: '' as unknown, globalAlpha: 1,
    save() { calls.push({ op: 'save', args: [], fill: ctx.fillStyle, alpha: ctx.globalAlpha }); },
    restore() { calls.push({ op: 'restore', args: [], fill: ctx.fillStyle, alpha: ctx.globalAlpha }); },
    fillRect(...args: number[]) { calls.push({ op: 'fillRect', args, fill: ctx.fillStyle, alpha: ctx.globalAlpha }); },
  };
  return ctx;
}
const scope = { gameId: 7, playNumber: 31 };

describe('film look canvas', () => {
  it('uses only fillRect inside one save/restore, so nothing under the look is transformed', () => {
    for (const stock of ['16mm', 'videotape'] as const) {
      const ctx = fakeCtx();
      filmLookCanvas('classic').drawLook(ctx, 320, 180, stock, cosmeticStream('a1b2', 'display', scope));
      expect(ctx.calls[0]!.op).toBe('save');
      expect(ctx.calls.at(-1)!.op).toBe('restore');
      expect(new Set(ctx.calls.slice(1, -1).map((c) => c.op))).toEqual(new Set(['fillRect']));
      expect(ctx.calls.filter((c) => c.op === 'fillRect').every((c) => c.alpha < 1)).toBe(true);
    }
  });
  it('the same play replays the same grain; the next frame is fresh', () => {
    const run = (frames: number) => {
      const draw = cosmeticStream('a1b2', 'display', scope);
      const out: string[] = [];
      for (let f = 0; f < frames; f++) { const ctx = fakeCtx(); filmLookCanvas('classic').drawLook(ctx, 120, 90, '16mm', draw); out.push(JSON.stringify(ctx.calls)); }
      return out;
    };
    const a = run(2), b = run(2);
    expect(a).toEqual(b);
    expect(a[0]).not.toEqual(a[1]);
  });
  it('tape draws scan lines and film does not', () => {
    const lines = (stock: '16mm' | 'videotape') => { const ctx = fakeCtx(); filmLookCanvas('dark').drawLook(ctx, 100, 60, stock, cosmeticStream('1', 'display', scope)); return ctx.calls.filter((c) => c.op === 'fillRect' && c.args[2] === 100 && c.args[3] === 1).length; };
    expect(lines('videotape')).toBeGreaterThan(10);
    expect(lines('16mm')).toBe(0);
  });
  it('colours come from the active theme\'s era tokens', () => {
    const era = resolveColours('classic').era;
    const ctx = fakeCtx();
    filmLookCanvas('classic').drawLook(ctx, 200, 120, '16mm', cosmeticStream('5', 'display', scope));
    const fills = new Set(ctx.calls.filter((c) => c.op === 'fillRect').map((c) => c.fill));
    for (const f of fills) expect([era.grainLight, era.grainDark, era.vignette]).toContain(f);
  });
  it('the leader card fills the frame, stays inside it and writes in the leader ink', () => {
    const era = resolveColours('classic').era;
    for (const stock of ['16mm', 'videotape'] as const) {
      const ctx = fakeCtx();
      filmLookCanvas('classic').drawLeader(ctx, 640, 360, { head: 'REEL 2  3RD QTR', lines: ['2ND AND 7', 'OWN 34'] }, stock);
      const rects = ctx.calls.filter((c) => c.op === 'fillRect');
      expect(rects[0]!.args).toEqual([0, 0, 640, 360]);
      expect(rects[0]!.fill).toBe(era.leaderBg);
      expect(rects.some((r) => r.fill === era.leaderInk)).toBe(true);
      for (const r of rects) { const [x, y, w, h] = r.args as number[]; expect(x! >= 0 && y! >= 0 && x! + w! <= 640 && y! + h! <= 360, JSON.stringify(r.args)).toBe(true); }
    }
  });
});
