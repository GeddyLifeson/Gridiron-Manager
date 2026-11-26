// The screen registry (O1.1.2): one record per screen. Navigation, hotkeys, help, search and tests
// read the same list. Start-up validation refuses two screens with one id, one route, or one
// hub-and-hotkey pair, and any bible id the index does not hold.
import SCREENS_FILE from './screens.json';
import { isHubId, type HubId } from './hubs.ts';
import { hasText } from './text.ts';

export const SCREEN_MODES = ['normal', 'gameday', 'certified'] as const;
export type ScreenMode = (typeof SCREEN_MODES)[number];

export interface ScreenRecord {
  id: string;
  hub: HubId;
  title: string;
  bible: string[];
  route: string;
  /** Calendar phases in which the screen has work to do. Empty means all (O1.4.1). */
  phases: string[];
  modes: ScreenMode[];
  version: 'v1' | 'v2';
  hotkey?: string;
  search_terms: string[];
  help_topic: string;
  /** S3 task rows the screen serves (O7.1.1). Filled by the career screens package. */
  task: string[];
}

export const SCREENS: readonly ScreenRecord[] = (SCREENS_FILE as unknown as { screens: ScreenRecord[] }).screens;

export interface RegistryProblem { screen: string; message: string }

/** Bible leaf or area id: `O1.2.1`, `H5`, `T`. */
const BIBLE_ID = /^[A-Z]\d*(\.\d+){0,2}$/;
const RESERVED_HOTKEYS = new Set(['/', '?', ' ']);

/**
 * Validates a registry. `knownBibleIds`, when given, is the set of ids in the bible index; every
 * `bible` entry must be in it.
 */
export function validateRegistry(screens: readonly ScreenRecord[], knownBibleIds?: ReadonlySet<string>): RegistryProblem[] {
  const out: RegistryProblem[] = [];
  const ids = new Map<string, number>(), routes = new Map<string, string>(), keys = new Map<string, string>();
  for (const s of screens) {
    const p = (message: string) => out.push({ screen: s.id, message });
    if (ids.has(s.id)) p(`duplicate id ${s.id}`);
    ids.set(s.id, 1);
    if (!isHubId(s.hub)) p(`unknown hub ${s.hub}`);
    if (!/^[a-z]+\.[a-z_]+$/.test(s.id) || s.id.split('.')[0] !== s.hub) p(`id ${s.id} must be <hub>.<screen>`);
    if (!s.route.startsWith(`/${s.hub}/`)) p(`route ${s.route} must start with /${s.hub}/`);
    const shape = s.route.replace(/:[A-Za-z]+/g, ':');
    const prev = routes.get(shape);
    if (prev) p(`route ${s.route} duplicates ${prev}`);
    routes.set(shape, s.id);
    if (s.hotkey !== undefined) {
      if (!/^[a-z]$/.test(s.hotkey) || RESERVED_HOTKEYS.has(s.hotkey)) p(`hotkey ${s.hotkey} must be one lower-case letter`);
      const k = `${s.hub}+${s.hotkey}`;
      const other = keys.get(k);
      if (other) p(`hub ${s.hub} hotkey ${s.hotkey} is already used by ${other}`);
      keys.set(k, s.id);
    } else if (!/:[A-Za-z]+/.test(s.route)) p('a screen without parameters needs a hotkey (O1.3.1: two key presses)');
    if (s.bible.length === 0) p('no bible leaf');
    for (const b of s.bible) {
      if (!BIBLE_ID.test(b)) p(`bible id ${b} is not a leaf or area id`);
      else if (knownBibleIds && !knownBibleIds.has(b)) p(`bible id ${b} is not in the bible index`);
    }
    if (!s.modes.length || s.modes.some((m) => !(SCREEN_MODES as readonly string[]).includes(m))) p('modes must be a non-empty list of normal, gameday, certified');
    if (!hasText(`help.screen.${s.id}`)) p('no help text (O1.5.3)');
    if (!s.title.trim()) p('no title');
  }
  return out;
}

export const screenById = (id: string, screens: readonly ScreenRecord[] = SCREENS): ScreenRecord | undefined => screens.find((s) => s.id === id);
export const screensInHub = (hub: HubId, screens: readonly ScreenRecord[] = SCREENS): ScreenRecord[] => screens.filter((s) => s.hub === hub);
export const routeParams = (s: ScreenRecord): string[] => [...s.route.matchAll(/:([A-Za-z]+)/g)].map((m) => m[1]!);
export const hasParams = (s: ScreenRecord): boolean => routeParams(s).length > 0;
