// X12.2.1 news routing bound to the off-screen world: the weekly `news` step over league.news, its state in
// the live world, and the readers memory (X6.1.1) and visibility (X3.1.3) need.
export { MODULE, PARAMS, param } from './params.ts';
export {
  NEWS_KEY, STREAM_SPREAD, STREAM_WIRE, HEAD_COACH,
  emptyNews, newsOf, setNews, isCoachChange, witnessesOf, heardPublic, routeRows, pruneNews, newsStep, deliveriesTo,
  type NewsTally, type NewsState, type NewsBinding,
} from './binding.ts';
