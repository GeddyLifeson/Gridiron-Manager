// The new-game history runs here, off the main thread (P2.1.2): the world's past takes minutes to hours,
// and the screen stays live with progress. The wall clock is allowed in the shell (J13.4.1).
import { newgame } from '@gm/app-services';

newgame.serveWorker(self as unknown as Parameters<typeof newgame.serveWorker>[0], { now: () => performance.now() });
