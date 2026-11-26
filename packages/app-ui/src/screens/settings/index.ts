// Settings screen package entry (G-98: O5.2 key map, O5.3 settings screen, O5.4 playback, O5.5
// accessibility). The integrator adds `settingsRoute(...)` to the shell's route table under the
// registry screen `school.settings` and re-exports this folder from @gm/app-ui.
import { createElement } from 'react';
import type { RouteEntry, ScreenProps } from '../../shell/index.ts';
import type { settings } from '@gm/app-services';
import { SettingsScreen, parseSettingsTab, type SettingsScreenProps } from './SettingsScreen.tsx';

export * from './model.ts';
export * from './keys.ts';
export * from './playback.ts';
export * from './access.ts';
export { SettingsScreen, AllSettings, SETTINGS_TABS, parseSettingsTab, useKeysPageState, type SettingsScreenProps, type SettingsTab } from './SettingsScreen.tsx';

/** Registry screen this package fills (screens.json `school.settings`). */
export const SETTINGS_SCREEN_ID = 'school.settings';

export interface SettingsHost {
  /** Current values of every scope (SettingsStore.all()). */
  values(): Record<string, settings.SettingValue>;
  certified(): boolean;
  set(key: string, value: settings.SettingValue): void;
  reset(key: string): void;
  exportProfile?(): void;
  importProfile?(): void;
}

/**
 * Route entry. The tab and the keys page's search text live in the view state (O1.1.3), so the
 * back button and favourites return to the same page.
 */
export function settingsRoute(host: SettingsHost, extra: Partial<SettingsScreenProps> = {}): RouteEntry {
  return {
    render: (p: ScreenProps) => createElement(SettingsScreen, {
      tab: parseSettingsTab(p.location.view.tab),
      values: host.values(),
      context: { certified: host.certified(), afterCreation: true },
      onTab: (tab) => p.setView({ ...p.location.view, tab }),
      onChange: (k, v) => host.set(k, v),
      onReset: (k) => host.reset(k),
      keyQuery: p.location.view.q ?? '',
      onKeyQuery: (q) => p.setView({ ...p.location.view, q }),
      onExportProfile: host.exportProfile,
      onImportProfile: host.importProfile,
      ...extra,
    }),
  };
}
