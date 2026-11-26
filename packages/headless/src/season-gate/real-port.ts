// Port module of the real game for season runs (see seasons.ts `PortRef`).
import { realGamePort } from './game-port.ts';
import type { CreatePlayGame, Json } from './seasons.ts';

export interface RealPortRefOptions { readonly paramOverrides?: Readonly<Record<string, number>> }

export function realPortRef(options: RealPortRefOptions = {}): { module: string; options: Json } {
  return { module: new URL('./real-port.ts', import.meta.url).href, options: options as Json };
}

export const createPlayGame: CreatePlayGame = (ruleSetId, raw) => {
  const o = (raw ?? {}) as RealPortRefOptions;
  return realGamePort({ ruleSetId, ...(o.paramOverrides ? { paramOverrides: o.paramOverrides } : {}) }).playGame;
};
