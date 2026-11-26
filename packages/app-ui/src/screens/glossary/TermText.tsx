// Term links (N5.2.1): every glossary term in screen text is a link. Hover or focus shows a card with the
// one-line definition and two buttons, "Open glossary" and "Teach me this" (hidden when the term has no
// lesson). Text is scanned against the term and alias list at render time (rule 1) by the host's linker,
// which the read model provides for the save's level. Without a provider the text renders plain, so a
// screen can wrap its text in <TermText> before the glossary is wired.
//
// The first time a term appears in a career it is underlined; after it has been opened a starting 2 times
// (or its lesson passed) the underline goes, and a setting turns underlines off (N5.2.1, rule 3: a
// presentation preference, nothing in the simulation changes). The host keeps the seen counts (N5.4.1).
import { createContext, useContext, useState, type ReactNode } from 'react';
import { v } from '../../tokens/index.ts';
import { gt, type UiHoverCard, type UiSegment } from './view.ts';

export interface TermLinker {
  link(text: string): readonly UiSegment[];
  card(id: string): UiHoverCard | null;
  /** Open the glossary at this term. */
  open(id: string): void;
  /** Open the lesson that introduces the term ("Teach me this"). */
  teach?(lessonId: string): void;
  /** True while the term should still be underlined (unseen, underlines on). */
  underline?(id: string): boolean;
  /** The term's card was opened (feeds the seen count). */
  seen?(id: string): void;
}

const LinkerContext = createContext<TermLinker | null>(null);

export function TermLinkProvider({ linker, children }: { linker: TermLinker; children: ReactNode }) {
  return <LinkerContext.Provider value={linker}>{children}</LinkerContext.Provider>;
}

export const useTermLinker = (): TermLinker | null => useContext(LinkerContext);

const cardStyle = {
  position: 'absolute' as const, zIndex: 10, maxWidth: '32ch', border: `1px solid ${v('line.default')}`, background: v('surface.panel'), padding: '6px', margin: '2px 0 0 0',
};

function TermLink({ seg, linker }: { seg: Extract<UiSegment, { kind: 'term' }>; linker: TermLinker }) {
  const [open, setOpen] = useState(false);
  const card = open ? linker.card(seg.id) : null;
  const underline = linker.underline ? linker.underline(seg.id) : true;
  const show = () => { if (!open) { setOpen(true); linker.seen?.(seg.id); } };
  return (
    <span className="gm-term" data-term={seg.id} style={{ position: 'relative' }} onMouseEnter={show} onMouseLeave={() => setOpen(false)}>
      <button
        type="button" className="gm-term-link" aria-expanded={open} onFocus={show} onClick={() => linker.open(seg.id)}
        style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit', cursor: 'help', textDecoration: underline ? 'underline dotted' : 'none' }}
      >{seg.text}</button>
      {card ? (
        <span role="tooltip" className="gm-term-card" data-term-card={card.id} style={cardStyle}>
          <strong>{card.term}</strong>: {card.definition}
          {card.otherLevelNote ? <><br />{gt('gl.card.other', { definition: card.otherLevelNote })}</> : null}
          <br />
          <button type="button" onClick={() => linker.open(card.id)}>{gt('gl.card.open')}</button>
          {card.lesson && linker.teach ? <>{' '}<button type="button" onClick={() => linker.teach!(card.lesson!)}>{gt('gl.card.lesson')}</button></> : null}
        </span>
      ) : null}
    </span>
  );
}

/** Screen text with its glossary terms linked. Plain text when no linker is provided. */
export function TermText({ text }: { text: string }) {
  const linker = useTermLinker();
  if (!linker || !text) return <>{text}</>;
  const segs = linker.link(text);
  return <>{segs.map((s, i) => (s.kind === 'text' ? <span key={i}>{s.text}</span> : <TermLink key={i} seg={s} linker={linker} />))}</>;
}
