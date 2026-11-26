// league/src/news (G-44): the public face of the living world (C10) and how news reaches people
// (X12.2). Every news item is built from X2 log rows only; deliveries and rumors are records of who
// heard what, never world state. The integrator adds the namespace re-export to the package barrel.
export { PARAMS, RULE_KEYS, param, transactionDeadline, type NewsRuleLookup } from './params.ts';
export { newsFromEvents, newsTraceProblems, missingCarouselItems, type NewsOptions, type NewsBuild, type SkipReason } from './items.ts';
export {
  wireFromEvents, wireVisibleAt, filterWire, wireCountMatches, WIRE_PAYLOAD_KEYS,
  type WireItem, type WireOptions, type WireFilter, type FilteredWireItem,
} from './wire.ts';
export {
  publicDeliveries, spreadNonPublic, contactTip, passChance, unsourcedDeliveries,
  type Channel, type DeliveryRecord, type Recipient, type PasserFacets, type Contact,
} from './delivery.ts';
export { RUMOR_CLAIMS, rumorAllowed, resolveRumors, type Rumor, type RumorClaim, type RumorStatus } from './rumor.ts';
export { selectForInbox, inactivesPublicAt, staffNote, type InboxContext, type FilingRecord, type StaffNote } from './inbox.ts';
