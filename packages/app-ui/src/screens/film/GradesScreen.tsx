// Player grades (N1.4): the play-by-play sheet with the totals at the foot, the grade on the chosen
// scale, candidate loafs shown as prompts, and the correction list (N1.5.1). The user may regrade any
// snap; each mark is a film command.
import { useState } from 'react';
import { v } from '../../tokens/index.ts';
import type { FilmScreenSource, SnapMarkLike } from './types.ts';

export const SCALES = ['decimal', 'letter', 'hundred', 'tiers', 'assignment', 'zeroToFour'] as const;

export interface GradesScreenProps { readonly source: FilmScreenSource; readonly gameId: number; readonly personId: number; readonly scale?: (typeof SCALES)[number] }

export function GradesScreen({ source, gameId, personId, scale: initial = 'decimal' }: GradesScreenProps) {
  const [scale, setScale] = useState<string>(initial);
  const [, bump] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const data = source.sheet(gameId, personId, scale);
  const corrections = source.corrections(gameId);
  const regrade = (r: SnapMarkLike, change: Partial<SnapMarkLike>) => {
    const m = { ...r, ...change };
    try { source.send('FilmGradeSnap', { gameId, personId, playId: r.playId, assignment: m.assignment, technique: m.technique, lostContest: m.lostContest, loaf: m.loaf, note: m.note }); setError(null); bump((n) => n + 1); } catch (e) { setError((e as Error).message); }
  };
  const setCorrection = (id: string, state: 'accepted' | 'dismissed') => {
    try { source.send('FilmSetCorrection', { gameId, correctionId: id, state }); bump((n) => n + 1); } catch (e) { setError((e as Error).message); }
  };
  const s = data.sheet;
  return (
    <section aria-label="Player grades" style={{ color: v('text.ink') }}>
      <h2>Grade sheet</h2>
      {error && <p role="alert" style={{ color: v('state.bad') }}>{error}</p>}
      <label>Scale <select value={scale} onChange={(e) => setScale(e.target.value)}>{SCALES.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
      {!s ? <p>No sheet yet for this player and game.</p> : (
        <>
          <p>Graded by {s.grader === 'user' ? 'you' : 'the position coach'}. Grade {data.display}.</p>
          <table>
            <thead><tr><th>Play</th><th>Assignment</th><th>Technique</th><th>Lost rep</th><th>Loaf</th><th>Note</th></tr></thead>
            <tbody>
              {s.rows.map((r) => (
                <tr key={r.playId}>
                  <td>{r.playId}</td>
                  <td><button onClick={() => regrade(r, { assignment: r.assignment === 'right' ? 'wrong' : 'right' })}>{r.assignment}</button></td>
                  <td><button onClick={() => regrade(r, { technique: r.technique === 'plus' ? 'zero' : r.technique === 'zero' ? 'minus' : 'plus' })}>{r.technique}</button></td>
                  <td><button onClick={() => regrade(r, { lostContest: !r.lostContest })}>{r.lostContest ? 'yes' : 'no'}</button></td>
                  <td><button onClick={() => regrade(r, { loaf: !r.loaf })}>{r.loaf ? 'loaf' : r.loafCandidate ? 'check film' : '-'}</button></td>
                  <td>{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>Snaps {s.snaps} · assignments {(s.assignmentShare * 100).toFixed(1)}% · loafs {s.loafs} ({s.snaps ? (s.loafs / s.snaps).toFixed(2) : '0'} per snap) · line mark {s.zeroToFour.toFixed(1)}</p>
          <dl><dt>Coaching points</dt><dd>{s.comments.coachingPoints || '-'}</dd><dt>This week you need to work on</dt><dd>{s.comments.workOn || '-'}</dd><dt>Summary</dt><dd>{s.comments.summary || '-'}</dd></dl>
        </>
      )}
      <h3>Corrections</h3>
      <ol>
        {corrections.shown.map((c) => (
          <li key={c.id}>
            {c.concept}: {c.cause} x{c.count}{c.repeats ? `, repeated ${c.repeats}` : ''}, {c.meanEpLost.toFixed(2)} EP lost each. Fix: {c.fix.replace(/_/g, ' ')}{c.forCoach ? ' (for the coach)' : ''}. [{c.state}]
            <button onClick={() => setCorrection(c.id, 'accepted')}>Accept</button>
            <button onClick={() => setCorrection(c.id, 'dismissed')}>Dismiss</button>
          </li>
        ))}
      </ol>
      {corrections.more.length > 0 && <p>{corrections.more.length} more items</p>}
    </section>
  );
}
