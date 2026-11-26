// Moving a live world across a thread boundary (P2.1.2: the world runs in a worker). Structured clone
// keeps maps, arrays and plain records but not the event log's class or its option functions, so the log
// travels as its rows and is rebuilt on the other side with the same registry (worldLogOptions). The
// revived world has the same world hash as the one packed.
import type { EventTypeDef, WorldEvent } from '@gm/schema';
import { history } from '@gm/league';
import type { LiveWorld } from './types.ts';
import { worldLogOptions, type CreateWorldInput } from './world.ts';
import { plainPeople } from './people-table.ts';

/** A structured-clone-safe copy of a world: everything but the log, plus the log's rows. */
export type PackedWorld = Omit<LiveWorld, 'log' | 'logOptions'> & { readonly logRows: readonly WorldEvent[] };

export function packWorld(world: LiveWorld): PackedWorld {
  const { log, logOptions: _opts, ...rest } = world;
  // Cold people (people-table.ts) do not survive structured clone as a subclass: send every record live.
  return { ...rest, people: plainPeople(rest.people), logRows: log.rows() };
}

/** Rebuild a packed world. `eventTypes` must be the types the world was created with. */
export function unpackWorld(
  packed: PackedWorld, input: { readonly eventTypes?: readonly EventTypeDef[] } & Pick<CreateWorldInput, 'labelIds' | 'notabilityOf'> = {},
): LiveWorld {
  const { logRows, ...rest } = packed;
  const logOptions = worldLogOptions(rest.people, input);
  return { ...rest, logOptions, log: history.EventLog.fromRows(logRows, logOptions) };
}
