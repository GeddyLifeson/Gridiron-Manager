// Every target the break test can drive, by id. Phase 2 adds the season session and the app root once they land.
import type { BreakTarget } from '../types.ts';
import { CapTarget } from './cap.ts';
import { GameDayTarget } from './game-day.ts';
import { ObserverTarget } from './observer.ts';
import { WorldLoopTarget } from './world-loop.ts';
import { WorldServiceTarget } from './world-service.ts';

export const TARGETS = ['world-service', 'cap', 'observer', 'game-pro', 'game-college', 'world-loop'] as const;
export type TargetId = (typeof TARGETS)[number];

export function makeTarget(id: TargetId, saveDir: string): BreakTarget {
  switch (id) {
    case 'world-service': return new WorldServiceTarget(saveDir);
    case 'cap': return new CapTarget();
    case 'observer': return new ObserverTarget();
    case 'game-pro': return new GameDayTarget('pro_2026');
    case 'game-college': return new GameDayTarget('college_2026');
    case 'world-loop': return new WorldLoopTarget();
  }
}
