// @gm/app-services, settings host (G-98, bible O5.3; plan item 3d). Settings are the user's preferences,
// not world data, so there is no read-model schema: the screen reads the store's values directly.
export { settingsHost, type SettingsHostBinding, type SettingsHostPorts } from './host.ts';
export const SETTINGS_SCREEN = 'school.settings';
