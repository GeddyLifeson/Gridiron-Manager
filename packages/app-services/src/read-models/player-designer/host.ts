// Player designer host (G-92, bible D13.1; screens.json `people.player_designer`). The screen sends intents
// that name a person by id; the people designer core wants the person's record. This host holds one
// designer session, resolves ids through the save, hands every committed player to the save, and serves
// the screen model. It decides nothing: access (D13.1.1, N4), checks, archetypes and the staff grade are
// the core's. A copy of an existing person is possible only where the designer opens at all (outside a
// certified career, before the world starts, or in a sandbox world), so the sheet is authoring input and
// never a view into a running career's true ratings (MA-48).
import type { PersonRecord } from '@gm/schema';
import { designer } from '@gm/people';

type DesignerSession = designer.DesignerSession;
type DesignerEnv = designer.DesignerEnv;
type DesignerWorld = designer.DesignerWorld;
type DesignedPlayer = designer.DesignedPlayer;
export type PlayerDesignerView = designer.DesignerView;

/** What the screen sends (app-ui `DesignerUiIntent`): the core's intents, with a copy named by person id. */
export type PlayerDesignerIntent =
  | Exclude<designer.DesignerIntent, { kind: 'start_copy' }>
  | { kind: 'start_copy'; personId: number; inPlace: boolean };

export interface PlayerDesignerPorts {
  /** Where the designer is opened (career state and certification, D13.1.1). */
  world(): DesignerWorld;
  seasonYear(): number;
  /** Id the next new person takes (the save's id allocator). */
  nextPersonId(): number;
  /** Randomness, editor, date, region and grade scale (people `DesignerEnv`). */
  env(): DesignerEnv;
  /** The record of a person in the save or loaded pack, or null when there is none. */
  recordOf(personId: number): PersonRecord | null;
  /** Files a committed player: a new person, or the edited copy in place. Sandbox and "edited" marks ride on the player. */
  file(player: DesignedPlayer): void;
}

export interface PlayerDesignerHost {
  /** The screen model; null only before the first open. */
  view(): PlayerDesignerView | null;
  dispatch(intent: PlayerDesignerIntent): void;
  /** Opens (or reopens) the designer for the current world; a closed designer carries the refusal. */
  open(): void;
  /** People filed since the host was made, oldest first. */
  filed(): readonly number[];
}

const refusal = (rule: string, message: string, problems: string[] = []) => ({ ok: false as const, rule, message, problems });

export function playerDesignerHost(ports: PlayerDesignerPorts): PlayerDesignerHost {
  let session: DesignerSession | null = null;
  const filed: number[] = [];
  const open = () => { session = designer.openDesigner(ports.world(), ports.seasonYear(), ports.nextPersonId()); };
  return {
    open,
    view: () => (session ? designer.designerView(session, ports.env()) : null),
    filed: () => [...filed],
    dispatch(intent) {
      if (!session) open();
      const s = session!;
      let core: designer.DesignerIntent;
      if (intent.kind === 'start_copy') {
        const record = ports.recordOf(intent.personId);
        if (!record) { session = { ...s, result: refusal('D13.1.1', `no person ${intent.personId} to copy`, ['personId']) }; return; }
        core = { kind: 'start_copy', record, inPlace: intent.inPlace };
      } else core = intent;
      // The world can change between intents (the career starts): access is checked on the live world.
      const r = designer.applyIntent({ ...s, world: ports.world() }, core, ports.env());
      session = r.session;
      if (r.committed) { ports.file(r.committed); filed.push(r.committed.record.id); }
    },
  };
}
