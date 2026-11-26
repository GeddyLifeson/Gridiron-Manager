// The people_pack v1 format as data (U7.1.1, P7.3.1). The tables, columns, forbidden column words,
// positions and the protected event list live in packages/people/data/people-pack-schema/ so they can be audited.
import schemaJson from '../../data/people-pack-schema/people_pack_v1.json' with { type: 'json' };
import protectedJson from '../../data/people-pack-schema/protected-events.json' with { type: 'json' };

export type ColumnKind = 'text' | 'int' | 'num' | 'iso_date' | 'enum' | 'key_list';
export interface ColumnSpec { name: string; required?: boolean; kind: ColumnKind; values?: string[] }
export interface TableSpec { name: string; columns: ColumnSpec[]; optional?: boolean; deltaOnly?: boolean; keepsExtraStats?: boolean }

export const PACK_SCHEMA_ID = schemaJson.schema_id;
export const PACK_SCHEMA_VERSION = schemaJson.schema_version;

export const TABLE_SPECS: readonly TableSpec[] = Object.entries(schemaJson.tables).map(([name, t]) => {
  const spec: TableSpec = { name, columns: t.columns as ColumnSpec[] };
  const raw = t as { optional?: boolean; deltaOnly?: boolean; extraColumns?: string };
  if (raw.optional) spec.optional = true;
  if (raw.deltaOnly) spec.deltaOnly = true;
  if (raw.extraColumns === 'stats') spec.keepsExtraStats = true;
  return spec;
});

export const TABLE_BY_NAME: ReadonlyMap<string, TableSpec> = new Map(TABLE_SPECS.map((t) => [t.name, t]));
export const TABLE_ORDER: readonly string[] = TABLE_SPECS.map((t) => t.name).sort();

export const MANIFEST_SPEC = schemaJson.manifest;

/** Forbidden column words by group; a column holding one is dropped and listed (P7.3.1, U6.1.1 rule 1). */
export const FORBIDDEN_WORDS: ReadonlyMap<string, string> = new Map(
  Object.entries(schemaJson.forbidden_column_words)
    .filter(([k]) => k !== '$comment')
    .flatMap(([group, words]) => (words as string[]).map((w) => [w, group] as const)),
);

export const POSITIONS: ReadonlySet<string> = new Set(schemaJson.positions);
export const POSITION_ALIASES: Readonly<Record<string, string>> = schemaJson.position_aliases;

export interface ProtectedType { id: string; words: string[] }
export const PROTECTED_EVENT_TYPES: readonly ProtectedType[] = protectedJson.protected;
export const ALLOWED_FOOTBALL_EVENTS: readonly string[] = protectedJson.allowed_football_events;

/**
 * Limits. Starting values from P7.2.1 (pack size, file size, people count, string length, expansion ratio,
 * folder depth) and U7.3.2 rule 2 (value bounds, "starting bounds"). They are starting values in the bible,
 * not football facts, so each is a named assumption constant with its leaf (D-09).
 */
export const PARAMS = {
  maxPackBytes: { value: 200_000_000, unit: 'bytes', basis: 'assumption', leaf: 'P7.2.1' },
  maxFileBytes: { value: 50_000_000, unit: 'bytes', basis: 'assumption', leaf: 'P7.2.1' },
  maxPeople: { value: 500_000, unit: 'people', basis: 'assumption', leaf: 'P7.2.1' },
  maxStringChars: { value: 200, unit: 'characters', basis: 'assumption', leaf: 'P7.2.1' },
  maxExpansionRatio: { value: 100, unit: 'ratio', basis: 'assumption', leaf: 'P7.2.1' },
  maxFolderDepth: { value: 6, unit: 'folders', basis: 'assumption', leaf: 'P7.2.1' },
  heightMinIn: { value: 60, unit: 'inches', basis: 'assumption', leaf: 'U7.3.2' },
  heightMaxIn: { value: 90, unit: 'inches', basis: 'assumption', leaf: 'U7.3.2' },
  weightMinLb: { value: 140, unit: 'pounds', basis: 'assumption', leaf: 'U7.3.2' },
  weightMaxLb: { value: 420, unit: 'pounds', basis: 'assumption', leaf: 'U7.3.2' },
  ageMinYears: { value: 16, unit: 'years', basis: 'assumption', leaf: 'U7.3.2' },
  ageMaxYears: { value: 90, unit: 'years', basis: 'assumption', leaf: 'U7.3.2' },
  checksumShortChars: { value: 12, unit: 'characters', basis: 'bible', leaf: 'U7.3.1' },
} as const;
