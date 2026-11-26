// The in-game playbook desk's host side for the career root: search and drawing go through app-services
// (commands/game-calling in-game.ts) on the open session, so the screen holds no football logic.
import { gameCallingCommands as gc } from '@gm/app-services';
import type { DeskCall, DeskDraw } from '../screens/game-calling/InGameDesk.tsx';
import type { GameSession } from './port.ts';

const unitOf = (session: GameSession): gc.Unit => session.driver.state.open?.unit ?? 'offense';

export function deskSearch(session: GameSession, text: string): DeskCall[] {
  return gc.searchCalls(session.driver.state, unitOf(session), text).map(({ entry, boxId }) => ({
    id: entry.id, label: entry.label, readiness: entry.readiness, onSheet: boxId !== null, offense: entry.call.unit === 'offense',
    tags: entry.tags.map((t) => ({ id: t.id, kind: t.kind, label: t.label, group: t.group, installed: t.installed })),
  }));
}

/** Puts the call on the sheet's in-game box (drawn when asked); returns a refusal or null. */
export function deskAdd(session: GameSession, callId: string, draw: DeskDraw | null): string | null {
  const unit = unitOf(session);
  const hit = gc.reachableCalls(session.driver.state, unit).find((x) => x.entry.id === callId);
  if (!hit) return 'that call is no longer on the sheet or in the plan';
  const n = (session.driver.state.cfg.sheets[unit]?.boxes.find((b) => b.id === gc.IN_GAME_BOX)?.entries.length ?? 0) + 1;
  const id = `${gc.IN_GAME_BOX}/${n}`;
  const r = gc.drawCall(hit.entry, draw ? { id, tagIds: draw.tagIds, strength: draw.strength, runDirection: draw.runDirection, label: draw.label } : { id });
  if (!r.ok) return r.refusal;
  return session.addCall(unit, r.entry) ? null : 'the call could not be put on the sheet';
}

/** True when the console asked for the playbook search since `seen` commands. */
export function searchAsked(session: GameSession, seen: number): boolean {
  return session.driver.commands.slice(seen).some((c) => c.type === 'playbook.search');
}
