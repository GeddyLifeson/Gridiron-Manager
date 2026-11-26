// PV-00 presentation feed (plans/presentation-build-plan.md section 8): the typed, user-visible feed
// of one play that field cues, the strip, the crowd, cadence and ambience read.
export * from './types.ts';
export { presentationFeed, type FeedInput, type FeedRecord, type PresentationExtras, type ExtraContact, type ExtraPresnap } from './adapter.ts';
