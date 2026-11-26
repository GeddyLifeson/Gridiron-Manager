// PV-05 banner queue (plan 3.4, O2.1.3, O6.4.1, MB-14). Rules:
//  - One bar at a time. Waiting banners go out best rank first (lower number), then oldest first.
//  - A showing banner runs its length; a better-ranked arrival waits for it (no cut-ins, so nothing
//    flickers between bars).
//  - Skippable: `skip()` (click or Escape) ends the showing bar at once.
//  - Never shown while the play clock is under 10 s, or while the ball is live. A bar showing when that
//    starts is taken down and not shown again; waiting bars keep waiting.
//  - A banner that waits longer than its kind's maxWaitMs is stale and dropped.
//  - Reduced motion: half length, and still (cut on and off, never moved, faded or flashed). The Classic
//    look cuts on and off in every mode (plan 2.1), so "still" is the only mode there is.
//  - Timed on the wall clock (plan section 6 allows wall time for banners only). The queue never reads a
//    clock itself: every call is handed `nowMs`, so tests and replays are exact.
import TABLE from './banner-table.json';

export interface BannerKindRule { rank: number; durationMs: number; maxWaitMs: number; title: string; line2: string; cueRow: string | null }
export type BannerKind = keyof typeof TABLE.kinds;
export const BANNER_TABLE = TABLE as unknown as { formatVersion: number; kinds: Record<BannerKind, BannerKindRule> };
export const BANNER_KINDS = Object.keys(BANNER_TABLE.kinds) as readonly BannerKind[];

/** Fill-ins for a banner's text (see the table's $comment). */
export type BannerSlots = Partial<Record<'team' | 'away' | 'home' | 'as' | 'hs' | 'detail' | 'line2', string | number>>;

export interface BannerRequest {
  readonly kind: BannerKind;
  /** Same key and kind already waiting or showing: the new one is ignored (one banner per event). */
  readonly key: string;
  readonly slots?: BannerSlots;
}

export interface Banner {
  readonly kind: BannerKind;
  readonly key: string;
  readonly rank: number;
  readonly lines: readonly string[];
  readonly cueRow: string | null;
  readonly enqueuedMs: number;
}

export interface ShowingBanner extends Banner { readonly startMs: number; readonly endMs: number }

export interface BannerGate {
  /** Tenths left on the play clock, or null when it is not running. */
  readonly playClockTenths: number | null;
  readonly live: boolean;
  readonly reducedMotion: boolean;
}

/** Banners hide under this play clock (plan 3.4, "never shown while the play clock is under 10 s"). */
export const BANNER_PLAY_CLOCK_FLOOR_TENTHS = 100;

export function bannerLines(kind: BannerKind, slots: BannerSlots = {}): string[] {
  const rule = BANNER_TABLE.kinds[kind];
  if (!rule) throw new Error(`unknown banner kind ${kind}`);
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(slots[k as keyof BannerSlots] ?? '')).replace(/\s+$/, '').replace(/^\s+/, '').toUpperCase();
  const title = fill(rule.title).replace(/:\s*$/, '');
  const line2 = fill(rule.line2);
  return line2 ? [title, line2] : [title];
}

export function gateOpen(g: BannerGate): boolean {
  if (g.live) return false;
  return g.playClockTenths === null || g.playClockTenths >= BANNER_PLAY_CLOCK_FLOOR_TENTHS;
}

export class BannerQueue {
  private waiting: Banner[] = [];
  private current: ShowingBanner | null = null;
  private seen = new Set<string>();
  /** Every banner that was shown, with why it ended, for tests and the QA suite. */
  readonly log: { kind: BannerKind; key: string; startMs: number; endMs: number; ended: 'timeout' | 'skipped' | 'gate' }[] = [];
  readonly dropped: { kind: BannerKind; key: string; reason: 'stale' | 'duplicate' }[] = [];

  enqueue(req: BannerRequest, nowMs: number): void {
    const id = `${req.kind}|${req.key}`;
    if (this.seen.has(id)) { this.dropped.push({ kind: req.kind, key: req.key, reason: 'duplicate' }); return; }
    this.seen.add(id);
    const rule = BANNER_TABLE.kinds[req.kind];
    this.waiting.push({ kind: req.kind, key: req.key, rank: rule.rank, lines: bannerLines(req.kind, req.slots), cueRow: rule.cueRow, enqueuedMs: nowMs });
  }

  /** Ends the showing banner now (click or Escape). Returns whether one was showing. */
  skip(nowMs: number): boolean {
    if (!this.current) return false;
    this.end(nowMs, 'skipped');
    return true;
  }

  /** Advances to `nowMs` and returns the banner to draw, or null. Call on every frame or timer tick. */
  step(nowMs: number, gate: BannerGate): ShowingBanner | null {
    if (this.current && !gateOpen(gate)) this.end(nowMs, 'gate');
    if (this.current && nowMs >= this.current.endMs) this.end(this.current.endMs, 'timeout');
    this.waiting = this.waiting.filter((b) => {
      const stale = nowMs - b.enqueuedMs > BANNER_TABLE.kinds[b.kind].maxWaitMs;
      if (stale) this.dropped.push({ kind: b.kind, key: b.key, reason: 'stale' });
      return !stale;
    });
    if (!this.current && gateOpen(gate) && this.waiting.length) {
      this.waiting.sort((a, b) => a.rank - b.rank || a.enqueuedMs - b.enqueuedMs);
      const next = this.waiting.shift()!;
      const full = BANNER_TABLE.kinds[next.kind].durationMs;
      const length = gate.reducedMotion ? Math.round(full / 2) : full;
      this.current = { ...next, startMs: nowMs, endMs: nowMs + length };
    }
    return this.current;
  }

  get showing(): ShowingBanner | null { return this.current; }
  get pending(): readonly Banner[] { return this.waiting; }

  private end(atMs: number, ended: 'timeout' | 'skipped' | 'gate'): void {
    const c = this.current!;
    this.log.push({ kind: c.kind, key: c.key, startMs: c.startMs, endMs: atMs, ended });
    this.current = null;
  }
}
