// G-63 film screens (N1, O2.6): the play viewer, cut-ups, grades and tagging. `filmRoutes` is the route
// entry the integrator adds to the shell's route table (CR-G63-2).
import { createElement } from 'react';
import type { RouteTable } from '../../shell/index.ts';
import type { FieldGeometryLike, TeamColours } from '../../field-view/index.ts';
import { FilmViewer } from './FilmViewer.tsx';
import { CutUpsScreen } from './CutUpsScreen.tsx';
import { GradesScreen } from './GradesScreen.tsx';
import { TaggingScreen } from './TaggingScreen.tsx';
import type { FilmScreenSource } from './types.ts';

export * from './types.ts';
export { FilmViewer, type FilmViewerProps } from './FilmViewer.tsx';
export { CutUpsScreen } from './CutUpsScreen.tsx';
export { GradesScreen, SCALES } from './GradesScreen.tsx';
export { TaggingScreen, CAUSE_TAGS } from './TaggingScreen.tsx';
export { FilmTransport, ReelCursor, markers, FILM_SPEEDS, type Marker, type MarkerKind, type FilmSpeed } from './transport.ts';
export { VIEW_FRAMING, ViewMemory, FILM_VIEWS, type FilmView } from './views.ts';
export { buildOverlays, drawOverlays, OVERLAY_LAYERS, OVERLAY_KEYS, LEGEND, type OverlayLayer, type OverlayShape, type OverlayInput } from './overlays.ts';
export { toFilmPlay, fromBase64 } from './wire.ts';
export * from './presentation/index.ts';

export interface FilmRouteContext {
  readonly source: FilmScreenSource;
  readonly geometry: FieldGeometryLike;
  readonly home: TeamColours;
  readonly away: TeamColours;
}

/** Route entries for the film hub's screens (shell registry ids film.viewer, film.cutups, film.grades, film.tagging). */
export function filmRoutes(ctx: FilmRouteContext): RouteTable {
  return {
    'film.viewer': { render: (p) => {
      const ids = (p.location.view.plays ?? '').split(',').filter(Boolean);
      return ids.length ? createElement(FilmViewer, { source: ctx.source, playIds: ids, geometry: ctx.geometry, home: ctx.home, away: ctx.away, room: p.location.view.room ?? 'team' }) : createElement('p', { className: 'gm-line' }, 'Pick plays from tagging or a cut-up to watch.');
    } },
    'film.cutups': { render: (p) => createElement(CutUpsScreen, { source: ctx.source, onWatch: (ids) => p.navigate(`/film/viewer?plays=${ids.join(',')}`) }) },
    'film.grades': { render: (p) => createElement(GradesScreen, { source: ctx.source, gameId: Number(p.location.view.game ?? 0), personId: Number(p.location.view.player ?? 0) }) },
    'film.tagging': { render: (p) => createElement(TaggingScreen, { source: ctx.source, filter: p.location.view.filter ?? '{}', onOpen: (id) => p.navigate(`/film/viewer?plays=${id}`) }) },
  };
}
