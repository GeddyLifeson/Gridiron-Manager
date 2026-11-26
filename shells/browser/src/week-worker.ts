// The season's other games run here, off the main thread (P2.1.2, unbuilt-work item 15): each worker of the
// pool plays one real game at a time and posts back its outcome and packed film. The pool keeps job order.
import { play } from '@gm/app-services';

play.serveWeekWorker(self as unknown as Parameters<typeof play.serveWeekWorker>[0]);
