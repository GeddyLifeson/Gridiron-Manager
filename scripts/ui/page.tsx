// Page for the real-browser keyboard crawl: the shell alone, with the sample top-bar facts.
import { createRoot } from 'react-dom/client';
import { Shell } from '../../packages/app-ui/src/shell/index.ts';

const path = new URLSearchParams(location.search).get('path') ?? undefined;
createRoot(document.getElementById('root')!).render(
  <Shell initialPath={path} context={{ teamName: 'Rivertown', record: '3-1', phaseLabel: 'Regular season', hoursLeft: 40 }} />,
);
