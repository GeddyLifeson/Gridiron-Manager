// Glossary screen and term links (school.glossary; A4, N5.2.1). The integrator adds `glossaryRoutes(host)`
// to the shell's route table (`putAll(glossaryRoutes(s.glossary))` in buildRoutes) and re-exports this folder.
// Every other screen links its terms by wrapping text in <TermText> under one <TermLinkProvider> the host
// mounts around the shell, fed by the app-services glossary read model (linkText, hoverCard).
import { createElement } from 'react';
import type { RouteTable } from '../../shell/index.ts';
import { GlossaryScreen } from './GlossaryScreen.tsx';
import type { PlayLevel, UiGlossary, UiGlossaryFilter } from './view.ts';

export * from './view.ts';
export { GlossaryScreen, TermCardView, type GlossaryScreenProps } from './GlossaryScreen.tsx';
export { TermText, TermLinkProvider, useTermLinker, type TermLinker } from './TermText.tsx';

export const GLOSSARY_SCREEN_ID = 'school.glossary';

export interface GlossaryHost {
  /** The glossary read model for the save's level, filtered, with the selected term's card. */
  glossary(level: PlayLevel, filter: UiGlossaryFilter, selectedId: string | null): UiGlossary | null;
  level(): PlayLevel;
  /** Open a lesson ("Teach me this"); absent hides the button. */
  teach?(lessonId: string): void;
}

/** Filter and selection live in the address (O1.1.3), so Back returns to the same search. */
export function filterFromView(view: Record<string, string>): UiGlossaryFilter {
  return { query: view.q ?? '', domain: view.domain || null, levelOnly: view.all !== '1', flaggedOnly: view.flagged === '1' };
}

export function viewFromFilter(f: UiGlossaryFilter, term: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.query) out.q = f.query;
  if (f.domain) out.domain = f.domain;
  if (!f.levelOnly) out.all = '1';
  if (f.flaggedOnly) out.flagged = '1';
  if (term) out.term = term;
  return out;
}

export function glossaryRoutes(host: GlossaryHost): RouteTable {
  return {
    [GLOSSARY_SCREEN_ID]: {
      render: (p) => {
        const filter = filterFromView(p.location.view);
        const term = p.location.view.term;
        return createElement(GlossaryScreen, {
          view: host.glossary(host.level(), filter, term ?? null),
          filter,
          onFilter: (f: UiGlossaryFilter) => p.setView(viewFromFilter(f, term)),
          onSelect: (id: string) => p.setView(viewFromFilter(filter, id)),
          ...(host.teach ? { onTeach: (id: string) => host.teach!(id) } : {}),
        });
      },
    },
  };
}

/** The address that opens the glossary at a term, for a TermLinker's `open`. */
export const glossaryPath = (id: string): string => `/school/glossary?term=${encodeURIComponent(id)}`;
