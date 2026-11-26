// Settings host (G-98, bible O5.3; screens.json `school.settings`). The settings screen asks its host for
// every current value and sends changes back; this host binds it to the running app's `SettingsStore`.
// The store does the checks (type, range, certified lock, fixed at creation); the host adds what O5.3.1
// asks of the app around it: a save-scope change goes to the save header, and a change made mid-season is
// written to the decision log (acceptance 2). The store's `set` is async (a user-scope change writes the
// settings file); the host keeps the last result so the screen can show a refusal.
import type { SetResult, SettingChange, SettingValue, SettingsStore } from '../../settings/index.ts';

export interface SettingsHostPorts {
  readonly store: SettingsStore;
  /** The open career is certified (N4). */
  certified(): boolean;
  /** A career exists: settings fixed at creation refuse changes. False on the new-career screens. */
  afterCreation(): boolean;
  /** True between the first and last game of a season: save-scope changes are logged (O5.3.1). */
  midSeason(): boolean;
  /** Writes the save's settings block (store.saveBlock()) to the save header. */
  writeSaveBlock?(block: Record<string, SettingValue>): void;
  /** Adds a decision-log row for a save-scope change made mid-season. */
  logChange?(change: SettingChange): void;
  exportProfile?(): void;
  importProfile?(): void;
}

/** The app-ui `SettingsHost` shape, plus the last result. */
export interface SettingsHostBinding {
  values(): Record<string, SettingValue>;
  certified(): boolean;
  set(key: string, value: SettingValue): void;
  reset(key: string): void;
  exportProfile?(): void;
  importProfile?(): void;
  /** Resolves when every change sent so far has been applied. */
  settled(): Promise<void>;
  /** The result of the last change, or null before any. */
  last(): SetResult | null;
}

export function settingsHost(ports: SettingsHostPorts): SettingsHostBinding {
  let pending: Promise<void> = Promise.resolve();
  let last: SetResult | null = null;
  const after = (r: SetResult) => {
    last = r;
    if (!r.ok || !r.change || r.change.scope !== 'save') return;
    ports.writeSaveBlock?.(ports.store.saveBlock());
    if (ports.midSeason()) ports.logChange?.(r.change);
  };
  const ctx = () => ({ certified: ports.certified(), afterCreation: ports.afterCreation() });
  const queue = (run: () => Promise<SetResult>) => { pending = pending.then(run).then(after); };
  const binding: SettingsHostBinding = {
    values: () => ports.store.all(),
    certified: () => ports.certified(),
    set: (key, value) => queue(() => ports.store.set(key, value, ctx())),
    reset: (key) => queue(() => ports.store.reset(key, ctx())),
    settled: () => pending,
    last: () => last,
  };
  if (ports.exportProfile) binding.exportProfile = ports.exportProfile;
  if (ports.importProfile) binding.importProfile = ports.importProfile;
  return binding;
}
