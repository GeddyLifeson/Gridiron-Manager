// Cut-up title cards (PV-12, plan 3.5; N1.2.2): a plain text card before each clip naming the clip's
// context: reel and quarter, down and distance, ball spot, formation, and the call on our own film.
// The card carries clip context only; it never names a grade, a value or a probability. The words come
// from the film record the read model already filtered (the call only when the viewer's side is known).
import type { FilmRecordWireLike } from '../types.ts';

/** Display seconds a card holds before the clip runs (Assumption, design). Any key skips it. */
export const TITLE_CARD_S = 1.5;

export interface TitleCard {
  /** "REEL 2  3RD QTR" style head line (the period leader wording, plan 2.1). */
  readonly head: string;
  /** Situation lines, plain words. */
  readonly lines: readonly string[];
  /** One sentence for the screen reader. */
  readonly spoken: string;
}

const QTR = ['', '1ST QTR', '2ND QTR', '3RD QTR', '4TH QTR'];
const DOWN = ['', '1ST', '2ND', '3RD', '4TH'];

export function quarterWord(q: number): string { return q >= 1 && q <= 4 ? QTR[q]! : q > 4 ? 'OVERTIME' : `QTR ${q}`; }

/** `reel` is 1-based: the clip's place in the cut-up. */
export function titleCard(r: FilmRecordWireLike, reel: number, of: number, call?: string | null): TitleCard {
  const b = r.base;
  const head = `REEL ${reel}  ${quarterWord(b.quarter)}`;
  const sit = b.down && b.down >= 1 && b.down <= 4
    ? `${DOWN[b.down]} & ${b.distance === null ? '?' : b.distance === 0 ? 'GOAL' : b.distance}`
    : b.playType.replace(/_/g, ' ').toUpperCase();
  const lines = [
    `${sit}  BALL ON ${Math.round(b.yardLine)}`,
    `${(b.offFormation ?? 'FORMATION NOT CHARTED').toUpperCase()}`,
  ];
  const own = r.viewerSide !== null;
  if (own && call) lines.push(`CALL: ${call.toUpperCase()}`);
  lines.push(`PLAY ${reel} OF ${of}`);
  const spoken = `Clip ${reel} of ${of}, ${quarterWord(b.quarter).toLowerCase()}, ${lines[0]!.toLowerCase()}, ${lines[1]!.toLowerCase()}${own && call ? `, call ${call}` : ''}.`;
  return { head, lines, spoken };
}

/** Holds a card for TITLE_CARD_S of display time at each clip change; skipped by any key. */
export class TitleCardTimer {
  private left = 0;
  private shownFor: string | null = null;
  get showing(): boolean { return this.left > 0; }
  /** Call with the current clip each frame; a new clip starts a card. */
  clip(playId: string, enabled: boolean): void {
    if (playId === this.shownFor) return;
    this.shownFor = playId;
    this.left = enabled ? TITLE_CARD_S : 0;
  }
  /** Counts display time; returns true while the card still holds the film. */
  tick(dtS: number): boolean { if (this.left > 0) this.left = Math.max(0, this.left - Math.max(0, dtS)); return this.left > 0; }
  skip(): void { this.left = 0; }
}
