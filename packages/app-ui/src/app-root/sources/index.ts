// The mounted app's route sources by hub (lane A item 2): each hub file builds its RouteSources fields from the
// season, so the hubs never edit CareerRoot together. The season port merges them here.
export { weekSources } from './week.ts';
export { filmSources } from './film.ts';
