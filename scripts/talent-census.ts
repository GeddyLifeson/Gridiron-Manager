// Talent census of a founded world (D13.4.1 metric 3; T12.2.1): found every team with the real content, then
// per team the mean primary-technique skill of its 22 starters and its count of tier 4 and 5 players (the
// generator's blue-chip tiers). Prints the spread of starter skill by level and the blue-chip share of the
// national stock by program rank, for research/tuning/talent-spread.md.
// Usage: npx tsx scripts/talent-census.ts [seedHex ...]
import { seedFromHex } from '@gm/engine-core';
import { generator } from '@gm/people';
import { CONTENT, NAMES, generation, setup } from '../packages/world/test/fixtures.ts';

const args = process.argv.slice(2);
const seeds = args;
const STARTERS: Record<string, number> = { QB: 1, RB: 1, WR: 3, TE: 1, T: 2, G: 2, C: 1, DE: 2, DT: 2, OLB: 2, ILB: 1, CB: 2, FS: 1, SS: 1 };
const primary = (p: any): number => {
  const pos = generator.profileOf(p.playing.position); const v: number[] = [];
  for (const [grp, list] of Object.entries(generator.GROUPS)) if ((generator.POSITION_RELEVANCE as any)[pos][grp] === 'p') for (const a of list as string[]) v.push(p.playing.attributes[a]);
  return v.reduce((x, y) => x + y, 0) / v.length;
};
const stats = (a: number[]) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return { n: a.length, mean: +m.toFixed(2), sd: +Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)).toFixed(2) }; };
const bands: [number, number][] = [[1, 5], [6, 10], [11, 20], [21, 30], [31, 40], [41, 50], [51, 138]];
for (const hex of seeds.length ? seeds : ['00000000000000a1']) {
  const s = setup({ seedHex: hex, size: process.env.SIZE as never ?? 'standard' });
  const seed = seedFromHex(s.seedHex);
  const built = generation.buildStructures(s, seed, CONTENT);
  const comp = new Map(built.competitions.map((c) => [c.id, c.name]));
  const level = new Map(built.competitions.map((c) => [c.id, c.level]));
  const comp0 = (id: number): string => level.get(id)!;
  // Record each college tier as founding draws it (teams in built order, players in slot order).
  const tiers: number[] = [];
  const college = CONTENT.levels.college!;
  const content = { ...CONTENT, levels: { ...CONTENT.levels, college: { ...college, talent: (rs: any, z?: number) => { const t = college.talent(rs, z); if (t.kind === 'tier') tiers.push(t.tier); return t; } } } };
  const f = generation.foundPeople(s, seed, content, built, NAMES);
  const tierOf = new Map<number, number>();
  let k = 0;
  for (const t of built.teams) if (comp0(t.competitionId) !== 'pro') for (const id of f.rosters.get(t.id)!) tierOf.set(id, tiers[k++]!);
  const z = generation.programStrength(seed, CONTENT, built);
  const byId = new Map(f.people.map((p) => [p.id, p]));

  const rows = built.teams.map((t) => {
    const players = f.rosters.get(t.id)!.map((id) => byId.get(id)!);
    const byPos: Record<string, number[]> = {};
    for (const p of players) (byPos[p.playing!.position] ??= []).push(primary(p));
    const st: number[] = [];
    for (const [pos, n] of Object.entries(STARTERS)) st.push(...(byPos[pos] ?? []).sort((a, b) => b - a).slice(0, n));
    const blue = players.filter((p) => (tierOf.get(p.id) ?? 0) >= 4).length;
    return { id: t.id, comp: comp.get(t.competitionId)!, z: z.get(t.id) ?? null, starters: st.reduce((a, b) => a + b, 0) / st.length, blue };
  });
  console.log(`seed ${hex}`);
  for (const c of [...new Set(rows.map((r) => r.comp))]) console.log(' ', c, 'starter skill', stats(rows.filter((r) => r.comp === c).map((r) => r.starters)));
  const top = rows.filter((r) => r.comp === 'college_top').sort((a, b) => b.z! - a.z!);
  const stock = rows.reduce((a, r) => a + r.blue, 0);
  console.log(`  blue-chip stock ${stock}; second division holds ${(100 * rows.filter((r) => r.comp === 'college_second').reduce((a, r) => a + r.blue, 0) / stock).toFixed(1)}%`);
  for (const [a, b] of bands) {
    const band = top.slice(a - 1, b);
    console.log(`  top-division ranks ${a}-${b}: starter skill ${stats(band.map((r) => r.starters)).mean}, blue chips ${(band.reduce((x, r) => x + r.blue, 0) / band.length).toFixed(1)} per team, ${(100 * band.reduce((x, r) => x + r.blue, 0) / band.length / stock).toFixed(2)}% of stock each`);
  }
}
