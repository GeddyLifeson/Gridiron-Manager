// The two coaches film angles (N1.1.1) as framings of the one overhead field view (G-03). All-22: from
// high on the sideline, all 22 in frame, the field running across the screen. High end zone: from behind
// an end zone, the play coming toward or going away, tight on the tackle box. The choice is remembered
// per position room. A long run widens the frame (G-03 camera), never cuts to a third angle.
import type { Orientation, Zoom } from '../../field-view/index.ts';

export const FILM_VIEWS = ['all22', 'endZone'] as const;
export type FilmView = (typeof FILM_VIEWS)[number];

export const VIEW_FRAMING: Readonly<Record<FilmView, { readonly orientation: Orientation; readonly zoom: Zoom; readonly label: string }>> = {
  all22: { orientation: 'broadcast', zoom: 'wide', label: 'All-22' },
  endZone: { orientation: 'offenseUp', zoom: 'tight', label: 'High end zone' },
};

/** Remembers the view per position room; All-22 opens by default. */
export class ViewMemory {
  private readonly byRoom = new Map<string, FilmView>();
  get(room: string): FilmView { return this.byRoom.get(room) ?? 'all22'; }
  set(room: string, v: FilmView): void { this.byRoom.set(room, v); }
  toggle(room: string): FilmView { const n: FilmView = this.get(room) === 'all22' ? 'endZone' : 'all22'; this.set(room, n); return n; }
  /** Opponent film held only as a partial record plays in the All-22 view only (N1.1.1 edge case). */
  forPartial(): FilmView { return 'all22'; }
}
