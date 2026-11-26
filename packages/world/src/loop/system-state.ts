// The live world's carried system state to and from its save slot (CR-G28-1, table `systemState`).
// The encoding lives with the row schema in @gm/schema (world/system.ts); this file binds it to LiveWorld.
import { systemStateFromRows, systemStateRows, type SystemStateEntry } from '@gm/schema';
import type { LiveWorld } from './types.ts';

/** Every system's state as save rows, sorted by key. */
export function saveSystemState(world: LiveWorld): SystemStateEntry[] {
  return systemStateRows(world.systemState);
}

/** Replaces the world's system state with the saved rows (validated, Maps and Sets restored). */
export function loadSystemState(world: LiveWorld, rows: readonly SystemStateEntry[]): void {
  const restored = systemStateFromRows(rows);
  world.systemState.clear();
  for (const [k, v] of restored) world.systemState.set(k, v);
}
