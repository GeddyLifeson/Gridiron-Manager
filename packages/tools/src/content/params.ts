// Loader limits (P4.2.1: "size limits per file and per pack protect against malformed or hostile files
// (P7.2.1)"). Every value is a P7.2.1 starting value. G-96 owns the hostile-pack corpus that fits them.
import type { ParamFile } from '@gm/schema';

const row = (name: string, value: number, unit: string, constrainedBy = 'P7.2.1 hostile pack corpus (G-96)') =>
  ({ name, value, min: 1, max: value * 10, unit, belongsTo: 'tools.content', basis: 'bible' as const, leaf: 'P7.2.1', constrainedBy, status: 'starting' as const });

export const PARAMS: ParamFile = {
  module: 'tools.content',
  version: 'g08.1',
  params: [
    row('content.maxPackBytes', 200 * 1024 * 1024, 'bytes'),
    row('content.maxFileBytes', 50 * 1024 * 1024, 'bytes'),
    row('content.maxNameChars', 200, 'chars'),
    row('content.maxNoteChars', 2000, 'chars'),
    row('content.maxFolderDepth', 6, 'count'),
    row('content.maxZipRatio', 100, 'ratio'),
  ],
};

export interface Limits {
  readonly maxPackBytes: number;
  readonly maxFileBytes: number;
  readonly maxNameChars: number;
  /** Applied to notes and, as the general cap, to every other string (P7.2.1 names only two classes). */
  readonly maxNoteChars: number;
  readonly maxFolderDepth: number;
  readonly maxZipRatio: number;
}

function p(name: string): number {
  const r = PARAMS.params.find((x) => x.name === name);
  if (!r) throw new Error(`unknown parameter ${name}`);
  return r.value;
}

export const DEFAULT_LIMITS: Limits = {
  maxPackBytes: p('content.maxPackBytes'),
  maxFileBytes: p('content.maxFileBytes'),
  maxNameChars: p('content.maxNameChars'),
  maxNoteChars: p('content.maxNoteChars'),
  maxFolderDepth: p('content.maxFolderDepth'),
  maxZipRatio: p('content.maxZipRatio'),
};
