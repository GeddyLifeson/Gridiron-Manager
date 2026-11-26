// Q1.5.3 route crawl: for each seat (a rung at a level) open every route the registry lists for
// that seat, check for errors and empty required regions, and check that routes the seat does not
// list are refused. Also checks no route shows a control whose command the seat has no right to
// (S3). The seat's listed screens and rights come from the career screens package (G-85); until
// it lands, `placeholderSeats` lists every screen for every rung and no command rights.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Shell, SCREENS, buildPath, routeParams, resolve, type ScreenRecord, type RouteTable, type ShellContext } from '../../src/shell/index.ts';

export interface Seat {
  id: string;
  rung: number;
  level: 'pro' | 'college';
  /** Screen ids the registry lists for this seat. */
  listed: ReadonlySet<string>;
  /** Command names the seat holds rights for (S3). Controls carry `data-command`. */
  rights: ReadonlySet<string>;
  /** Calendar phase the crawl opens calendar-dependent screens at (Q1.5.3 edge case). */
  phaseId?: string | null;
  /** Open the game-day screens. */
  gameDay?: boolean;
}

/** Attribute a control carries to name the command it runs, so the crawl can check rights. */
export const COMMAND_ATTR = 'data-command';
/** Attribute a screen sets on a region whose data binding is missing. A route showing it fails. */
export const MISSING_BINDING_ATTR = 'data-binding-missing';

/** Nine rungs at both levels, every screen listed. Replaced by the S3 rows when G-85 lands. */
export function placeholderSeats(screens: readonly ScreenRecord[] = SCREENS): Seat[] {
  const out: Seat[] = [];
  for (const level of ['college', 'pro'] as const) for (let rung = 1; rung <= 9; rung++) {
    out.push({ id: `${level}-rung-${rung}`, rung, level, listed: new Set(screens.map((s) => s.id)), rights: new Set() });
  }
  return out;
}

/** Opens an address for a seat: the page markup, or null when refused. */
export type RouteOpener = (path: string, seat: Seat) => string | null;

/** The shell as an opener. `routes` are the screen packages' route entries; `listed` is enforced here. */
export function shellOpener(routes?: RouteTable, screens: readonly ScreenRecord[] = SCREENS): RouteOpener {
  return (path, seat) => {
    const loc = resolve(path, screens);
    if (loc && !seat.listed.has(loc.screenId)) return null;
    const context: ShellContext = { teamName: 'Rivertown', record: '3-1', phaseId: seat.phaseId ?? null, phaseLabel: 'Regular season', hoursLeft: 40, gameDay: seat.gameDay };
    return renderToStaticMarkup(createElement(Shell, { initialPath: path, routes, screens, context }));
  };
}

export interface RouteProblem { seat: string; screen: string; path: string; message: string }
export interface CrawlResult { opened: number; refused: number; problems: RouteProblem[] }

const BAD_TEXT = /\bundefined\b|\bNaN\b|\[object Object\]|\bnull\b/;
const stripTags = (h: string) => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

function mainRegion(html: string): string | null {
  const m = /<main\b[^>]*>([\s\S]*?)<\/main>/.exec(html);
  return m ? m[1]! : null;
}

export interface CrawlOptions {
  screens?: readonly ScreenRecord[];
  seats?: readonly Seat[];
  open?: RouteOpener;
  /** Entity ids for parameter routes. */
  param?: (screen: ScreenRecord, name: string) => string;
  /** Text a screen the package has not built shows; such a screen is not an error, it is reported as a stub. */
  stubPattern?: RegExp;
}

export function crawl(o: CrawlOptions = {}): CrawlResult & { stubs: string[] } {
  const screens = o.screens ?? SCREENS;
  const seats = o.seats ?? placeholderSeats(screens);
  const open = o.open ?? shellOpener(undefined, screens);
  const param = o.param ?? (() => 'x1');
  const stubPattern = o.stubPattern ?? /has not been merged yet/i;
  const problems: RouteProblem[] = [];
  const stubs = new Set<string>();
  let opened = 0, refused = 0;
  for (const seat of seats) for (const s of screens) {
    const path = buildPath(s, Object.fromEntries(routeParams(s).map((p) => [p, param(s, p)])));
    const p = (message: string) => problems.push({ seat: seat.id, screen: s.id, path, message });
    let html: string | null;
    try { html = open(path, seat); } catch (e) { p(`opening threw: ${(e as Error).message}`); continue; }
    const listed = seat.listed.has(s.id);
    const shown = html !== null && html.includes(`data-screen="${s.id}"`);
    if (!listed) {
      if (shown) p('route is not listed for this seat but opened');
      else refused++;
      continue;
    }
    if (!shown || html === null) { p('listed route did not open'); continue; }
    opened++;
    const main = mainRegion(html);
    if (main === null) { p('no main region'); continue; }
    const text = stripTags(main);
    if (!text) p('main region is empty');
    if (!html.includes(`<h1>${s.title}`)) p('screen title missing from the heading');
    if (BAD_TEXT.test(text)) p(`error text on screen: ${BAD_TEXT.exec(text)![0]}`);
    if (html.includes(MISSING_BINDING_ATTR)) p('missing data binding');
    if (stubPattern.test(text)) stubs.add(s.id);
    for (const m of html.matchAll(new RegExp(`${COMMAND_ATTR}="([^"]+)"`, 'g'))) {
      if (!seat.rights.has(m[1]!)) p(`control for command ${m[1]} but the seat has no right to it`);
    }
  }
  return { opened, refused, problems, stubs: [...stubs].sort() };
}
