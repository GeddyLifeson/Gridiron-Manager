// The application shell (O1.5.1): top bar, hub bar, the screen, an optional side panel and a status
// line, one frame for every screen. It holds no football logic and reads only what it is given;
// screens arrive as route entries keyed by registry id (game-build-plan section 2, "Screens").
import { Fragment, useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { HUBS, type HubId } from './hubs.ts';
import { SCREENS, screenById, screensInHub, hasParams, routeParams, type ScreenRecord } from './registry.ts';
import { href, type Location } from './routes.ts';
import { initialNav, navReducer, navActionFor, type NavState } from './navigation.ts';
import { applyOverrides, actionFor, activeBindings, chordOf, displayChord, type Binding, type KeyOverrides } from './keymap.ts';
import { search, screenItems, type PaletteItem } from './palette.ts';
import { alertLine, officeMarked, type Alert } from './alerts.ts';
import { availability } from './phase.ts';
import { t } from './text.ts';
import { tokenVariables, v, type ThemeId, type ColourVisionId } from '../tokens/index.ts';
import { SoundStageCaptions, placeFromNav, settingsGetter, unlockOnFirstInput, type SoundStage } from '../audio/stage/index.ts';

/** O1.5.1: the minimum supported window. */
export const MIN_WINDOW_PX = { width: 1280, height: 720 } as const;
/** O1.5.1: below this width the side panel overlays the screen instead of taking a column. */
export const SIDE_PANEL_INLINE_MIN_PX = 1440;

export type PermissionState = 'yours' | 'assigned' | 'suggest' | 'read';

/** What a screen package hands the shell for its registry id. */
export interface ScreenProps {
  screen: ScreenRecord;
  location: Location;
  readOnly: boolean;
  navigate(to: string): void;
  setView(view: Record<string, string>): void;
}
export interface RouteEntry { render(p: ScreenProps): ReactNode }
export type RouteTable = Record<string, RouteEntry>;

/** The top bar's facts, from the read models (O1.5.1). */
export interface ShellContext {
  teamName?: string;
  record?: string;
  phaseId?: string | null;
  phaseLabel?: string;
  dateLabel?: string;
  hoursLeft?: number;
  saveState?: string;
  simActivity?: string;
  gameDay?: boolean;
}

/** Display settings the shell applies (the O5.3 store's values, passed in by the host). */
export interface ShellDisplay {
  theme: 'system' | ThemeId;
  colourVision: ColourVisionId;
  interfaceScalePct: number;
  textScalePct: number;
  reducedMotion: boolean;
}

/** Keeps the address bar in step in the browser build; the desktop build passes none (O1.1.3). */
export interface RouteHistoryAdapter {
  current(): string;
  push(path: string): void;
  listen(fn: (path: string) => void): () => void;
  /** When present, back and forward go through the browser so its own buttons share one stack (O1.3.3). */
  back?(): void;
  forward?(): void;
}

export interface ShellProps {
  routes?: RouteTable;
  screens?: readonly ScreenRecord[];
  initialPath?: string;
  context?: ShellContext;
  display?: Partial<ShellDisplay>;
  keyOverrides?: KeyOverrides;
  alerts?: readonly Alert[];
  alertLevels?: Record<string, unknown>;
  /** Entity index from the worker for the palette (players, staff, teams, plays, terms). */
  paletteItems?: readonly PaletteItem[];
  permissions?: Record<string, PermissionState>;
  sidePanel?: ReactNode;
  history?: RouteHistoryAdapter;
  onAdvance?: () => void;
  /** Clock for the alert line, in milliseconds; defaults to the wall clock (outside the core). */
  now?: () => number;
  /** Test hook: the navigation state after each change. */
  onNavChange?: (s: NavState) => void;
  /** The sound stage (audio engine, drivers, menu music, captions); null or absent runs silent. */
  soundStage?: SoundStage | null;
  /** Current settings values (`SettingsStore.all()`), re-read by the sound stage on change. */
  audioSettings?: Readonly<Record<string, unknown>>;
  /** The calendar is in the offseason (menu music picks the offseason loop). */
  offseason?: boolean;
}

const DEFAULT_DISPLAY: ShellDisplay = { theme: 'system', colourVision: 'none', interfaceScalePct: 100, textScalePct: 100, reducedMotion: false };

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveTheme(theme: ShellDisplay['theme'], prefersDark = systemPrefersDark()): ThemeId {
  return theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme;
}

/** The style object for the shell root: token variables plus the colour scheme. */
export function rootStyle(d: ShellDisplay, prefersDark?: boolean): Record<string, string> {
  const vars = tokenVariables({ theme: resolveTheme(d.theme, prefersDark), colourVision: d.colourVision, interfaceScalePct: d.interfaceScalePct, textScalePct: d.textScalePct });
  const { 'color-scheme': scheme, ...rest } = vars;
  return { ...rest, colorScheme: scheme ?? 'light' };
}

function isTextTarget(target: EventTarget | null): boolean {
  const el = target as { tagName?: string; isContentEditable?: boolean; type?: string } | null;
  if (!el || !el.tagName) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  return el.tagName === 'INPUT' && !['button', 'checkbox', 'radio', 'submit', 'reset', 'range'].includes(el.type ?? 'text');
}

/** The key contexts active on a screen, outermost first (O5.2.1). */
export function contextsFor(nav: NavState): string[] {
  if (nav.mode === 'gameday' && nav.location.screenId === 'game.console') return ['global', 'console.offense'];
  return ['global'];
}

/** Global actions the shell still handles while the console owns the keyboard (O1.3.1). */
const CONSOLE_GLOBALS = new Set(['nav.back', 'help.keys']);

const css = `
.gm-shell { position: fixed; inset: 0; display: grid; grid-template-columns: auto 1fr auto; grid-template-rows: auto auto 1fr auto;
  grid-template-areas: "top top top" "hubs crumbs crumbs" "hubs main side" "status status status";
  background: ${v('surface.bg')}; color: ${v('text.ink')}; font-family: var(--gm-font); font-size: var(--gm-type-md);
  font-feature-settings: var(--gm-font-features); line-height: 1.4; min-width: ${MIN_WINDOW_PX.width}px; min-height: ${MIN_WINDOW_PX.height}px; }
.gm-shell *:focus-visible { outline: var(--gm-line-weight-thick) solid ${v('line.focus')}; outline-offset: 1px; }
.gm-top { grid-area: top; display: flex; gap: calc(var(--gm-space) * 4); align-items: center; padding: calc(var(--gm-space) * 2) calc(var(--gm-space) * 3);
  background: ${v('surface.panel')}; border-bottom: var(--gm-line-weight-hair) solid ${v('line.default')}; }
.gm-top .gm-team { font-weight: 600; font-size: var(--gm-type-lg); }
.gm-top .gm-badge { padding: 0 calc(var(--gm-space) * 2); border: var(--gm-line-weight-hair) solid ${v('line.strong')}; border-radius: calc(var(--gm-space) * 2); }
.gm-top .gm-alert { margin-left: auto; color: ${v('text.muted')}; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 40%; }
.gm-top .gm-alert[data-level="urgent"] { color: ${v('state.bad')}; font-weight: 600; }
.gm-hubs { grid-area: hubs; display: flex; flex-direction: column; width: calc(var(--gm-space) * 48); box-sizing: border-box; background: ${v('surface.panel')}; border-right: var(--gm-line-weight-hair) solid ${v('line.default')};
  padding: var(--gm-space) 0; overflow-y: auto; }
.gm-hub { display: block; text-align: left; border: 0; background: none; color: ${v('text.ink')}; padding: var(--gm-space) calc(var(--gm-space) * 3); cursor: pointer; font: inherit; }
.gm-hub[aria-current="true"] { background: ${v('surface.raised')}; font-weight: 600; box-shadow: inset var(--gm-line-weight-thick) 0 0 ${v('accent.default')}; }
.gm-hub[aria-disabled="true"] { color: ${v('text.muted')}; cursor: not-allowed; }
.gm-hub .gm-key { display: inline-block; width: calc(var(--gm-space) * 4); color: ${v('text.muted')}; }
.gm-hub .gm-mark { color: ${v('state.bad')}; font-weight: 700; }
.gm-screens { list-style: none; margin: 0 0 var(--gm-space) 0; padding: 0; }
.gm-screens button { display: block; width: 100%; text-align: left; border: 0; background: none; color: ${v('text.ink')}; font: inherit; font-size: var(--gm-type-sm);
  padding: calc(var(--gm-space) / 2) calc(var(--gm-space) * 3) calc(var(--gm-space) / 2) calc(var(--gm-space) * 7); cursor: pointer; }
.gm-screens button[aria-current="page"] { color: ${v('accent.default')}; font-weight: 600; }
.gm-screens .gm-key { color: ${v('text.muted')}; margin-right: var(--gm-space); }
.gm-crumbs { grid-area: crumbs; padding: var(--gm-space) calc(var(--gm-space) * 4); color: ${v('text.muted')}; font-size: var(--gm-type-sm); }
.gm-crumbs a { color: inherit; }
.gm-main { grid-area: main; overflow: auto; padding: calc(var(--gm-space) * 2) calc(var(--gm-space) * 4); min-width: 0; }
.gm-main h1 { font-size: var(--gm-type-xl); margin: 0 0 calc(var(--gm-space) * 2) 0; display: flex; gap: calc(var(--gm-space) * 3); align-items: baseline; }
.gm-perm { font-size: var(--gm-type-sm); font-weight: 600; padding: 0 calc(var(--gm-space) * 2); border: var(--gm-line-weight-hair) solid ${v('line.strong')}; border-radius: var(--gm-space); }
.gm-line { color: ${v('text.muted')}; }
.gm-side { grid-area: side; width: calc(var(--gm-space) * 90); background: ${v('surface.panel')}; border-left: var(--gm-line-weight-hair) solid ${v('line.default')}; overflow: auto; padding: calc(var(--gm-space) * 3); }
@media (max-width: ${SIDE_PANEL_INLINE_MIN_PX - 1}px) { .gm-side { position: absolute; right: 0; top: 0; bottom: 0; z-index: 2; box-shadow: 0 0 0 var(--gm-line-weight-hair) ${v('line.strong')}; } }
.gm-status { grid-area: status; display: flex; gap: calc(var(--gm-space) * 6); padding: var(--gm-space) calc(var(--gm-space) * 3); font-size: var(--gm-type-sm);
  background: ${v('surface.panel')}; border-top: var(--gm-line-weight-hair) solid ${v('line.default')}; color: ${v('text.muted')}; }
.gm-status .gm-notice { color: ${v('state.caution')}; }
/* PV-14 captions strip: over the screen, above the status line, out of the grid flow; never takes focus or clicks. */
.gm-captions { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(var(--gm-space) * 10); max-width: 60%; z-index: 5; pointer-events: none; }
.gm-overlay { position: absolute; inset: 0; z-index: 5; display: flex; justify-content: center; align-items: flex-start; padding-top: calc(var(--gm-space) * 20); }
.gm-dialog { background: ${v('surface.panel')}; color: ${v('text.ink')}; border: var(--gm-line-weight-medium) solid ${v('line.strong')}; border-radius: calc(var(--gm-space) * 2);
  width: calc(var(--gm-space) * 160); max-height: 70%; overflow: auto; padding: calc(var(--gm-space) * 4); }
.gm-dialog h2 { font-size: var(--gm-type-lg); margin: 0 0 calc(var(--gm-space) * 2) 0; }
.gm-dialog input { width: 100%; box-sizing: border-box; font: inherit; padding: var(--gm-space) calc(var(--gm-space) * 2); background: ${v('surface.bg')}; color: ${v('text.ink')};
  border: var(--gm-line-weight-hair) solid ${v('line.strong')}; }
.gm-results { list-style: none; margin: calc(var(--gm-space) * 2) 0 0 0; padding: 0; }
.gm-results li { padding: calc(var(--gm-space) / 2) calc(var(--gm-space) * 2); display: flex; gap: calc(var(--gm-space) * 3); }
.gm-results li[aria-selected="true"] { background: ${v('surface.raised')}; box-shadow: inset var(--gm-line-weight-thick) 0 0 ${v('accent.default')}; }
.gm-results .gm-group { color: ${v('text.muted')}; width: calc(var(--gm-space) * 28); font-size: var(--gm-type-sm); }
.gm-dialog table { border-collapse: collapse; width: 100%; }
.gm-dialog td, .gm-dialog th { text-align: left; height: var(--gm-row); padding: 0 calc(var(--gm-space) * 3) 0 0; border-bottom: var(--gm-line-weight-hair) solid ${v('line.default')}; }
.gm-shell[data-reduced-motion="true"] * { transition: none !important; animation: none !important; }
`;

function Placeholder({ screen }: { screen: ScreenRecord }) {
  return <p className="gm-line">{t('shell.screenNotBuilt', { leaves: screen.bible.join(', ') })}</p>;
}

function Palette({ items, recent, onPick, onClose }: { items: readonly PaletteItem[]; recent: readonly string[]; onPick(i: PaletteItem): void; onClose(): void }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const results = useMemo(() => search(items, q, recent), [items, q, recent]);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className="gm-overlay">
      <div className="gm-dialog" role="dialog" aria-modal="true" aria-label={t('palette.title')}>
        <h2>{t('palette.title')}</h2>
        <input ref={ref} value={q} aria-label={t('palette.placeholder')} placeholder={t('palette.placeholder')} role="combobox" aria-expanded="true" aria-controls="gm-palette-results"
          onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); onClose(); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, Math.max(results.length - 1, 0))); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            else if (e.key === 'Enter') { e.preventDefault(); const r = results[sel]; if (r) onPick(r); }
          }} />
        <ul className="gm-results" id="gm-palette-results" role="listbox">
          {q && results.length === 0 && <li>{t('palette.none')}</li>}
          {results.map((r, i) => (
            <li key={`${r.group}:${r.id}`} role="option" aria-selected={i === sel} onMouseDown={(e) => { e.preventDefault(); onPick(r); }}>
              <span className="gm-group">{t(`palette.group.${r.group}`)}</span><span>{r.label}</span>{r.detail && <span className="gm-line">{r.detail}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function actionLabel(b: Binding): string {
  if (b.action.startsWith('hub.')) return t('action.global.hub', { hub: t(`hub.${b.action.slice(4)}`) });
  const map: Record<string, string> = {
    'nav.back': 'action.global.back', 'nav.history_back': 'action.global.historyBack', 'nav.history_forward': 'action.global.historyForward',
    'palette.open': 'action.global.palette', 'help.keys': 'action.global.keys', 'help.screen': 'action.global.help', 'office.advance': 'action.office.advance',
  };
  return map[b.action] ? t(map[b.action]!) : b.action;
}

/** Keys active on the current screen and nothing inactive (O1.3.1 acceptance 2). */
export function keysOnScreen(nav: NavState, bindings: readonly Binding[]): Binding[] {
  return activeBindings(contextsFor(nav), bindings).filter((b) => {
    if (b.action === 'office.advance') return nav.location.screenId === 'office.today';
    if (nav.mode === 'gameday' && b.context === 'global') return b.action === 'hub.game' || CONSOLE_GLOBALS.has(b.action) || nav.location.screenId !== 'game.console';
    return b.keys.length > 0;
  });
}

function KeysOverlay({ nav, bindings, screens }: { nav: NavState; bindings: readonly Binding[]; screens: readonly ScreenRecord[] }) {
  const s = screenById(nav.location.screenId, screens)!;
  const rows = keysOnScreen(nav, bindings);
  const letters = screensInHub(s.hub, screens).filter((x) => x.hotkey && !hasParams(x));
  return (
    <div className="gm-overlay">
      <div className="gm-dialog" role="dialog" aria-modal="true" aria-label={t('keys.title')}>
        <h2>{t('keys.title')}</h2>
        <table>
          <thead><tr><th>{t('keys.keys')}</th><th>{t('keys.action')}</th><th>{t('keys.context')}</th></tr></thead>
          <tbody>
            {rows.map((b) => <tr key={`${b.context}|${b.action}`}><td>{b.keys.map(displayChord).join(', ')}</td><td>{actionLabel(b)}</td><td>{b.context}</td></tr>)}
            {nav.mode === 'normal' && letters.map((x) => <tr key={x.id}><td>{displayChord(`Key${x.hotkey!.toUpperCase()}`)}</td><td>{x.title}</td><td>{t(`hub.${s.hub}`)}</td></tr>)}
          </tbody>
        </table>
        <p className="gm-line">{t('keys.hubThenLetter')} {t('help.close')}</p>
      </div>
    </div>
  );
}

function HelpOverlay({ screen }: { screen: ScreenRecord }) {
  return (
    <div className="gm-overlay">
      <div className="gm-dialog" role="dialog" aria-modal="true" aria-label={t('help.title', { title: screen.title })}>
        <h2>{t('help.title', { title: screen.title })}</h2>
        <p>{t(`help.screen.${screen.id}`)}</p>
        <p className="gm-line">{t('help.leaves', { leaves: screen.bible.join(', ') })}</p>
        <p className="gm-line">{t('help.close')}</p>
      </div>
    </div>
  );
}

export function Shell(props: ShellProps) {
  const screens = props.screens ?? SCREENS;
  const routes = props.routes ?? {};
  const display = { ...DEFAULT_DISPLAY, ...props.display };
  const ctx = props.context ?? {};
  const [nav, dispatch] = useReducer((s: NavState, a: Parameters<typeof navReducer>[1]) => navReducer(s, a, screens),
    props.history?.current() ?? props.initialPath, (p?: string) => {
      const n = initialNav(p, screens);
      return ctx.gameDay ? navReducer(n, { type: 'startGame' }, screens) : n;
    });
  const { bindings } = useMemo(() => applyOverrides(props.keyOverrides), [props.keyOverrides]);
  const [recent, setRecent] = useState<string[]>([]);
  const [now, setNow] = useState(() => (props.now ?? Date.now)());

  // Game-day mode follows the game state (O1.4.2).
  useEffect(() => { dispatch({ type: ctx.gameDay ? 'startGame' : 'endGame' }); }, [ctx.gameDay]);
  useEffect(() => { props.onNavChange?.(nav); }, [nav, props.onNavChange]);

  // Sound: settings, then the place (menu music, game start and end), and the first-input unlock.
  const stage = props.soundStage ?? null;
  useEffect(() => { if (stage && props.audioSettings) stage.applySettings(settingsGetter(props.audioSettings)); }, [stage, props.audioSettings]);
  useEffect(() => { stage?.setPlace(placeFromNav(nav, screens, props.offseason ?? false)); }, [stage, nav.location.screenId, nav.mode, props.offseason, screens]);
  useEffect(() => (stage && typeof window !== 'undefined' ? unlockOnFirstInput(stage) : undefined), [stage]);

  // Address bar (browser build).
  const pushing = useRef(false);
  useEffect(() => {
    const h = props.history;
    if (!h) return;
    const path = href(nav.location);
    if (h.current() !== path) { pushing.current = true; h.push(path); pushing.current = false; }
  }, [nav.location, props.history]);
  useEffect(() => {
    const h = props.history;
    if (!h) return;
    return h.listen((path) => {
      if (pushing.current) return;
      const prev = nav.back[nav.back.length - 1];
      const next = nav.forward[0];
      if (prev && href(prev) === path) dispatch({ type: 'back' });
      else if (next && href(next) === path) dispatch({ type: 'forward' });
      else dispatch({ type: 'navigate', to: path });
    });
  }, [props.history, nav.back, nav.forward]);

  // The alert line clock (display only).
  useEffect(() => {
    if (!props.alerts?.length || typeof window === 'undefined') return;
    const id = window.setInterval(() => setNow((props.now ?? Date.now)()), 500);
    return () => window.clearInterval(id);
  }, [props.alerts, props.now]);

  const onKey = useCallback((e: KeyboardEvent) => {
    if (nav.overlay === 'palette') return; // the palette's own field handles its keys
    const chord = chordOf(e);
    if (!chord) return;
    if (isTextTarget(e.target)) return; // O1.3.1: global keys are inactive while a text field has focus
    if (nav.pendingHub && /^Key[A-Z]$/.test(e.code) && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      dispatch({ type: 'screenKey', letter: e.code.slice(3).toLowerCase() });
      return;
    }
    const action = actionFor(chord, contextsFor(nav), bindings);
    if (!action) { dispatch({ type: 'clearPending' }); return; }
    const consoleOwns = nav.mode === 'gameday' && nav.location.screenId === 'game.console';
    if (consoleOwns && !CONSOLE_GLOBALS.has(action) && action !== 'hub.game') return; // the console's own map (O2)
    if (action === 'office.advance') {
      if (nav.location.screenId === 'office.today' && props.onAdvance) { e.preventDefault(); props.onAdvance(); }
      return;
    }
    const a = navActionFor(action);
    if (!a) return;
    e.preventDefault();
    const h = props.history;
    const goesBack = a.type === 'back' || (a.type === 'escape' && !nav.overlay && !nav.pendingHub && !nav.panelScreen);
    if (h?.back && goesBack && nav.back.length) { h.back(); return; }
    if (h?.forward && a.type === 'forward' && nav.forward.length) { h.forward(); return; }
    dispatch(a);
  }, [nav, bindings, props.onAdvance, props.history]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onKey]);

  const screen = screenById(nav.location.screenId, screens)!;
  const avail = availability(screen, ctx.phaseId ?? null, nav.mode === 'gameday');
  const navigate = useCallback((to: string) => dispatch({ type: 'navigate', to }), []);
  const setView = useCallback((view: Record<string, string>) => dispatch({ type: 'setView', view }), []);
  const missing = routeParams(screen).filter((p) => !nav.location.params[p]);
  const line = alertLine(props.alerts ?? [], now, props.alertLevels, nav.mode === 'gameday');
  const marked = officeMarked(props.alerts ?? [], props.alertLevels);
  const perm = props.permissions?.[screen.id];
  const panelScreen = nav.panelScreen ? screenById(nav.panelScreen, screens) : undefined;
  const items = useMemo(() => [...screenItems(screens), ...(props.paletteItems ?? [])], [screens, props.paletteItems]);
  const render = (s: ScreenRecord, loc: Location, readOnly: boolean) =>
    routes[s.id] ? routes[s.id]!.render({ screen: s, location: loc, readOnly, navigate, setView }) : <Placeholder screen={s} />;

  const crumbEntity = Object.values(nav.location.params)[0];
  return (
    <div className="gm-shell" style={rootStyle(display)} data-theme={resolveTheme(display.theme)} data-reduced-motion={display.reducedMotion} data-mode={nav.mode} data-screen={screen.id}>
      <style>{css}</style>
      <header className="gm-top" aria-label={t('shell.topBar')}>
        {ctx.teamName && <span className="gm-team">{ctx.teamName}</span>}
        {ctx.record && <span>{t('shell.record', { record: ctx.record })}</span>}
        {ctx.phaseLabel && <span className="gm-badge">{ctx.phaseLabel}</span>}
        {ctx.dateLabel && <span>{ctx.dateLabel}</span>}
        {ctx.hoursLeft !== undefined && <span>{t('shell.hoursLeft', { hours: ctx.hoursLeft })}</span>}
        <span className="gm-alert" role="status" aria-live="polite" aria-label={t('shell.alerts')} data-level={line.level ?? undefined}>
          {line.burstCount ? t('shell.alertBurst', { count: line.burstCount }) : line.text ?? ''}
        </span>
      </header>

      <nav className="gm-hubs" aria-label={t('shell.hubBar')}>
        {HUBS.map((h) => {
          const locked = nav.mode === 'gameday' && h.id !== 'game';
          const current = screen.hub === h.id;
          return (
            <Fragment key={h.id}>
              <button className="gm-hub" aria-current={current} aria-disabled={locked} aria-keyshortcuts={h.key} data-hub={h.id}
                onClick={() => !locked && dispatch({ type: 'hub', hub: h.id as HubId })}>
                <span className="gm-key">{h.key}</span>{t(`hub.${h.id}`)}{h.id === 'office' && marked && <span className="gm-mark"> !</span>}
              </button>
              {current && (
                <ul className="gm-screens">
                  {screensInHub(h.id as HubId, screens).filter((s) => !hasParams(s)).map((s) => (
                    <li key={s.id}>
                      <button aria-current={s.id === screen.id ? 'page' : undefined} aria-keyshortcuts={s.hotkey ? `${h.key} ${s.hotkey.toUpperCase()}` : undefined}
                        onClick={() => navigate(s.route)} data-screen={s.id}>
                        <span className="gm-key">{s.hotkey?.toUpperCase()}</span>{s.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Fragment>
          );
        })}
      </nav>

      <div className="gm-crumbs" aria-label={t('shell.breadcrumbs')}>
        <a href={screensInHub(screen.hub, screens).find((s) => !hasParams(s))?.route} onClick={(e) => { e.preventDefault(); dispatch({ type: 'hub', hub: screen.hub }); }}>{t(`hub.${screen.hub}`)}</a>
        {' › '}{screen.title}{crumbEntity ? ` › ${crumbEntity}` : ''}
      </div>

      <main className="gm-main" aria-label={screen.title}>
        <h1>{screen.title}{perm && <span className="gm-perm">{t(`shell.permission.${perm}`)}</span>}</h1>
        {avail.lineId && <p className="gm-line">{t(avail.lineId, { reason: '' }).trim()}</p>}
        {missing.length ? <p className="gm-line">{t('shell.missingParam', { param: missing.join(', ') })}</p> : render(screen, nav.location, avail.readOnly)}
      </main>

      {(props.sidePanel || panelScreen) && (
        <aside className="gm-side" aria-label={t('shell.sidePanel')}>
          {panelScreen ? render(panelScreen, { path: panelScreen.route, screenId: panelScreen.id, params: {}, view: {} }, false) : props.sidePanel}
        </aside>
      )}

      {stage && <div className="gm-captions"><SoundStageCaptions stage={stage} /></div>}

      <footer className="gm-status" aria-label={t('shell.status')}>
        {ctx.saveState && <span>{t('shell.saveState', { state: ctx.saveState })}</span>}
        {ctx.simActivity && <span>{t('shell.simActivity', { activity: ctx.simActivity })}</span>}
        {nav.notice && <span className="gm-notice" role="status">{t(nav.notice.id, nav.notice.slots)}</span>}
      </footer>

      {nav.overlay === 'palette' && (
        <Palette items={items} recent={recent} onClose={() => dispatch({ type: 'overlay', overlay: null })}
          onPick={(i) => { setRecent((r) => [i.id, ...r.filter((x) => x !== i.id)].slice(0, 20)); dispatch({ type: 'navigate', to: i.to }); }} />
      )}
      {nav.overlay === 'keys' && <KeysOverlay nav={nav} bindings={bindings} screens={screens} />}
      {nav.overlay === 'help' && <HelpOverlay screen={screen} />}
    </div>
  );
}

/** The browser build's address bar (O1.1.3). The browser's back button maps to the same stack. */
export function browserHistoryAdapter(): RouteHistoryAdapter {
  return {
    current: () => window.location.pathname + window.location.search,
    push: (path) => window.history.pushState(null, '', path),
    back: () => window.history.back(),
    forward: () => window.history.forward(),
    listen: (fn) => {
      const h = () => fn(window.location.pathname + window.location.search);
      window.addEventListener('popstate', h);
      return () => window.removeEventListener('popstate', h);
    },
  };
}
