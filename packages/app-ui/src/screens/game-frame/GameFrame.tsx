// The game-day frame screens (G-62): pregame (I1, O2), halftime (I8.2, O2.4.4) and postgame (I10). Each draws a
// read model handed in by the host (app-services read-models/game-frame) and sends commands back; no football
// logic here. The view shapes are declared structurally below because app-ui may import only the public entry
// of app-services, which gains these models when the integrator adds them.
import type { ReactNode } from 'react';
import TEXT from './text.json';
import type { RouteTable, ScreenProps } from '../../shell/index.ts';

const STRINGS: Record<string, string> = (TEXT as { strings: Record<string, string> }).strings;

/** Screen text by id with `{slot}` filled; an unknown id shows itself so a gap is visible (O6.6.1). */
export function gt(id: string, slots: Record<string, string | number> = {}): string {
  const s = STRINGS[id];
  if (s === undefined) return id;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in slots ? String(slots[k]) : m));
}

export interface PregameView {
  minutesToKickoff: number;
  budgetLeft: number;
  kickoffDelayMin: number;
  nextDeadline: number;
  tasks: { id: string; deadline: number; costMin: number; owner: string; state: string; locked: boolean; actionable: boolean }[];
  tossOptionLost: string[];
}

export interface HalftimeView {
  workingMin: number;
  staffMin: number;
  playerMin: number;
  staffLeft: number;
  playerLeft: number;
  attending: string;
  items: { kind: string; unit: string | null; detail: string | null }[];
  uptake: { adjustmentId: string; playerId: string; word: string }[];
}

export interface PostgameView {
  gameId: string;
  handshake: { own: string; other: string; mediaNotice: boolean } | null;
  talk: { tone: string; points: string[]; fit: string } | null;
  gameBalls: { receiver: string; reason: string }[];
  injuries: { playerId: string; bodyPart: string; firstRead: string; inProtocol: boolean; finishedGame: boolean }[];
  media: { held: boolean; questions: number; answers: { question: number; style: string }[] } | null;
  dayAfter: string | null;
  officeReplies: { playId: string; reply: string }[];
}

/** A command as app-services defines it (commands/game-frame); sent through the host. */
export interface FrameCommand { type: string; [k: string]: unknown }

export interface GameFrameSource {
  pregame(): PregameView | null;
  halftime(): HalftimeView | null;
  postgame(): PostgameView | null;
  send(c: FrameCommand): void;
}

const fmt = (n: number) => String(Math.round(n * 10) / 10);
const stateLabel = (state: string, locked: boolean) => (locked && state === 'open' ? gt('gf.state.locked') : gt(`gf.state.${state}`) + (locked ? `, ${gt('gf.state.locked')}` : ''));

export function PregameScreen({ view, send, readOnly }: { view: PregameView | null; send: (c: FrameCommand) => void; readOnly: boolean }): ReactNode {
  if (!view) return <p className="gm-line">{gt('gf.noData')}</p>;
  return (
    <section className="gf-pregame" aria-label={gt('gf.pregame.tasks')}>
      <p role="timer" aria-live="polite">{gt('gf.pregame.countdown', { min: view.minutesToKickoff })}</p>
      {view.kickoffDelayMin > 0 ? <p>{gt('gf.pregame.delay', { min: view.kickoffDelayMin })}</p> : null}
      <p>{gt('gf.pregame.budget', { min: fmt(view.budgetLeft) })}</p>
      <p className="gm-line">{gt('gf.pregame.next', { min: view.nextDeadline })}</p>
      {view.tossOptionLost.length ? <p role="alert">{gt('gf.pregame.tossLost', { who: view.tossOptionLost.join(', ') })}</p> : null}
      <table>
        <thead>
          <tr>
            <th scope="col">{gt('gf.pregame.col.task')}</th><th scope="col">{gt('gf.pregame.col.deadline')}</th><th scope="col">{gt('gf.pregame.col.cost')}</th>
            <th scope="col">{gt('gf.pregame.col.owner')}</th><th scope="col">{gt('gf.pregame.col.state')}</th><th scope="col"><span className="gm-line">{gt('gf.pregame.do')}</span></th>
          </tr>
        </thead>
        <tbody>
          {view.tasks.map((t) => (
            <tr key={t.id} data-task={t.id}>
              <th scope="row">{gt(`gf.task.${t.id}`)}</th>
              <td>{t.deadline === 0 ? gt('gf.pregame.atKickoff') : gt('gf.pregame.tMinus', { min: t.deadline })}</td>
              <td>{fmt(t.costMin)}</td>
              <td>{t.owner === 'user' ? gt('gf.owner.user') : t.owner}</td>
              <td>{stateLabel(t.state, t.locked)}</td>
              <td>{t.actionable && !readOnly ? <button type="button" onClick={() => send({ type: 'pregame.do_task', task: t.id })}>{gt('gf.pregame.do')}</button> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {readOnly ? null : (
        <p>
          <button type="button" onClick={() => send({ type: 'pregame.advance' })}>{gt('gf.pregame.advance')}</button>{' '}
          <button type="button" onClick={() => send({ type: 'pregame.run_to_kickoff' })}>{gt('gf.pregame.kickoff')}</button>
        </p>
      )}
    </section>
  );
}

export function HalftimeScreen({ view }: { view: HalftimeView | null }): ReactNode {
  if (!view) return <p className="gm-line">{gt('gf.noData')}</p>;
  return (
    <section className="gf-halftime" aria-label={gt('gf.half.items')}>
      <p role="timer">{gt('gf.half.working', { min: fmt(view.workingMin) })}</p>
      <p>{gt('gf.half.staff', { left: fmt(view.staffLeft), total: fmt(view.staffMin) })}</p>
      <p>{gt('gf.half.player', { left: fmt(view.playerLeft), total: fmt(view.playerMin) })}</p>
      <p>{gt('gf.half.attending', { unit: gt(`gf.unit.${view.attending}`) })}</p>
      <h2>{gt('gf.half.items')}</h2>
      {view.items.length === 0 ? <p className="gm-line">{gt('gf.half.none')}</p> : (
        <ol>{view.items.map((i, k) => <li key={k}>{[i.kind, i.unit ? gt(`gf.unit.${i.unit}`) : null, i.detail].filter(Boolean).join(' · ')}</li>)}</ol>
      )}
      {view.uptake.length ? (
        <>
          <h2>{gt('gf.half.uptake')}</h2>
          <ul>{view.uptake.map((u) => <li key={`${u.adjustmentId}:${u.playerId}`}>{u.playerId}: {gt(`gf.word.${u.word}`)}</li>)}</ul>
        </>
      ) : null}
    </section>
  );
}

export function PostgameScreen({ view }: { view: PostgameView | null }): ReactNode {
  if (!view) return <p className="gm-line">{gt('gf.noData')}</p>;
  return (
    <section className="gf-postgame" aria-label={view.gameId}>
      {view.handshake ? <p>{gt('gf.post.handshake', { own: view.handshake.own, other: view.handshake.other })}{view.handshake.mediaNotice ? ` ${gt('gf.post.noticed')}` : ''}</p> : null}
      {view.talk ? <p>{gt('gf.post.talk', { tone: view.talk.tone })} {gt(`gf.post.fit.${view.talk.fit}`)}</p> : null}
      {view.gameBalls.length ? (<><h2>{gt('gf.post.balls')}</h2><ul>{view.gameBalls.map((b) => <li key={b.receiver}>{b.receiver}: {b.reason}</li>)}</ul></>) : null}
      {view.injuries.length ? (
        <>
          <h2>{gt('gf.post.injuries')}</h2>
          <ul>{view.injuries.map((l) => <li key={l.playerId}>{l.playerId}, {l.bodyPart}: {l.firstRead.replace(/_/g, ' ')}{l.inProtocol ? `, ${gt('gf.post.protocol')}` : ''}</li>)}</ul>
        </>
      ) : null}
      {view.media ? (view.media.held ? <p>{gt('gf.post.media')}: {gt('gf.post.mediaQuestions', { n: view.media.questions })}</p> : <p role="alert">{gt('gf.post.mediaSkipped')}</p>) : null}
      {view.dayAfter ? <p>{gt('gf.post.dayAfter', { choice: gt(`gf.day.${view.dayAfter}`) })}</p> : null}
      {view.officeReplies.length ? (<><h2>{gt('gf.post.office')}</h2><ul>{view.officeReplies.map((o) => <li key={o.playId}>{o.playId}: {gt(`gf.reply.${o.reply}`)}</li>)}</ul></>) : null}
    </section>
  );
}

/** Route entries for the shell's route table, keyed by registry id (game.pregame, game.halftime, game.postgame). */
export function gameFrameRoutes(source: GameFrameSource): RouteTable {
  return {
    'game.pregame': { render: (p: ScreenProps) => <PregameScreen view={source.pregame()} send={source.send} readOnly={p.readOnly} /> },
    'game.halftime': { render: () => <HalftimeScreen view={source.halftime()} /> },
    'game.postgame': { render: () => <PostgameScreen view={source.postgame()} /> },
  };
}

/** Every text id the screens use exists (O6.6.1); returns the missing ones. */
export function missingText(ids: readonly string[]): string[] {
  return ids.filter((id) => STRINGS[id] === undefined);
}
