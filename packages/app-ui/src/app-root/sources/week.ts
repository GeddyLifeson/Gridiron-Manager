// Week hub sources (item 2d): the week schedule (H1), meetings (H4), travel (H8), game-week documents (H9) and
// the press conference on people.media (H7.2), read from the seat's open game week through the app-services
// week desk. Each command changes the desk and asks the root to draw again; a refused one keeps the view.
import type { weekLoop } from '@gm/app-services';
import type { RouteSources } from '../../routes.ts';

type WeekHub = Pick<RouteSources, 'week' | 'meetings' | 'travel' | 'documents' | 'press'>;

export function weekSources(desk: weekLoop.WeekDesk, redraw: () => void): WeekHub {
  const then = (r: weekLoop.DeskResult) => { if (r.ok) redraw(); };
  return {
    week: { getModel: () => desk.schedule() },
    meetings: {
      getModel: () => desk.meetings(),
      onCommand: (c) => then(c.kind === 'add_item' ? desk.addAgendaItem(c.blockId, c.itemKind) : c.kind === 'remove_item' ? desk.removeAgendaItem(c.blockId, c.n) : desk.setTone(c.blockId, c.tone)),
    },
    travel: { getModel: () => desk.travel(), onChoose: (plan) => then(desk.chooseTravel(plan)) },
    documents: {
      getModel: () => desk.documents(),
      onCommand: (c) => then(c.kind === 'detail' ? desk.setDocumentsDetail(c.detail) : desk.documentAction(c.id, c.action)),
    },
    press: {
      getModel: () => desk.press(),
      onCommand: (c) => then(c.kind === 'open_session' ? desk.openPress(c.blockId) : c.kind === 'bland_all' ? desk.blandAll() : desk.answerPress(c.choice, c.timedOut)),
    },
  };
}
