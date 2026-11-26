// Settings screen (G-98: O5.3.1 screen, O5.2 keys page, O5.4.1 playback, O5.5 accessibility).
// Draws the page model only. Every control has an accessible name (O5.5.2); every setting has a
// one-line explanation and a reset (O5.3.1). Changes go out through callbacks to the O5.3 store.
import { useState, type ReactNode } from 'react';
import type { KeyOverrides } from '../../shell/keymap.ts';
import { settings } from '@gm/app-services';
import { GROUP_ORDER, parseInput, settingsPage, sx, type PageContext, type SettingGroupView, type SettingRow } from './model.ts';
import { captureKey, keyRows, resetKey, searchKeys, BUILTIN_PROFILES, type KeyRow } from './keys.ts';

export type SettingsTab = settings.SettingGroup | 'keys';
export const SETTINGS_TABS: readonly SettingsTab[] = [...GROUP_ORDER, 'keys'];

export function parseSettingsTab(v: unknown): SettingsTab {
  return typeof v === 'string' && (SETTINGS_TABS as readonly string[]).includes(v) ? (v as SettingsTab) : 'display';
}

export interface SettingsScreenProps {
  tab: SettingsTab;
  values: Record<string, settings.SettingValue>;
  context?: PageContext;
  onTab?: (tab: SettingsTab) => void;
  onChange?: (key: string, value: settings.SettingValue) => void;
  onReset?: (key: string) => void;
  /** Keys page: the query, and the action waiting for a key press (from view state). */
  keyQuery?: string;
  capturing?: { context: string; action: string } | null;
  onKeyQuery?: (q: string) => void;
  onCapture?: (target: { context: string; action: string } | null) => void;
  onExportProfile?: () => void;
  onImportProfile?: () => void;
  /** Last message for the keys page (a refused key, skipped import rows). */
  keyNotice?: string;
}

const cid = (key: string) => `gm-set-${key.replace(/[^a-zA-Z0-9]/g, '-')}`;

function Control({ row, onChange }: { row: SettingRow; onChange?: SettingsScreenProps['onChange'] }): ReactNode {
  const def = settings.SETTINGS_BY_KEY.get(row.key)!;
  const disabled = row.lock !== null;
  const send = (raw: string | boolean) => { const v = parseInput(def, raw); if (v !== undefined) onChange?.(row.key, v); };
  switch (row.type) {
    case 'boolean':
      return <input id={cid(row.key)} type="checkbox" checked={row.value as boolean} disabled={disabled} onChange={(e) => send(e.target.checked)} />;
    case 'enum':
      return (
        <select id={cid(row.key)} value={row.value as string} disabled={disabled} onChange={(e) => send(e.target.value)}>
          {row.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    case 'number':
      return (
        <input id={cid(row.key)} type="range" min={row.range!.min} max={row.range!.max} step={row.range!.step} value={row.value as number}
          disabled={disabled} aria-valuetext={`${row.value} ${row.range!.unit}`} onChange={(e) => send(e.target.value)} />
      );
    case 'string':
      return <input id={cid(row.key)} type="text" value={row.value as string} disabled={disabled} onChange={(e) => send(e.target.value)} />;
    default:
      return <output id={cid(row.key)}>{row.summary}</output>;
  }
}

function Row({ row, onChange, onReset }: { row: SettingRow; onChange?: SettingsScreenProps['onChange']; onReset?: SettingsScreenProps['onReset'] }) {
  return (
    <div className="gm-settings-row" data-key={row.key} data-default={row.isDefault ? 'yes' : 'no'}>
      <label htmlFor={cid(row.key)}>{row.label}</label>
      <Control row={row} onChange={onChange} />
      {row.type === 'number' && <span className="gm-settings-value">{`${row.value}%`}</span>}
      <button type="button" aria-label={sx('screen.reset_label', { label: row.label })} disabled={row.isDefault || row.lock !== null} onClick={() => onReset?.(row.key)}>
        {sx('screen.reset')}
      </button>
      <p className="gm-settings-help">{row.help}</p>
      {row.lock === 'certified' && <p className="gm-settings-lock">{sx('screen.locked_certified')}</p>}
      {row.lock === 'creation' && <p className="gm-settings-lock">{sx('screen.fixed_creation')}</p>}
      {row.scope === 'save' && <p className="gm-settings-scope">{sx('screen.save_scope')}</p>}
      {row.scope === 'session' && <p className="gm-settings-scope">{sx('screen.session_scope')}</p>}
    </div>
  );
}

function Group({ g, onChange, onReset }: { g: SettingGroupView; onChange?: SettingsScreenProps['onChange']; onReset?: SettingsScreenProps['onReset'] }) {
  return (
    <section className="gm-settings-group" data-group={g.id} aria-label={g.title}>
      <h2>{g.title}</h2>
      {g.id === 'playback' && <p className="gm-settings-note">{sx('screen.clock_rule')}</p>}
      {g.id === 'gameplay' && <p className="gm-settings-note">{sx('screen.no_difficulty')}</p>}
      {g.id === 'privacy' && <p className="gm-settings-note">{sx('screen.no_network')}</p>}
      {g.rows.map((r) => <Row key={r.key} row={r} onChange={onChange} onReset={onReset} />)}
    </section>
  );
}

function KeyLine({ r, capturing, onCapture, onReset }: { r: KeyRow; capturing: boolean; onCapture?: SettingsScreenProps['onCapture']; onReset?: (r: KeyRow) => void }) {
  return (
    <tr data-context={r.context} data-action={r.action} data-default={r.isDefault ? 'yes' : 'no'}>
      <td>{r.contextLabel}</td>
      <td>{r.actionLabel}</td>
      <td>{r.display.length ? r.display.join(', ') : sx('keys.no_default')}</td>
      <td>
        <button type="button" aria-label={sx('keys.change', { action: r.actionLabel })} aria-pressed={capturing}
          onClick={() => onCapture?.(capturing ? null : { context: r.context, action: r.action })}>
          {capturing ? sx('keys.press', { action: r.actionLabel }) : sx('keys.key')}
        </button>
        <button type="button" aria-label={sx('keys.reset', { action: r.actionLabel })} disabled={r.isDefault} onClick={() => onReset?.(r)}>{sx('screen.reset')}</button>
      </td>
    </tr>
  );
}

function KeysPage(p: SettingsScreenProps) {
  const overrides = (p.values['controls.keyOverrides'] ?? {}) as KeyOverrides;
  const profile = String(p.values['controls.keyProfile'] ?? 'default');
  const q = p.keyQuery ?? '';
  const rows = searchKeys(keyRows(overrides), q);
  const onKeyDown = (e: { code: string; key?: string; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean; metaKey?: boolean; preventDefault?: () => void }) => {
    if (!p.capturing) return;
    e.preventDefault?.();
    const r = captureKey(overrides, p.capturing.context, p.capturing.action, e);
    if (r.kind === 'bound') { p.onChange?.('controls.keyOverrides', r.overrides); p.onCapture?.(null); }
    else if (r.kind === 'cancelled') p.onCapture?.(null);
  };
  return (
    <section className="gm-settings-keys" aria-label={sx('keys.title')} onKeyDown={onKeyDown}>
      <h2>{sx('keys.title')}</h2>
      <label htmlFor="gm-keys-profile">{sx('keys.profile')}</label>
      <select id="gm-keys-profile" value={profile} onChange={(e) => {
        const id = e.target.value;
        p.onChange?.('controls.keyProfile', id);
        if (id in BUILTIN_PROFILES) p.onChange?.('controls.keyOverrides', structuredClone(BUILTIN_PROFILES[id]!) as Record<string, unknown>);
      }}>
        {[...new Set([...Object.keys(BUILTIN_PROFILES), profile])].map((id) => <option key={id} value={id}>{id in BUILTIN_PROFILES ? sx(`keys.profile.${id}`) : id}</option>)}
      </select>
      <button type="button" onClick={() => p.onExportProfile?.()}>{sx('keys.export')}</button>
      <button type="button" onClick={() => p.onImportProfile?.()}>{sx('keys.import')}</button>
      <label htmlFor="gm-keys-search">{sx('keys.search')}</label>
      <input id="gm-keys-search" type="search" value={q} onChange={(e) => p.onKeyQuery?.(e.target.value)} />
      {p.keyNotice && <p role="status" className="gm-settings-notice">{p.keyNotice}</p>}
      {rows.length === 0 ? <p>{sx('keys.none_found', { q })}</p> : (
        <table>
          <thead><tr><th scope="col">{sx('keys.context')}</th><th scope="col">{sx('keys.action')}</th><th scope="col">{sx('keys.key')}</th><th scope="col"><span className="gm-visually-hidden">{sx('screen.reset')}</span></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <KeyLine key={`${r.context}|${r.action}`} r={r}
                capturing={!!p.capturing && p.capturing.context === r.context && p.capturing.action === r.action}
                onCapture={p.onCapture}
                onReset={(x) => p.onChange?.('controls.keyOverrides', resetKey(overrides, x.context, x.action))} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function SettingsScreen(p: SettingsScreenProps) {
  const groups = settingsPage(p.values, p.context);
  const shown = p.tab === 'keys' ? null : groups.find((g) => g.id === p.tab) ?? groups[0]!;
  return (
    <div className="gm-settings" data-screen="school.settings">
      <h1>{sx('screen.title')}</h1>
      <div role="tablist" aria-label={sx('screen.tabs_label')}>
        {SETTINGS_TABS.filter((t) => t === 'keys' || groups.some((g) => g.id === t)).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={t === (shown?.id ?? 'keys')} onClick={() => p.onTab?.(t)}>
            {t === 'keys' ? sx('keys.title') : sx(`group.${t}`)}
          </button>
        ))}
      </div>
      {shown ? <Group g={shown} onChange={p.onChange} onReset={p.onReset} /> : <KeysPage {...p} />}
    </div>
  );
}

/** Every group on one page (used by tests and the "show all" view): each setting once. */
export function AllSettings(p: Pick<SettingsScreenProps, 'values' | 'context' | 'onChange' | 'onReset'>) {
  return <div className="gm-settings-all">{settingsPage(p.values, p.context).map((g) => <Group key={g.id} g={g} onChange={p.onChange} onReset={p.onReset} />)}</div>;
}

/** Local state wrapper for hosts that do not keep the keys page's view state themselves. */
export function useKeysPageState() {
  const [keyQuery, onKeyQuery] = useState('');
  const [capturing, onCapture] = useState<{ context: string; action: string } | null>(null);
  return { keyQuery, onKeyQuery, capturing, onCapture };
}
