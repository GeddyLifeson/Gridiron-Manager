// Browser entry for scripts/audio/render-crowd.ts: the real engine and crowd driver in an OfflineAudioContext.
import { AudioEngine } from '../../packages/app-ui/src/audio/engine/index.ts';
import { toSoundDefs } from '../../packages/app-ui/src/audio/recipes/index.ts';
import { CrowdDriver, type CrowdFeed } from '../../packages/app-ui/src/audio/crowd/index.ts';

export async function run(plays: CrowdFeed[], sr: number, playSeconds: number, lead: number) {
  const ctx = new OfflineAudioContext(1, Math.ceil(plays.length * playSeconds * sr), sr);
  // An offline context reports 'suspended' until and between render steps; the engine (rightly) makes no
  // sound on a suspended live context, so the harness presents it as running.
  const live = new Proxy(ctx, { get(t, k) { if (k === 'state') return 'running'; const v = Reflect.get(t, k); return typeof v === 'function' ? v.bind(t) : v; } });
  const engine = new AudioEngine(live as never, { sounds: toSoundDefs() });
  const driver = new CrowdDriver(engine);
  const reports: unknown[] = [];
  driver.startGame();
  // Hand each play over at its slot start (suspend the render there), tick 0 `lead` + 0.5 s later.
  plays.forEach((p, i) => {
    const t = i * playSeconds + 0.5;
    ctx.suspend(t).then(() => { reports.push(driver.play(p, { tick0At: t + lead, audioDraw: () => 0.5 })); ctx.resume(); });
  });
  const buf = await ctx.startRendering();
  return { samples: Array.from(buf.getChannelData(0)), reports };
}
