// Bus settings from the app settings store (O5.3.2, plan 4.1, amendment A-3). The schema holds the
// eight-bus keys (`audio.<bus>Volume`, `audio.<bus>On`) since PV-14; the music switch is
// `audio.menuMusicOn` (PV-11). The old keys (`whistleCrowd` for crowd and officials, `alerts` for ui)
// are still read as a fallback for a store that lacks the new ones. This file only reads.
import { BUSES, type BusId, type BusSetting } from './types.ts';

/** Defaults when no key exists. Ambience is off by default (plan 4.2, rank 6); music is off until Marlon decides (plan 9). */
export const BUS_DEFAULTS: Readonly<Record<BusId, BusSetting>> = {
  master: { volumePct: 100, on: true },
  crowd: { volumePct: 100, on: true },
  officials: { volumePct: 100, on: true },
  contact: { volumePct: 100, on: true },
  cadence: { volumePct: 100, on: true },
  ui: { volumePct: 100, on: true },
  ambience: { volumePct: 100, on: false },
  music: { volumePct: 100, on: false },
};

const LEGACY: Partial<Record<BusId, { volume?: string; on?: string }>> = {
  crowd: { volume: 'audio.whistleCrowdVolume', on: 'audio.whistleCrowdOn' },
  officials: { volume: 'audio.whistleCrowdVolume', on: 'audio.whistleCrowdOn' },
  ui: { volume: 'audio.alertsVolume', on: 'audio.alertsOn' },
  music: { on: 'audio.menuMusicOn' },
};

/** `get` returns the stored value for a settings key, or undefined if the key does not exist. */
export function busSettingsFrom(get: (key: string) => unknown): Record<BusId, BusSetting> {
  const out = {} as Record<BusId, BusSetting>;
  for (const b of BUSES) {
    const num = (k: string | undefined): number | undefined => { if (!k) return undefined; const v = get(k); return typeof v === 'number' ? v : undefined; };
    const bool = (k: string | undefined): boolean | undefined => { if (!k) return undefined; const v = get(k); return typeof v === 'boolean' ? v : undefined; };
    const legacy = LEGACY[b];
    out[b] = {
      volumePct: num(`audio.${b}Volume`) ?? num(legacy?.volume) ?? BUS_DEFAULTS[b].volumePct,
      on: bool(`audio.${b}On`) ?? bool(legacy?.on) ?? BUS_DEFAULTS[b].on,
    };
  }
  return out;
}

/** Mono (plan 7, A-3, PV-14): pan collapsed to the centre. Pass to `AudioEngine.setMono`. */
export function monoFrom(get: (key: string) => unknown): boolean {
  return get('audio.mono') === true;
}
