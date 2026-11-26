// Glossary screen (school.glossary; A4, O1.5.3, N5.2.1). Every term at the save's level with its
// definition, aliases, the leaf that owns it and its sources with the computed status. Anything short of
// Verified is flagged (project rule: flag what is not triple verified). Opens as a side panel during a
// game (O1.4.2). Keyboard: the search box, filters and every term are focusable controls (Q1.5.2).
import { v } from '../../tokens/index.ts';
import { TermText } from './TermText.tsx';
import { gt, isFlagged, type UiGlossary, type UiGlossaryFilter, type UiTermCard } from './view.ts';

const box = { border: `1px solid ${v('line.default')}`, background: v('surface.panel'), padding: '8px', margin: '8px 0' };

export function TermCardView({ card, onTeach, onOpen }: { card: UiTermCard; onTeach?: (lessonId: string) => void; onOpen?: (id: string) => void }) {
  return (
    <article aria-label={card.term} data-term-detail={card.id} data-status={card.status} style={box}>
      <h2>{card.term}</h2>
      {/* The definition is screen text: other terms inside it link too. */}
      <p><TermText text={card.definition} /></p>
      {card.aliases.length ? <p>{gt('gl.card.aliases', { list: card.aliases.join(', ') })}</p> : null}
      {card.variants.length ? <p>{gt('gl.card.variants', { list: card.variants.join(', ') })}</p> : null}
      <p>{gt('gl.card.level', { level: gt(`gl.level.${card.level}`) })} · {gt('gl.card.area', { domain: card.domain, subdomain: card.subdomain })} · {gt('gl.card.leaf', { leaf: card.ownerLeaf })}</p>
      {card.otherLevel ? (
        <p data-other-level={card.otherLevel.id}>
          {gt('gl.card.other', { definition: card.otherLevel.definition })}{' '}
          {onOpen ? <button type="button" onClick={() => onOpen(card.otherLevel!.id)}>{gt('gl.card.open')}</button> : null}
        </p>
      ) : null}
      <p data-fact-status={card.status}>{gt('gl.card.status', { status: card.status })}{isFlagged(card.status) ? ` ${gt('gl.card.flag')}` : ''}</p>
      <h3>{gt('gl.card.sources', { row: card.factRow })}</h3>
      <ol>
        {card.sources.map((s, i) => (
          <li key={i} data-source={i}>
            {gt('gl.card.source', { citation: s.citation, date: s.dateRead, how: s.primary ? gt('gl.card.primary') : s.howRead })}
          </li>
        ))}
      </ol>
      {/* N5.2.1 acceptance: "Teach me this" opens an existing lesson or is hidden. */}
      {card.lesson && onTeach ? <button type="button" onClick={() => onTeach(card.lesson!)}>{gt('gl.card.lesson')}</button> : null}
    </article>
  );
}

export interface GlossaryScreenProps {
  view: UiGlossary | null;
  filter: UiGlossaryFilter;
  onFilter(f: UiGlossaryFilter): void;
  onSelect(id: string): void;
  onTeach?: (lessonId: string) => void;
}

export function GlossaryScreen({ view, filter, onFilter, onSelect, onTeach }: GlossaryScreenProps) {
  if (!view) return <section aria-label={gt('gl.title')}><h1>{gt('gl.title')}</h1><p className="gm-line">{gt('gl.none')}</p></section>;
  return (
    <section aria-label={gt('gl.title')} data-screen="school.glossary">
      <h1>{gt('gl.title')}</h1>
      <div role="search">
        <label>{gt('gl.search')}{' '}
          <input type="search" value={filter.query} onChange={(e) => onFilter({ ...filter, query: e.currentTarget.value })} />
        </label>{' '}
        <label>{gt('gl.domain')}{' '}
          <select value={filter.domain ?? ''} onChange={(e) => onFilter({ ...filter, domain: e.currentTarget.value || null })}>
            <option value="">{gt('gl.domain.all')}</option>
            {view.domains.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>{' '}
        <label><input type="checkbox" checked={filter.levelOnly} onChange={(e) => onFilter({ ...filter, levelOnly: e.currentTarget.checked })} /> {gt('gl.levelOnly', { level: gt(`gl.level.${view.level}`) })}</label>{' '}
        <label><input type="checkbox" checked={filter.flaggedOnly} onChange={(e) => onFilter({ ...filter, flaggedOnly: e.currentTarget.checked })} /> {gt('gl.flaggedOnly')}</label>
      </div>
      <p className="gm-line" data-count>{gt('gl.count', { shown: view.rows.length, total: view.total })} · {Object.entries(view.statusCounts).sort().map(([k, n]) => `${k} ${n}`).join(', ')}</p>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        <ul style={{ flex: '1 1 50%', listStyle: 'none', padding: 0 }} data-term-list>
          {view.rows.length === 0 ? <li>{gt('gl.none')}</li> : view.rows.map((r) => (
            <li key={r.id} data-term-row={r.id} data-status={r.status} aria-current={view.selected?.id === r.id ? 'true' : undefined}>
              <button type="button" onClick={() => onSelect(r.id)}>{r.term}</button>
              {isFlagged(r.status) ? <span data-flag> ({r.status})</span> : null}
              <span className="gm-line"> {r.definition}</span>
            </li>
          ))}
        </ul>
        <div style={{ flex: '1 1 50%' }}>
          {view.selected ? <TermCardView card={view.selected} onOpen={onSelect} {...(onTeach ? { onTeach } : {})} /> : <p className="gm-line">{gt('gl.select')}</p>}
        </div>
      </div>
    </section>
  );
}
