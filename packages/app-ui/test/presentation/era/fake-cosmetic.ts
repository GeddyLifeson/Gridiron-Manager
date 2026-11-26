// Test stand-in for app-services' cosmetic stream (PV-01). app-ui may import only app-services' public entry,
// which does not export the cosmetic factory yet (barrel line requested from the integrator). Same shape:
// a seeded, scope-keyed uniform() in [0, 1). Deterministic: same seed and scope give the same sequence.
export interface Scope { gameId: number; playNumber: number }
export function cosmeticStream(seedHex: string, channel: 'display' | 'audio', scope: Scope): { uniform(): number; readonly draws: number } {
  let s = (parseInt(seedHex, 16) ^ (scope.gameId * 0x9e3779b1) ^ (scope.playNumber * 0x85ebca6b) ^ (channel === 'display' ? 0x27d4eb2f : 0x165667b1)) >>> 0;
  let draws = 0;
  return {
    get draws() { return draws; },
    uniform() {
      // mulberry32
      draws++;
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}
