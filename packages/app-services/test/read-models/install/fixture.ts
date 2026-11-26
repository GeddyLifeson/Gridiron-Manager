// A small offense install week for the board tests: four units (formation, protection, a play that needs
// both, and a check on the play), three practice days and four slated players. Estimates, names and
// difficulties are made-up test numbers, not football facts.
import type { InstallInput, InstallUnitInput, SlatedPlayer } from '../../../src/read-models/install/index.ts';

export const TEAM = 3;
export const UNITS: InstallUnitInput[] = [
  { id: 'f.trips', label: 'Trips', kind: 'part', items: { OL: ['trips.align'], WR: ['trips.align', 'trips.split'], QB: ['trips.align'] }, requires: [] },
  { id: 'p.slide', label: 'Slide protection', kind: 'part', items: { OL: ['slide.rules', 'slide.calls'], QB: ['slide.hot'] }, requires: [] },
  { id: 'play.stick', label: 'Trips Right Stick', kind: 'play', items: { OL: ['slide.rules'], WR: ['stick.routes', 'stick.adjust'], QB: ['stick.read'] }, requires: ['f.trips', 'p.slide'] },
  { id: 'chk.stick', label: 'Stick check to fade', kind: 'part', items: { WR: ['stick.fade'], QB: ['stick.check'] }, requires: ['play.stick'] },
];
export const PLAYERS: SlatedPlayer[] = [
  { id: 101, name: 'Starter Lineman', group: 'OL', position: 'LT' },
  { id: 102, name: 'Veteran Receiver', group: 'WR', position: 'X' },
  { id: 103, name: 'Rookie Receiver', group: 'WR', position: 'Z' },
  { id: 104, name: 'Starter Passer', group: 'QB', position: 'QB' },
];
/** Staff estimates by player and item; the rookie is behind and the lineman has never been judged. */
const EST: Record<number, Record<string, number>> = {
  102: { 'trips.align': 80, 'trips.split': 75, 'stick.routes': 70, 'stick.adjust': 65, 'stick.fade': 72 },
  103: { 'trips.align': 50, 'trips.split': 40, 'stick.routes': 30, 'stick.adjust': 20, 'stick.fade': 35 },
  104: { 'trips.align': 90, 'slide.hot': 85, 'stick.read': 80, 'stick.check': 70 },
};

export function input(over: Partial<InstallInput> = {}): Omit<InstallInput, 'teamId' | 'side' | 'mode'> {
  return {
    holder: { job: 'coordinator', side: 'offense' },
    days: [{ id: 'practice1', label: 'Practice 1' }, { id: 'practice2', label: 'Practice 2' }, { id: 'practice3', label: 'Practice 3' }],
    units: UNITS,
    placed: { 'f.trips': 'practice1', 'p.slide': 'practice1', 'play.stick': 'practice2', 'chk.stick': null },
    periods: (id) => (id === 'play.stick' ? [{ kind: 'meeting', label: 'Install meeting', minutes: 40, reps: null }, { kind: 'practice', label: 'Team period 2', minutes: null, reps: 6 }] : []),
    players: PLAYERS,
    estimate: (pl, items) => {
      const e = EST[pl];
      if (!e) return null;
      return Math.min(...items.map((i) => e[i] ?? 0));
    },
    difficulty: (item) => (item.startsWith('stick') ? 4 : 2),
    alwaysUp: ['f.trips'],
    ...over,
  };
}
