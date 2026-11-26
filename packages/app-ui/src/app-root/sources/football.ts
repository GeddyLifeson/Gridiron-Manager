// Football hub sources for the career root (plan item 2b): the playbook, game plan, call sheet, install
// board, print and the defensive call designer, all read from the seat's football desk in the played season
// (app-services `play.FootballDesk`). This file only turns screen intents into desk commands; every rule and
// figure is the desk's (P1.2.2). An edit on the call sheet is the sheet the console calls from, because the
// career root builds the console from the same desk.
import type { play } from '@gm/app-services';
import type { RouteSources } from '../../routes.ts';
import type { GameplanHost } from '../../screens/gameplan/index.ts';
import type { GameplanIntent, GameplanView, Unit } from '../../screens/gameplan/view.ts';
import type { PlaybookHost, Side } from '../../screens/playbook/index.ts';
import type { PlaybookIntent, PlaybookUi, SavedFilter, UiFilter } from '../../screens/playbook/view.ts';
import type { InstallHost } from '../../screens/install/index.ts';
import type { InstallIntent, InstallUi, Mode } from '../../screens/install/view.ts';
import type { PrintHost } from '../../screens/print/index.ts';
import type { DefenseDesignerView } from '../../screens/defense-designer/types.ts';

type Desk = play.FootballDesk;
type DeskCommand<K extends 'runGameplan' | 'runPlaybook'> = Parameters<Desk[K]>[1];

export interface FootballSourceOptions {
  /** Called after every command, so the root redraws the open screen. */
  readonly onChange?: (() => void) | undefined;
  /** The platform's print dialog (the browser's in the browser build). */
  readonly print?: (() => void) | undefined;
  /** Hands an exported file (sheet or plays) to the platform, for example as a download. */
  readonly saveFile?: (name: string, text: string) => void;
}

/** What the football hub takes from the career start (`hubSources`). */
export interface FootballHubInput {
  /** The seat's football desk; absent for a scripted season. */
  readonly football?: play.FootballDesk;
  /** Asks the career root to redraw (the port's subscription). */
  readonly changed?: () => void;
  readonly print?: () => void;
}

export type FootballSources = Required<Pick<RouteSources, 'gameplan' | 'print' | 'playbook' | 'install' | 'defenseDesigner'>>;

/** O3.4.2 "move up or down" is a reorder of the box's entries. */
function reorder(desk: Desk, unit: 'offense' | 'defense', boxId: string, entryId: string, by: -1 | 1): DeskCommand<'runGameplan'> | null {
  const box = desk.sheets()[unit].boxes.find((b) => b.id === boxId);
  if (!box) return null;
  const ids = box.entries.map((e) => e.id);
  const i = ids.indexOf(entryId), j = i + by;
  if (i < 0 || j < 0 || j >= ids.length) return null;
  [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  return { kind: 'reorder_box', boxId, entryIds: ids };
}

/** A game plan or call sheet intent as the desk's G-68 command; null for one the route handles itself. */
export function gameplanCommand(desk: Desk, unit: Unit, i: GameplanIntent): DeskCommand<'runGameplan'> | null {
  const side = unit === 'defense' ? 'defense' : 'offense';
  switch (i.kind) {
    case 'add_to_plan': return { kind: 'add_to_plan', entry: desk.planEntry(side, i.playId, i.situationId ? [i.situationId] : []) };
    case 'add_entry': return { kind: 'add_entry', boxId: i.boxId, entry: desk.sheetEntry(i.playId) };
    case 'move_entry': return reorder(desk, side, i.boxId, i.entryId, i.by);
    // No wristband format is set for the team yet: the command refuses and says so (G7.6.1).
    case 'fill_band': return { kind: 'fill_band', chosen: [] };
    case 'print': return null;
    default: return i;
  }
}

export function footballSources(desk: Desk, o: FootballSourceOptions = {}): FootballSources {
  const changed = () => o.onChange?.();
  const save = (name: string, file: string | undefined) => { if (file !== undefined) o.saveFile?.(name, file); };

  const gameplan: GameplanHost = {
    // The desk's read model is the app-services gameplan view; the screen declares the same shape (CR-G68-S3).
    view: (unit, opts) => desk.gameplanView(unit, { situation: opts.situation, paper: opts.paper, keyHints: opts.keyHints }) as GameplanView | null,
    dispatch: (unit, i) => {
      const cmd = gameplanCommand(desk, unit, i);
      if (!cmd) return;
      const r = desk.runGameplan(unit, cmd);
      if (r.ok) save(`${unit}-sheet-${desk.gameId ?? 'week'}.txt`, r.file);
      changed();
    },
  };
  const doPrint = o.print;
  const print: PrintHost = { ...gameplan, ...(doPrint ? { print: doPrint } : {}) };

  const saved = new Map<Side, SavedFilter[]>();
  const playbook: PlaybookHost = {
    view: (side, filter: UiFilter) => desk.playbookView(side, filter as Parameters<Desk['playbookView']>[1]),
    dispatch: (side, i: PlaybookIntent) => {
      switch (i.kind) {
        case 'save_filter': saved.set(side, [...(saved.get(side) ?? []).filter((f) => f.name !== i.name), { name: i.name, filter: i.filter }]); break;
        case 'add_to_install': desk.runInstall(side, 'week', { kind: 'add_plays', playIds: i.playIds }); break;
        case 'add_to_plan':
          if (side === 'special_teams') break;
          for (const id of i.playIds) desk.runGameplan(side, { kind: 'add_to_plan', entry: desk.planEntry(side, id, []) });
          break;
        case 'set_role': { const r = desk.runPlaybook(side, { kind: 'set_role', playId: i.playId, role: i.role as Extract<DeskCommand<'runPlaybook'>, { kind: 'set_role' }>['role'] }); void r; break; }
        default: { const r = desk.runPlaybook(side, i); if (r.ok) save(`${side}-plays.txt`, r.file); }
      }
      changed();
    },
    savedFilters: (side) => saved.get(side) ?? [],
  };

  // The board's mode is a view option; the last mode drawn per side is the one its commands use.
  const modes = new Map<Side, Mode>();
  const install: InstallHost = {
    view: (side, mode) => { modes.set(side, mode); return desk.installView(side, mode); },
    dispatch: (side, i: InstallIntent) => { desk.runInstall(side, modes.get(side) ?? 'week', i); changed(); },
  };

  const defenseDesigner: FootballSources['defenseDesigner'] = {
    load: (p, q) => desk.defenseDesigner({ callId: p.location.view.call ?? null, lookId: q.lookId, slot: q.slot, family: q.family }),
  };

  return { gameplan, print, playbook, install, defenseDesigner };
}
