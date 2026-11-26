// Turns a film record from the read model into the field view's play (G-03 FilmPlay).
import type { FilmPlay } from '../../field-view/index.ts';
import type { FilmRecordWireLike } from './types.ts';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function fromBase64(s: string): Uint8Array {
  const clean = s.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0, acc = 0, j = 0;
  for (const ch of clean) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) throw new Error(`not base64: ${ch}`);
    acc = ((acc << 6) | v) & 0xffffff; bits += 6;
    if (bits >= 8) { bits -= 8; out[j++] = (acc >> bits) & 255; }
  }
  return out;
}

/** Film review is after the game, so the play is drawn as film (the user-visible tag is the film filter's promise). */
export function toFilmPlay(r: FilmRecordWireLike): FilmPlay {
  return {
    playId: r.playId,
    visibility: 'user-visible',
    ticksPerSecond: r.ticksPerSecond,
    trajectory: { formatVersion: r.trajectory.formatVersion, firstTick: r.trajectory.firstTick, tickCount: r.trajectory.tickCount, buffer: fromBase64(r.trajectory.base64) },
    slots: r.slots.map((s) => ({ slot: s.slot, side: s.side, jersey: s.jersey, role: s.role })),
    events: r.events.map((e) => ({ kind: e.kind, tick: e.tick, x: e.x, y: e.y, ...(e.slots ? { slots: [...e.slots] } : {}) })),
    situation: { ...r.situation },
  };
}
