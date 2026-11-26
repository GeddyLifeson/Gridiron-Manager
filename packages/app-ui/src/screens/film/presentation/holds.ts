// Freeze holds (PV-12, plan 3.5; O2.6.1): the coach drops a hold marker on a tick and the film stops
// there on every pass, the way a clicker operator freezes the decisive frame. A hold only moves the
// film cursor; it never touches positions. Pressing play again runs on past the hold.
import type { FilmTransport } from '../transport.ts';

export class FreezeHolds {
  private readonly ticks = new Set<number>();
  private frozen: number | null = null;

  get list(): readonly number[] { return [...this.ticks].sort((a, b) => a - b); }
  /** The hold the film is stopped on, or null. */
  get frozenAt(): number | null { return this.frozen; }
  has(tick: number): boolean { return this.ticks.has(Math.round(tick)); }
  /** `H`: adds a hold on the current whole tick, or removes it when one is there. Returns true when added. */
  toggle(tick: number): boolean {
    const t = Math.round(tick);
    if (this.ticks.has(t)) { this.ticks.delete(t); return false; }
    this.ticks.add(t); return true;
  }
  clear(): void { this.ticks.clear(); this.frozen = null; }

  /**
   * Advances the transport and stops on the first hold crossed. A hold exactly at the starting cursor is
   * not crossed, so play resumes past the frame it froze on. A loop pass (whistle back to snap) checks
   * both pieces. Returns what `transport.advance` returned, or false when a hold stopped the film.
   */
  advance(transport: FilmTransport, dtS: number): boolean {
    if (!transport.playing) return false;
    const before = transport.tick;
    this.frozen = null; // pressing play leaves the hold
    const ended = transport.advance(dtS);
    const after = transport.tick;
    const hits = this.list.filter((h) => (after >= before ? h > before && h <= after : h > before || h <= after));
    if (!hits.length) return ended;
    const h = after >= before ? hits[0]! : (hits.find((x) => x > before) ?? hits[0]!);
    transport.seek(h);
    transport.pause();
    this.frozen = h;
    return false;
  }
}
