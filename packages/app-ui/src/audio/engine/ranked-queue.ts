// Ranked queue for crowd reactions (MB-7, O5.3.2 amendment rule 2). One reaction per play from a
// short ranked list. A higher one cuts in, a lower one waits or is dropped. The crowd driver (PV-08)
// offers reactions from ruling events (B11, never the truth layer) and plays what this returns.
//
// Generic over the kind so PV-05's banner queue can use the same rules if it wants to.

/** Default order from MB-7, highest first. PV-08 may pass its own. */
export const CROWD_REACTION_RANK = ['touchdown', 'turnover', 'bigGain', 'sack', 'flagAgainstHome', 'reviewReversal'] as const;
export type CrowdReaction = (typeof CROWD_REACTION_RANK)[number];

export interface QueueItem<K extends string> {
  kind: K;
  /** Play key (game and play number); one reaction per play. */
  play: string;
  /** Audio-clock seconds the ruling arrived. */
  at: number;
  /** Seconds the reaction lasts once started. */
  seconds: number;
}

export type QueueDecision<K extends string> =
  | { action: 'play'; item: QueueItem<K> }
  /** Stop `replaced` and play `item` now. */
  | { action: 'cut'; item: QueueItem<K>; replaced: QueueItem<K> }
  /** Held until the current one ends; `pump` releases it. */
  | { action: 'wait'; item: QueueItem<K> }
  | { action: 'drop'; item: QueueItem<K>; reason: 'lower-same-play' | 'play-already-reacted' | 'lower-than-waiting' | 'unranked' };

export interface RankedQueueOptions {
  /** A waiting reaction older than this when the current one ends is dropped (stale; the moment passed). */
  maxWaitSeconds?: number;
}

export class RankedQueue<K extends string> {
  private current: { item: QueueItem<K>; endsAt: number } | null = null;
  private waiting: QueueItem<K> | null = null;
  /** Plays that have had their reaction (played or cut in for). Kept small: the last few plays only. */
  private reacted: string[] = [];
  private readonly maxWait: number;

  constructor(private readonly rank: readonly K[], opts: RankedQueueOptions = {}) {
    this.maxWait = opts.maxWaitSeconds ?? 2;
  }

  /** Lower number is higher priority; -1 if not in the list. */
  rankOf(kind: K): number { return this.rank.indexOf(kind); }

  private isPlaying(t: number): boolean { return this.current !== null && t < this.current.endsAt; }

  private start(item: QueueItem<K>, t: number): void {
    this.current = { item, endsAt: t + item.seconds };
    if (!this.reacted.includes(item.play)) { this.reacted.push(item.play); if (this.reacted.length > 8) this.reacted.shift(); }
  }

  offer(item: QueueItem<K>): QueueDecision<K> {
    const r = this.rankOf(item.kind);
    if (r < 0) return { action: 'drop', item, reason: 'unranked' };
    const t = item.at;
    if (this.isPlaying(t)) {
      const cur = this.current!.item;
      const higher = r < this.rankOf(cur.kind);
      if (cur.play === item.play) {
        if (!higher) return { action: 'drop', item, reason: 'lower-same-play' };
        this.start(item, t);
        return { action: 'cut', item, replaced: cur };
      }
      if (higher) { this.start(item, t); return { action: 'cut', item, replaced: cur }; }
      if (this.reacted.includes(item.play)) return { action: 'drop', item, reason: 'play-already-reacted' };
      if (this.waiting && this.rankOf(this.waiting.kind) <= r && this.waiting.play !== item.play) return { action: 'drop', item, reason: 'lower-than-waiting' };
      if (this.waiting && this.waiting.play === item.play && this.rankOf(this.waiting.kind) <= r) return { action: 'drop', item, reason: 'lower-same-play' };
      this.waiting = item;
      return { action: 'wait', item };
    }
    if (this.reacted.includes(item.play)) {
      // The play's reaction already finished: a later, higher ruling (e.g. a review reversal) may still play once.
      return { action: 'drop', item, reason: 'play-already-reacted' };
    }
    this.start(item, t);
    return { action: 'play', item };
  }

  /** Call when time moves on (each frame or each play). Returns a waiting reaction that may start now. */
  pump(t: number): QueueItem<K> | null {
    if (this.isPlaying(t) || !this.waiting) return null;
    const w = this.waiting;
    this.waiting = null;
    const startAt = Math.max(t, this.current?.endsAt ?? t);
    if (startAt - w.at > this.maxWait || this.reacted.includes(w.play)) return null;
    this.start({ ...w, at: startAt }, startAt);
    return { ...w, at: startAt };
  }

  get playing(): QueueItem<K> | null { return this.current?.item ?? null; }
  get held(): QueueItem<K> | null { return this.waiting; }

  clear(): void { this.current = null; this.waiting = null; this.reacted = []; }
}
