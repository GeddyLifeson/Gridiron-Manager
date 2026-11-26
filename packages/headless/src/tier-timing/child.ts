// One cold-start measurement (X13.3.1 rule 4). Run as its own process by runner.ts:
//   node --import tsx child.ts '<json: {module, options, config}>'  -> one JSON line (a ChildSample).
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Json } from '../week-pool/job-module.ts';
import type { ChildSample, CreateWorkload, TierConfig } from './types.ts';

const MB = 1024 * 1024;

async function main(): Promise<ChildSample> {
  const { module, options, config } = JSON.parse(process.argv[2]!) as { module: string; options: Json; config: TierConfig };
  const url = module.startsWith('file:') ? module : isAbsolute(module) ? pathToFileURL(module).href : null;
  if (!url) throw new Error(`workload module ${module}: give a file: URL or an absolute path`);
  const mod = (await import(url)) as { createWorkload?: CreateWorkload };
  if (typeof mod.createWorkload !== 'function') throw new Error(`workload module ${module} does not export createWorkload`);
  const w = await mod.createWorkload(options);
  const unsupported = config.thinned.filter((s) => !w.supports(s));
  const none = { harnessMs: 0, osMs: 0, cpuMs: 0, peakRssHarnessMb: 0, peakRssOsMb: 0, value: null };
  if (unsupported.length > 0) { await w.close?.(); return { ok: true, unsupported, scale: w.scale, ...none }; }
  await w.prepare?.(config);
  let peak = process.memoryUsage.rss();
  const cpu0 = process.cpuUsage();
  const wall0 = Date.now(), t0 = performance.now();
  const out = w.run(config);
  const harnessMs = performance.now() - t0, osMs = Date.now() - wall0;
  const cpu = process.cpuUsage(cpu0);
  peak = Math.max(peak, process.memoryUsage.rss());
  // maxRSS is in kilobytes on every platform Node supports.
  const peakRssOsMb = process.resourceUsage().maxRSS / 1024;
  await w.close?.();
  return {
    ok: true, unsupported: [], scale: w.scale, harnessMs, osMs, cpuMs: (cpu.user + cpu.system) / 1000,
    peakRssHarnessMb: peak / MB, peakRssOsMb, value: out ? { harness: out.harness, os: out.os } : null,
  };
}

main()
  .catch((e: unknown): ChildSample => ({ ok: false, error: e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e) }))
  .then((s) => { process.stdout.write(`${JSON.stringify(s)}\n`); process.exit(s.ok ? 0 : 1); });
