// Navigation state (O1.1.1, O1.1.3, O1.3.1, O1.3.3, O1.4.2) as a pure reducer, so every rule can
// be tested without a display. UI state only: nothing here is written to the save.
import { HUB_IDS, hubForKey, type HubId } from './hubs.ts';
import { SCREENS, screenById, screensInHub, hasParams, type ScreenRecord } from './registry.ts';
import { resolve, buildPath, href, type Location } from './routes.ts';

/** O1.3.3: the history stack holds up to 100 routes. */
export const HISTORY_MAX = 100;

export type Overlay = null | 'palette' | 'keys' | 'help';
export type NavMode = 'normal' | 'gameday';

export interface NavState {
  location: Location;
  back: Location[];
  forward: Location[];
  /** The last-used screen of each hub (O1.1.1: a hub opens its last-used screen). */
  hubLast: Partial<Record<HubId, string>>;
  /** A hub key was pressed; a letter now picks a screen in it (O1.3.1). */
  pendingHub: HubId | null;
  overlay: Overlay;
  mode: NavMode;
  /** A reference screen open as a side panel during a game (O1.4.2: glossary, display settings). */
  panelScreen: string | null;
  /** History held while a game runs and given back when it ends (O1.3.3). */
  stashed: { back: Location[]; forward: Location[] } | null;
  /** Scroll and other view state per address, restored on return (O1.3.3). */
  scroll: Record<string, number>;
  /** Text id of the last refusal, shown in the status line; null when none. */
  notice: { id: string; slots: Record<string, string> } | null;
}

export type NavAction =
  | { type: 'navigate'; to: string }
  | { type: 'hub'; hub: HubId }
  | { type: 'screenKey'; letter: string }
  | { type: 'back' }
  | { type: 'forward' }
  | { type: 'escape' }
  | { type: 'overlay'; overlay: Overlay }
  | { type: 'setView'; view: Record<string, string> }
  | { type: 'setScroll'; y: number }
  | { type: 'startGame' }
  | { type: 'endGame' }
  | { type: 'clearPending' };

export const DEFAULT_PATH = '/office/today';

/** The first screen of a hub without parameters: where a hub opens before it has been used. */
export function hubHome(hub: HubId, screens: readonly ScreenRecord[] = SCREENS): string {
  const s = screensInHub(hub, screens).find((x) => !hasParams(x));
  if (!s) throw new Error(`hub ${hub} has no screen without parameters`);
  return buildPath(s);
}

export function initialNav(path: string = DEFAULT_PATH, screens: readonly ScreenRecord[] = SCREENS): NavState {
  const location = resolve(path, screens) ?? resolve(DEFAULT_PATH, screens)!;
  const s = screenById(location.screenId, screens)!;
  return {
    location, back: [], forward: [], hubLast: { [s.hub]: href(location) }, pendingHub: null, overlay: null,
    mode: 'normal', panelScreen: null, stashed: null, scroll: {}, notice: null,
  };
}

const trim = (xs: Location[]) => (xs.length > HISTORY_MAX ? xs.slice(xs.length - HISTORY_MAX) : xs);
const same = (a: Location, b: Location) => href(a) === href(b);

/** Whether a screen may open as the main screen in this mode. */
export function canOpen(state: NavState, s: ScreenRecord): boolean {
  return state.mode === 'normal' || s.hub === 'game';
}

function go(state: NavState, loc: Location, screens: readonly ScreenRecord[]): NavState {
  const s = screenById(loc.screenId, screens)!;
  if (state.mode === 'gameday' && s.hub !== 'game') {
    // O1.4.2: during a game only the Game hub opens; reference screens marked for game day open as a side panel.
    if (s.modes.includes('gameday')) return { ...state, panelScreen: s.id, pendingHub: null, notice: null };
    return { ...state, pendingHub: null, notice: { id: 'shell.gameDayLocked', slots: {} } };
  }
  if (same(loc, state.location)) return { ...state, pendingHub: null, overlay: null, notice: null };
  return {
    ...state,
    location: loc,
    back: trim([...state.back, state.location]),
    forward: [],
    hubLast: { ...state.hubLast, [s.hub]: href(loc) },
    pendingHub: null,
    overlay: null,
    notice: null,
  };
}

export function navReducer(state: NavState, action: NavAction, screens: readonly ScreenRecord[] = SCREENS): NavState {
  switch (action.type) {
    case 'navigate': {
      const loc = resolve(action.to, screens);
      if (!loc) return { ...state, notice: { id: 'shell.unknownRoute', slots: { path: action.to } } };
      return go(state, loc, screens);
    }
    case 'hub': {
      if (!HUB_IDS.includes(action.hub)) return state;
      if (state.mode === 'gameday' && action.hub !== 'game') return { ...state, pendingHub: null, notice: { id: 'shell.gameDayLocked', slots: {} } };
      const target = state.hubLast[action.hub] ?? hubHome(action.hub, screens);
      const next = go(state, resolve(target, screens)!, screens);
      return { ...next, pendingHub: action.hub };
    }
    case 'screenKey': {
      const hub = state.pendingHub;
      if (!hub) return state;
      const s = screensInHub(hub, screens).find((x) => x.hotkey === action.letter.toLowerCase());
      if (!s || hasParams(s)) return { ...state, pendingHub: null };
      return go(state, resolve(buildPath(s), screens)!, screens);
    }
    case 'back': {
      const prev = state.back[state.back.length - 1];
      if (!prev) return { ...state, pendingHub: null };
      const s = screenById(prev.screenId, screens)!;
      return {
        ...state, location: prev, back: state.back.slice(0, -1), forward: [state.location, ...state.forward].slice(0, HISTORY_MAX),
        hubLast: { ...state.hubLast, [s.hub]: href(prev) }, pendingHub: null, overlay: null, notice: null,
      };
    }
    case 'forward': {
      const [next, ...rest] = state.forward;
      if (!next) return state;
      const s = screenById(next.screenId, screens)!;
      return {
        ...state, location: next, back: trim([...state.back, state.location]), forward: rest,
        hubLast: { ...state.hubLast, [s.hub]: href(next) }, pendingHub: null, overlay: null, notice: null,
      };
    }
    case 'escape': {
      if (state.overlay) return { ...state, overlay: null };
      if (state.pendingHub) return { ...state, pendingHub: null };
      if (state.panelScreen) return { ...state, panelScreen: null };
      return navReducer(state, { type: 'back' }, screens);
    }
    case 'overlay': return { ...state, overlay: action.overlay, pendingHub: null };
    case 'setView': {
      // View options (sort, filter, tab) change the address in place: not a new history entry.
      const loc = { ...state.location, view: { ...action.view } };
      const s = screenById(loc.screenId, screens)!;
      return { ...state, location: loc, hubLast: { ...state.hubLast, [s.hub]: href(loc) } };
    }
    case 'setScroll': return { ...state, scroll: { ...state.scroll, [href(state.location)]: action.y } };
    case 'startGame': {
      if (state.mode === 'gameday') return state;
      const console_ = resolve('/game/console', screens)!;
      return {
        ...state, mode: 'gameday', stashed: { back: state.back, forward: state.forward }, back: [], forward: [],
        location: console_, hubLast: { ...state.hubLast, game: href(console_) }, pendingHub: null, overlay: null, panelScreen: null, notice: null,
      };
    }
    case 'endGame': {
      if (state.mode !== 'gameday') return state;
      const st = state.stashed ?? { back: [], forward: [] };
      return { ...state, mode: 'normal', back: st.back, forward: st.forward, stashed: null, panelScreen: null, notice: null };
    }
    case 'clearPending': return state.pendingHub ? { ...state, pendingHub: null } : state;
  }
}

/** Maps a global key-map action to a navigation action (O1.3.1). Returns null for actions the shell does not own. */
export function navActionFor(action: string): NavAction | null {
  if (action.startsWith('hub.')) {
    const hub = action.slice(4) as HubId;
    return HUB_IDS.includes(hub) ? { type: 'hub', hub } : null;
  }
  switch (action) {
    case 'nav.back': return { type: 'escape' };
    case 'nav.history_back': return { type: 'back' };
    case 'nav.history_forward': return { type: 'forward' };
    case 'palette.open': return { type: 'overlay', overlay: 'palette' };
    case 'help.keys': return { type: 'overlay', overlay: 'keys' };
    case 'help.screen': return { type: 'overlay', overlay: 'help' };
    default: return null;
  }
}

export { hubForKey };
