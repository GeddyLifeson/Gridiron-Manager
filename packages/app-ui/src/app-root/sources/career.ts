// Career hub sources (unstarted-work item 2d): the six coach screens and the Office assignment list fed from
// the running save through app-services' career host. The host reads the save as the coach's own observer
// (never true ratings) and gives each screen its empty view when the save holds nothing for it yet. The career
// root spreads these fields into buildRoutes through the port's route-sources hook, so this file never edits
// CareerRoot.
import type { careerScreens } from '@gm/app-services';
import type { RouteSources } from '../../routes.ts';
import type { NotebookHost } from '../../screens/notebook/index.ts';
import { screenById } from '../../shell/registry.ts';
import type { ScreenProps } from '../../shell/index.ts';

/** The path of a registry screen with no route parameters, or null. */
export function screenPath(screenId: string): string | null {
  const s = screenById(screenId);
  return s && !s.route.includes(':') ? s.route : null;
}

/**
 * Route sources for the coach screens. `redraw` runs after anything that changes what a screen shows; the
 * screens here only read, so it is kept for the commands the career core adds later (CR-CS-2).
 * The assignment list mounts only while the coach holds a ladder seat (O7.2.1).
 */
export function careerSources(host: careerScreens.CareerHost, _redraw?: () => void): Pick<RouteSources, 'career' | 'assignments'> {
  if (host.personId === null) return {};
  const out: { -readonly [K in 'career' | 'assignments']?: RouteSources[K] } = {
    career: {
      career: () => host.career(),
      jobMarket: () => host.jobMarket(),
      contract: () => host.contract(),
      record: () => host.record(),
      finance: () => host.finance(),
      life: () => host.life(),
    },
  };
  const first = host.assignments();
  if (first) {
    out.assignments = {
      load: () => host.assignments() ?? first,
      onOpen: (p: ScreenProps, screenId: string) => { const path = screenPath(screenId); if (path) p.navigate(path); },
    };
  }
  return out;
}

export interface NotebookSourceOptions {
  /** Runs after an action changes the notebook, so the screen draws the new file. */
  readonly redraw?: () => void;
  /** Saves the exported text file (the shell owns files; core code writes none). */
  readonly save?: (text: string) => void;
  /** The shell's real date for the note stamp (E11.1.1); core reads no clock. */
  readonly realDate?: () => string | null;
}

/**
 * The coach's notebook (coach.notebook) over the same host: his notes kept in the save, names as he knows
 * them. Mounted by the routes integrator's `notebook` source (notebookRoutes) once the registry row lands.
 */
export function notebookSource(host: careerScreens.CareerHost, o: NotebookSourceOptions = {}): NotebookHost | null {
  if (host.personId === null) return null;
  return {
    notebook: (f) => host.notebook({
      ...(f.text ? { text: f.text } : {}), kind: f.kind, subjectType: f.subjectType, tag: f.tag, season: f.season, job: f.job,
    }),
    ledger: () => host.ledger(),
    act: (a) => {
      const r = host.notebookAct(a, o.realDate?.() ?? null);
      if (r.ok) o.redraw?.();
      return r;
    },
    exportText: () => { o.save?.(host.notebookText()); },
  };
}
