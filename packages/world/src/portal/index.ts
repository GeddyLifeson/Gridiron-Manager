// Off-screen transfer portal (T6, X12.1.1): entries in the sourced windows, the market where programs sign
// entrants within their roster room, and history records. State in `LiveWorld.systemState['portal']`. See README.md.
export { MODULE, PARAMS, param } from './params.ts';
export { TRANSFER_ENTERED, TRANSFER_UNPLACED, PORTAL_EVENT_TYPES } from './events.ts';
export {
  PORTAL_KEY, STREAM_PORTAL, portalOf, portalLevel, transferRules, cycleDates, finalDay,
  type EntryVia, type EntryStatus, type PortalEntry, type PortalCycle, type PortalYear, type WorldPortal, type PortalBinding,
} from './binding.ts';
export { closePortal, runPortal, movesWithPortal } from './step.ts';
export { portalInput, portalRows, type PortalBoardInput, type PortalPublicRow } from './read.ts';
