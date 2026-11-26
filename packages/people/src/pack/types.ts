import type { PARAMS } from './spec.ts';

/** One file of a pack as the container layer (zip reader, folder reader) hands it over. */
export interface PackFile {
  path: string;
  bytes: Uint8Array;
  /** Size inside the zip, when the file came from one. Used for the expansion ratio check (P7.2.1). */
  compressedBytes?: number;
}

export interface PackManifest {
  schema_id: string;
  schema_version: number;
  pack_id: string;
  name: string;
  version: string;
  author: string;
  contains: 'generated' | 'real' | 'mixed';
  source_statement: string;
  snapshot_date?: string;
  seasons_covered?: string;
  seasons_skipped?: string;
  team_names?: 'plain' | 'omitted';
  redistribution?: 'yes' | 'no';
  /** A delta pack names its base (U7.2.2 rule 1). */
  base?: { id: string; hash: string };
  /** Counts by group the maker claims; checked against the rows (U7.3.2 rule 4). */
  counts?: Record<string, number>;
}

/** A row holds text cells keyed by column name. Blank is the empty string. */
export type PackRow = Record<string, string>;

export interface PackTable {
  name: string;
  /** Schema columns present, in schema order, then extra statistic columns sorted by name. */
  columns: string[];
  rows: PackRow[];
}

/** A pack that passed validation. Every cell is already in canonical text form. */
export interface PackData {
  manifest: PackManifest;
  tables: Record<string, PackTable>;
}

export type Severity = 'fail' | 'reject' | 'drop' | 'warn' | 'info';

export interface PackProblem {
  severity: Severity;
  code: string;
  message: string;
  file?: string;
  table?: string;
  column?: string;
  /** 1-based data row number in the table file. */
  row?: number;
}

export interface TableCount { read: number; kept: number; rejected: number }

export interface ImportReport {
  status: 'pass' | 'warn' | 'fail';
  problems: PackProblem[];
  counts: Record<string, TableCount>;
  /** Files that were not read (wrong type, unknown table) and why. */
  ignoredFiles: { path: string; reason: string }[];
  droppedColumns: { table: string; column: string; reason: string }[];
  /** Present when the pack did not fail. Full 64 hex characters, and the first 12 (U7.3.1). */
  checksum?: string;
  checksumShort?: string;
  /** True when the pack carries an overrides table (U7.1.1). */
  edited: boolean;
}

export interface ValidateOptions {
  /** World start year for the age bound. Without it the age check is skipped. */
  worldStartYear?: number;
  /** Extra position aliases (content), added to the shipped list. */
  positionAliases?: Record<string, string>;
}

export type Param = (typeof PARAMS)[keyof typeof PARAMS];
