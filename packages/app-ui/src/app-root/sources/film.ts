// Film hub sources (item 2d): the film viewer, cut-ups, grades and tagging screens (N1, G-63) on the seat's own
// film room, which holds every game the user called on the console with the plays the resolver drew. The hub
// is mounted once the room has a play on film: before that (or when the game's resolver drew no paths, as the
// reference resolver does) the screens stay placeholders.
import type { weekLoop } from '@gm/app-services';
import type { RouteSources } from '../../routes.ts';
import type { FilmRouteContext, FilmScreenSource } from '../../screens/film/index.ts';

export function filmSources(room: weekLoop.SeatFilmRoom, view: Omit<FilmRouteContext, 'source'> | null): Pick<RouteSources, 'film'> {
  if (!view || room.plays === 0) return {};
  // The read-model data fits the film screens' structural copies (screens/film/types.ts, CR-G63-2).
  const source: FilmScreenSource = {
    play: (id) => room.play(id), list: (f) => room.list(f), sheet: (g, p, s) => room.sheet(g, p, s),
    corrections: (g) => room.corrections(g), cutups: () => room.cutups(), send: (t, p) => room.send(t, p),
  };
  return { film: { ...view, source } };
}
