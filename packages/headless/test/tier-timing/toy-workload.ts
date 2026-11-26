// TEST DOUBLE workload for the tier timing tests: a fixed amount of busy work, less when a step it
// "supports" is applied. Not a measurement of anything in the game.
import type { CreateWorkload } from '../../src/tier-timing/index.ts';

export const createWorkload: CreateWorkload = (raw) => {
  const o = raw as { spin: number; supports: string[]; fail?: boolean };
  let prepared = false;
  return {
    scale: { spin: o.spin },
    supports: (step) => o.supports.includes(step),
    prepare() { prepared = true; },
    run(config) {
      if (o.fail) throw new Error('toy workload told to fail');
      if (!prepared) throw new Error('run before prepare');
      let x = 1;
      for (let i = 0; i < o.spin / (1 + config.thinned.length); i++) x = (Math.imul(x, 1103515245) + 12345) | 0;
      return { harness: 12.5, os: 12.5 + (x === 0 ? 1 : 0) };
    },
  };
};
