// Helpers for module parameter files (contract decision D-09, J6.8.1). A module lists its tuning
// constants as short rows; `defineParams` turns them into the contract's `ParamFile`. A basis of
// 'assumption' means the module's author chose the number and no real-world source backs it.
import type { ParamFile, ParamTable, TuningParam } from '@gm/schema';

/** [name, value, min, max, unit, basis, leaf, constrainedBy] */
export type ParamRow = readonly [string, number, number, number, string, 'bible' | 'assumption', string, string];

export function defineParams(module: string, version: string, rows: readonly ParamRow[]): ParamFile {
  const params: TuningParam[] = rows.map(([name, value, min, max, unit, basis, leaf, constrainedBy]) => ({
    name: `${module}.${name}`, value, min, max, unit, belongsTo: module, basis, leaf, constrainedBy, status: 'starting',
  }));
  return { module, version, params };
}

/**
 * A read-only table over parameter files. The integrator owns the merged table of the whole engine;
 * this builder exists so a module and its tests can run from their own files. Duplicate names throw.
 */
export function paramTableFromFiles(files: readonly ParamFile[]): ParamTable {
  const values = new Map<string, number>();
  for (const f of files) for (const p of f.params) {
    if (values.has(p.name)) throw new Error(`duplicate parameter ${p.name}`);
    values.set(p.name, p.value);
  }
  const version = files.map((f) => `${f.module}@${f.version}`).join(',');
  return {
    version,
    has: (name) => values.has(name),
    num: (name) => {
      const v = values.get(name);
      if (v === undefined) throw new Error(`unknown parameter ${name}`);
      return v;
    },
  };
}

/**
 * A module's resolved parameters are read by name inside the tick. An object filled one computed key at
 * a time is kept by the JavaScript engine as a hash table once it has more than a dozen keys, which
 * makes every read in the tick a hash lookup. A copy made in one go has the plain fixed layout. Same
 * keys, same values, same key order (G-97).
 */
export function fastParams(out: Readonly<Record<string, number>>): Record<string, number> {
  return { ...out };
}
