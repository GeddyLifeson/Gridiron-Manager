// The settings schema (O5.3.1). Each setting has a type, a default, a range, a scope and a
// `lockedInCertified` flag. There is no difficulty setting and no pacing mode (one difficulty, real
// life; the play clock always runs: Marlon 2026-11-25). Nothing here changes a simulated result:
// display, audio, controls, accessibility and playback settings change only what is shown and how
// input is read (O5.3.2, O5.4.1, O5.5.2).

export type SettingScope = 'user' | 'save' | 'session';
export const SETTING_GROUPS = ['display', 'audio', 'controls', 'gameplay', 'accessibility', 'playback', 'navigation', 'privacy', 'mods'] as const;
export type SettingGroup = (typeof SETTING_GROUPS)[number];

/** O5.3.2: interface scale range, percent. */
export const INTERFACE_SCALE_PCT = { min: 80, max: 200 } as const;
/** O1.1.3: the favourites strip holds up to 12 pins. */
export const FAVOURITES_MAX = 12;
/** Assumption: scale and volume settings move in steps of this many percent (no bible value). */
export const PERCENT_STEP = 10;
/** Volume range in percent (0 is silent). Not a real-world number: a slider's ends. */
export const VOLUME_PCT = { min: 0, max: 100 } as const;

interface Base<T> {
  key: string;
  group: SettingGroup;
  scope: SettingScope;
  default: T;
  /** Text template id of the one-line explanation (O6.6.1: strings live in template files). */
  help: string;
  /** Bible leaves that own the setting. */
  bible: string[];
  lockedInCertified: boolean;
  /** Save-scope settings fixed when the career is created (O1.5.2). */
  fixedAtCreation?: boolean;
}
export interface EnumSetting extends Base<string> { type: 'enum'; options: readonly string[] }
export interface NumberSetting extends Base<number> { type: 'number'; min: number; max: number; step: number; unit: string }
export interface BooleanSetting extends Base<boolean> { type: 'boolean' }
export interface StringSetting extends Base<string> { type: 'string'; maxLength: number }
export interface ListSetting extends Base<string[]> { type: 'list'; maxItems: number; itemMaxLength: number }
export interface RecordSetting extends Base<Record<string, unknown>> { type: 'record'; valueOptions?: readonly string[] }
export type SettingDef = EnumSetting | NumberSetting | BooleanSetting | StringSetting | ListSetting | RecordSetting;
export type SettingValue = SettingDef['default'];

const pct = (key: string, group: SettingGroup, def: number, help: string, bible: string[], min: number = INTERFACE_SCALE_PCT.min, max: number = INTERFACE_SCALE_PCT.max): NumberSetting =>
  ({ key, group, scope: 'user', type: 'number', default: def, min, max, step: PERCENT_STEP, unit: 'percent', help, bible, lockedInCertified: false });
const vol = (name: string, def: number): NumberSetting =>
  ({ ...pct(`audio.${name}Volume`, 'audio', def, `settings.audio.${name}Volume`, ['O5.3.2'], VOLUME_PCT.min, VOLUME_PCT.max) });
const on = (key: string, group: SettingGroup, def: boolean, bible: string[]): BooleanSetting =>
  ({ key, group, scope: 'user', type: 'boolean', default: def, help: `settings.${key}`, bible, lockedInCertified: false });
const pick = (key: string, group: SettingGroup, options: readonly string[], def: string, bible: string[], extra: Partial<EnumSetting> = {}): EnumSetting =>
  ({ key, group, scope: 'user', type: 'enum', options, default: def, help: `settings.${key}`, bible, lockedInCertified: false, ...extra });

export const ALERT_LEVELS = ['urgent', 'normal', 'quiet'] as const;

export const SETTINGS: readonly SettingDef[] = [
  // Display (O5.3.2, O2.3.1, O6.2.1)
  pick('display.theme', 'display', ['system', 'light', 'dark', 'high-contrast'], 'system', ['O5.3.2', 'O6.2.1']),
  pick('display.windowMode', 'display', ['windowed', 'fullscreen'], 'windowed', ['O5.3.2']),
  pct('display.interfaceScale', 'display', 100, 'settings.display.interfaceScale', ['O5.3.2']),
  pick('display.fieldOrientation', 'display', ['offense-up', 'my-team-up', 'broadcast'], 'offense-up', ['O2.3.1', 'O5.3.2']),
  pick('display.markerSize', 'display', ['standard', 'large', 'larger'], 'standard', ['O5.3.2']),
  pick('display.frameCap', 'display', ['display-rate', 'half-rate'], 'display-rate', ['O5.3.2']),
  pick('display.performanceTier', 'display', ['low', 'standard', 'high'], 'standard', ['O5.3.2']),
  // Audio (O5.3.2, presentation plan 4.1 and 7, amendment A-3, PV-14): one volume and one off switch
  // per mixer bus. `whistleCrowd` split into crowd and officials; `alerts` became the ui bus (old
  // stored values carry over: LEGACY_AUDIO_KEYS). Ambience is off by default (plan 4.2, rank 6). The
  // play clock tick stays its own optional cue on the ui bus.
  vol('master', 100), on('audio.masterOn', 'audio', true, ['O5.3.2']),
  vol('crowd', 100), on('audio.crowdOn', 'audio', true, ['O5.3.2']),
  vol('officials', 100), on('audio.officialsOn', 'audio', true, ['O5.3.2']),
  vol('contact', 100), on('audio.contactOn', 'audio', true, ['O5.3.2']),
  vol('cadence', 100), on('audio.cadenceOn', 'audio', true, ['O5.3.2']),
  vol('ui', 100), on('audio.uiOn', 'audio', true, ['O5.3.2']),
  vol('ambience', 100), on('audio.ambienceOn', 'audio', false, ['O5.3.2']),
  vol('playClockTick', 100), on('audio.playClockTickOn', 'audio', false, ['O5.3.2']),
  // Menu music (PV-11, MB-11): the music bus switch, off until Marlon decides (presentation plan
  // section 9). Never plays during a game or in the film room.
  vol('music', 100), on('audio.menuMusicOn', 'audio', false, ['O5.3.2']),
  // Mono (plan 7, A-3): pan collapsed to the centre for single-sided hearing.
  on('audio.mono', 'audio', false, ['O5.3.2', 'O5.5.2']),
  // Controls (O5.2.1, O5.2.2): overrides are stored as differences from the default key map.
  { key: 'controls.keyProfile', group: 'controls', scope: 'user', type: 'string', default: 'default', maxLength: 64, help: 'settings.controls.keyProfile', bible: ['O5.2.2'], lockedInCertified: false },
  { key: 'controls.keyOverrides', group: 'controls', scope: 'user', type: 'record', default: {}, help: 'settings.controls.keyOverrides', bible: ['O5.2.2'], lockedInCertified: false },
  // Accessibility (O5.5.1, O5.5.2). None pauses or slows game time.
  pick('accessibility.colourVision', 'accessibility', ['none', 'protan', 'deutan', 'tritan'], 'none', ['O5.5.1', 'O6.2.1']),
  pct('accessibility.textScale', 'accessibility', 100, 'settings.accessibility.textScale', ['O5.5.1']),
  on('accessibility.boldMarkers', 'accessibility', false, ['O5.5.1']),
  on('accessibility.thickFieldLines', 'accessibility', false, ['O5.5.1']),
  pick('accessibility.focusHighlight', 'accessibility', ['standard', 'large', 'larger'], 'standard', ['O5.5.1']),
  on('accessibility.reducedMotion', 'accessibility', false, ['O5.5.2']),
  // Captions strip (plan 7, A-3, PV-14): names each game sound as it plays. `auto` shows it while the
  // master bus is off or silent.
  pick('accessibility.captions', 'accessibility', ['auto', 'on', 'off'], 'auto', ['O5.5.2']),
  pick('accessibility.holdToConfirm', 'accessibility', ['off', 'standard', 'long'], 'off', ['O5.5.2']),
  pick('accessibility.chordTimeout', 'accessibility', ['standard', 'long', 'longer'], 'standard', ['O5.5.2']),
  on('accessibility.stickyModifiers', 'accessibility', false, ['O5.5.2']),
  on('accessibility.switchScanning', 'accessibility', false, ['O5.5.2']),
  // Playback (O5.4.1): what is shown while no decision is the user's. Never the play clock.
  pick('playback.watch', 'playback', ['every-play', 'own-plays', 'key-plays', 'results-only'], 'every-play', ['O5.4.1']),
  pick('playback.speed', 'playback', ['normal', 'fast', 'faster'], 'normal', ['O5.4.1']),
  pick('playback.stoppageCompression', 'playback', ['real', 'short', 'instant'], 'real', ['O5.4.1', 'N4'], { lockedInCertified: true }),
  // Navigation and layout (O1.1.3, O1.4.3, O1.5.1)
  { key: 'navigation.favourites', group: 'navigation', scope: 'user', type: 'list', default: [], maxItems: FAVOURITES_MAX, itemMaxLength: 512, help: 'settings.navigation.favourites', bible: ['O1.1.3'], lockedInCertified: false },
  { key: 'navigation.alertLevels', group: 'navigation', scope: 'user', type: 'record', default: {}, valueOptions: ALERT_LEVELS, help: 'settings.navigation.alertLevels', bible: ['O1.4.3'], lockedInCertified: false },
  { key: 'navigation.layout', group: 'navigation', scope: 'user', type: 'record', default: {}, help: 'settings.navigation.layout', bible: ['O1.5.1', 'O6.1.2'], lockedInCertified: false },
  // Privacy and data (O5.6.1)
  on('privacy.backupReminder', 'privacy', true, ['O5.6.1']),
  // Mods (P7): enabled user content packs. Locked in certified careers (O1.5.2).
  { key: 'mods.enabled', group: 'mods', scope: 'user', type: 'list', default: [], maxItems: 256, itemMaxLength: 128, help: 'settings.mods.enabled', bible: ['P7', 'O1.5.2'], lockedInCertified: true },
  // Save scope (O5.3.1): written to the save header and shown on the load screen.
  { key: 'gameplay.ruleSetId', group: 'gameplay', scope: 'save', type: 'string', default: '', maxLength: 64, help: 'settings.gameplay.ruleSetId', bible: ['O5.3.1', 'B12'], lockedInCertified: true, fixedAtCreation: true },
  { key: 'gameplay.contentPacks', group: 'gameplay', scope: 'save', type: 'list', default: [], maxItems: 256, itemMaxLength: 128, help: 'settings.gameplay.contentPacks', bible: ['O5.3.1', 'P4'], lockedInCertified: true },
  { key: 'gameplay.certified', group: 'gameplay', scope: 'save', type: 'boolean', default: false, help: 'settings.gameplay.certified', bible: ['O5.3.1', 'N4'], lockedInCertified: true, fixedAtCreation: true },
  // Session scope: temporary view states, never stored (O5.3.1).
  { key: 'session.viewStates', group: 'navigation', scope: 'session', type: 'record', default: {}, help: 'settings.session.viewStates', bible: ['O5.3.1', 'O1.3.3'], lockedInCertified: false },
];

/**
 * Audio keys renamed by the bus split (PV-14). A stored old key fills each new key the file does not
 * already hold, so a user's volume survives the update. The old keys stay in the file as unknown keys.
 */
export const LEGACY_AUDIO_KEYS: Readonly<Record<string, readonly string[]>> = {
  'audio.whistleCrowdVolume': ['audio.crowdVolume', 'audio.officialsVolume'],
  'audio.whistleCrowdOn': ['audio.crowdOn', 'audio.officialsOn'],
  'audio.alertsVolume': ['audio.uiVolume'],
  'audio.alertsOn': ['audio.uiOn'],
};

export const SETTINGS_BY_KEY: ReadonlyMap<string, SettingDef> = new Map(SETTINGS.map((d) => [d.key, d]));

/** Checks a value against its definition. Returns a reason, or null when valid. */
export function checkValue(def: SettingDef, value: unknown): string | null {
  switch (def.type) {
    case 'enum': return typeof value === 'string' && def.options.includes(value) ? null : `${def.key} must be one of ${def.options.join(', ')}`;
    case 'boolean': return typeof value === 'boolean' ? null : `${def.key} must be true or false`;
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return `${def.key} must be a number`;
      if (value < def.min || value > def.max) return `${def.key} must be from ${def.min} to ${def.max} ${def.unit}`;
      const k = (value - def.min) / def.step;
      return Math.abs(k - Math.round(k)) < 1e-9 ? null : `${def.key} moves in steps of ${def.step}`;
    }
    case 'string': return typeof value === 'string' && value.length <= def.maxLength ? null : `${def.key} must be text of at most ${def.maxLength} characters`;
    case 'list':
      if (!Array.isArray(value) || !value.every((x) => typeof x === 'string' && x.length <= def.itemMaxLength)) return `${def.key} must be a list of text`;
      if (value.length > def.maxItems) return `${def.key} holds at most ${def.maxItems} items`;
      return new Set(value).size === value.length ? null : `${def.key} has a repeated item`;
    case 'record': {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return `${def.key} must be an object`;
      const opts = def.valueOptions;
      if (opts && !Object.values(value).every((x) => typeof x === 'string' && opts.includes(x))) return `${def.key} values must be one of ${opts.join(', ')}`;
      return null;
    }
  }
}

export function defaultValues(scope?: SettingScope): Record<string, SettingValue> {
  const out: Record<string, SettingValue> = {};
  for (const d of SETTINGS) if (!scope || d.scope === scope) out[d.key] = structuredClone(d.default);
  return out;
}
