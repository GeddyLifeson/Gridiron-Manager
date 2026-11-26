// Automated calibration: the child process of the pool. It plays one block per message.
import { runBlock, type BlockJob } from './job.ts';

process.on('message', (m: { root: string; job: BlockJob }) => {
  process.send!(runBlock(m.root, m.job));
});
process.on('disconnect', () => process.exit(0));
