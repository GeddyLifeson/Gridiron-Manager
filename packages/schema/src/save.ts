// Save header (P5.1.1). One row, readable without opening the rest of the file.
import { z } from 'zod';
import { pub } from './field.ts';
import { Calendar, ContentManifestEntry } from './entities.ts';

export const SAVE_FORMAT_VERSION = 1;

export const SaveSettings = z.object({
  worldSize: pub(z.enum(['small', 'standard', 'large'])),
  retentionProfile: pub(z.enum(['full', 'standard', 'compact'])),
}).strict(); // Retention profiles: P5.4.1 (compact is the browser default, P5.6.1). No difficulty and no pacing mode exist (P5.1.1, ruling of 2026-11-25).

export const SaveHeader = z.object({
  saveFormatVersion: pub(z.number().int().positive(), 'version'),
  engineVersion: pub(z.string()),
  parameterSetVersion: pub(z.string()),
  masterSeed: pub(z.string().regex(/^[0-9a-f]{16}$/)),
  generatorOptions: pub(z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])), 'ratio'),
  contentManifest: pub(z.array(ContentManifestEntry)),
  ruleSets: pub(z.array(z.object({ competitionId: pub(z.number().int(), 'id'), ruleSetId: pub(z.string()), leagueRulesId: pub(z.string()) }))),
  settings: pub(SaveSettings),
  certified: pub(z.boolean()),
  certifiedBrokenReason: pub(z.string()).optional(),
  peoplePack: pub(z.object({ id: pub(z.string()), version: pub(z.string()), hash: pub(z.string()), count: pub(z.number().int(), 'count') })).optional(),
  calendar: pub(Calendar),
  userPersonId: pub(z.number().int().positive(), 'id').nullable(),
  userJob: pub(z.string()).nullable(),
  summary: pub(z.string()),
  hashChainHead: pub(z.string()),
  createdWith: pub(z.string()),
  lastWrittenWith: pub(z.string()),
}).strict();
export type SaveHeader = z.infer<typeof SaveHeader>;
