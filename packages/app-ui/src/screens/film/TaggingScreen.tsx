// Film tagging (N1.2.1, N1.2.3, O7.3.1): the play list under a filter, with tags, notes and the user's
// own chart of opponent fields. Fixed cause tags keep every grader on the same words.
import { useState } from 'react';
import { v } from '../../tokens/index.ts';
import type { FilmScreenSource } from './types.ts';

export const CAUSE_TAGS = ['physical', 'technique', 'mental', 'communication', 'alignment', 'effort', 'scheme', 'freelance', 'adjustment'] as const;

export interface TaggingScreenProps { readonly source: FilmScreenSource; readonly filter?: string; readonly onOpen?: (playId: string) => void }

export function TaggingScreen({ source, filter = '{}', onOpen }: TaggingScreenProps) {
  const [, bump] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [tag, setTag] = useState('');
  const list = source.list(filter);
  const act = (type: string, payload: unknown) => { try { source.send(type, payload); setError(null); bump((n) => n + 1); } catch (e) { setError((e as Error).message); } };
  return (
    <section aria-label="Film tagging" style={{ color: v('text.ink') }}>
      <h2>Film tagging</h2>
      {error && <p role="alert" style={{ color: v('state.bad') }}>{error}</p>}
      <label>Tag <input value={tag} onChange={(e) => setTag(e.target.value)} list="film-cause-tags" /></label>
      <datalist id="film-cause-tags">{CAUSE_TAGS.map((c) => <option key={c} value={c} />)}</datalist>
      <p>{list.total} plays</p>
      <table>
        <thead><tr><th>Play</th><th>Situation</th><th>Formation</th><th>Coverage</th><th>Result</th><th>Tags</th><th /></tr></thead>
        <tbody>
          {list.rows.map((r) => (
            <tr key={r.playId}>
              <td><button onClick={() => onOpen?.(r.playId)}>{r.playId}</button></td>
              <td>Q{r.base.quarter} {r.base.down ? `${r.base.down}&${r.base.distance ?? '?'}` : r.base.playType} {r.base.hash}</td>
              <td>{r.base.offFormation ?? '-'}</td>
              <td>{r.coaching.values.coverage ?? 'uncharted'}{r.coaching.sources.coverage === 'staff' ? ' (staff)' : r.coaching.sources.coverage === 'user' ? ' (you)' : ''}</td>
              <td>{r.base.result.replace(/_/g, ' ')} {r.base.gainLoss}</td>
              <td>{r.tags.join(', ')}</td>
              <td>
                <button disabled={!tag.trim()} onClick={() => act('FilmTagPlay', { playId: r.playId, tag })}>Add tag</button>
                {r.coaching.sources.coverage !== 'call' && <button disabled={!tag.trim()} onClick={() => act('FilmChartPlay', { playId: r.playId, field: 'coverage', value: tag })}>Chart coverage</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
