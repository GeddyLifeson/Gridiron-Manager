// PV-11 on the PV-06 engine: MenuMusic drives createMusicOutput, so a walk from the week hub into
// the game and the film room fades the loop out, and walking back starts it again.
import { describe, expect, it } from 'vitest';
import { AudioEngine, FakeAudioContext, createMusicOutput } from '../../src/audio/engine/index.ts';
import { MENU_TRACKS, MenuMusic, type MusicContext } from '../../src/audio/music/menu-music.ts';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const ctx = (hub: string, over: Partial<MusicContext> = {}): MusicContext => ({ hub, inGame: false, offseason: false, enabled: true, ...over });

describe('menu music on the audio engine', () => {
  it('plays the week loop at its level, stops for the game and film, and resumes after', async () => {
    const ac = new FakeAudioContext({ decode: () => ac.createBuffer(2, 8000 * 30, 8000) });
    const engine = new AudioEngine(ac, { settings: { music: { volumePct: 100, on: true } }, loader: { load: async () => new ArrayBuffer(8) } });
    const music = new MenuMusic(createMusicOutput(engine));
    const week = MENU_TRACKS.find((t) => t.id === 'weekHub')!;

    music.update(ctx('week'));
    await tick(); await tick();
    expect(engine.bed('music')!.source).toBe('file');
    const first = ac.sources().find((s) => s.kind === 'bufferSource') as unknown as { loopEnd: number; stopAt: number | null };
    expect(first.loopEnd).toBeCloseTo(week.loopSeconds, 6);
    expect(ac.pathGain(ac.sources().find((s) => s.kind === 'bufferSource')!, 1)).toBeCloseTo(10 ** (week.gainDb / 20), 5);

    music.update(ctx('game', { inGame: true }));
    expect(first.stopAt).not.toBeNull();
    music.update(ctx('film'));
    expect(ac.sources().filter((s) => s.kind === 'bufferSource')).toHaveLength(1);

    music.update(ctx('week'));
    await tick(); await tick();
    expect(ac.sources().filter((s) => s.kind === 'bufferSource')).toHaveLength(2);
  });
});
