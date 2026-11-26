// Cut-ups (N1.2.2): the club's reels and the standard templates, with the uncharted count and the long
// reel warning. Building and sending go through film commands.
import { useState } from 'react';
import { v } from '../../tokens/index.ts';
import type { FilmScreenSource } from './types.ts';

export interface CutUpsScreenProps { readonly source: FilmScreenSource; readonly onWatch?: (playIds: readonly string[]) => void }

export function CutUpsScreen({ source, onWatch }: CutUpsScreenProps) {
  const [, bump] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const data = source.cutups();
  const send = (id: string, kind: 'room' | 'player' | 'staff', to: string) => {
    try { source.send('FilmSendCutUp', { id, kind, to }); setError(null); bump((n) => n + 1); } catch (e) { setError((e as Error).message); }
  };
  return (
    <section aria-label="Cut-ups" style={{ color: v('text.ink') }}>
      <h2>Cut-ups</h2>
      {error && <p role="alert" style={{ color: v('state.bad') }}>{error}</p>}
      <table>
        <thead><tr><th>Reel</th><th>Plays</th><th>Uncharted</th><th>Sent to</th><th /></tr></thead>
        <tbody>
          {data.cutups.map((c) => (
            <tr key={c.id}>
              <td>{c.title}</td>
              <td>{c.playIds.length}{c.overAttention ? ' (long: attention falls off)' : ''}</td>
              <td>{c.unchartedPlays ? `${c.unchartedPlays} still uncharted` : 'all charted'}</td>
              <td>{c.audience.kind === 'none' ? 'nobody yet' : `${c.audience.kind} ${c.audience.id ?? ''}`}</td>
              <td>
                <button onClick={() => onWatch?.(c.playIds)} disabled={!c.playIds.length}>Watch</button>
                <button onClick={() => send(c.id, 'room', 'meeting')}>Send to meeting</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Standard reels</h3>
      <ul>{data.templates.map((t) => <li key={t.id}>{t.title}</li>)}</ul>
    </section>
  );
}
