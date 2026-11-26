// league/src/history (G-22): the X2 event log helpers. Row types live in @gm/schema (world/events.ts).
// The integrator adds the namespace re-export to the package barrel.
export { HISTORY_MODULE, PARAMS, RETAIN_PLAY_SEASONS } from './params.ts';
export { canonicalJson, chainHash, fnv64, toHex, utf8Length, EMPTY_SEASON_HASH } from './hash.ts';
export {
  HISTORY_SUMMARY_TYPE, HISTORY_SUMMARY_DEF, REVERSAL_TYPES, NEVER_COMPACTED_FAMILIES, REVERSAL_FAMILIES,
  buildTypeRegistry, typeRegistry, isProtectedHarm, type TypeRegistry, type RegistryResult,
} from './registry.ts';
export {
  EventLog, reversedIds, tamperedSeasons, personIdsOf, FORBIDDEN_PAYLOAD_KEYS,
  type EmitInput, type EmitResult, type EventLogOptions, type Subscriber, type Scalar,
} from './log.ts';
export { compactRows, compactLog, foldableIds, counterMatches, sumKey, type CounterSpec, type CompactOptions, type CompactionReport } from './compact.ts';
export { sizeReport, type SizeReport } from './size.ts';
