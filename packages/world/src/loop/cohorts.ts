// The season-point cohort pass (X11, through G-44's `runCohort` and G-17's generator). New people enter
// sized against the X11.2.1 targets, each from his own derived stream. The undrafted pool is formed by
// the draft (it needs the draft's result) and is not generated here.
import { DMATH, deriveSeed, seedToHex, stream } from '@gm/engine-core';
import { cohorts, generator } from '@gm/people';
import type { PersonRecord, RandomStream } from '@gm/schema';
import type { PersonNameSource } from '../generation/content.ts';
import type { LiveWorld, StepHandler } from './types.ts';

export const GENERATED_COHORTS: readonly cohorts.CohortKind[] = ['recruit_class', 'college_walk_on', 'pro_entry_pool', 'coach_staff_entry'];

export interface CohortBinding {
  /** X11.2.1 scale of this world this season (teams, draft size, open entry chairs). */
  readonly scale: (world: LiveWorld) => cohorts.WorldScale;
  readonly names: PersonNameSource;
  /** Position code to weight for new players (the real roster mix). */
  readonly positionMix: Readonly<Record<string, number>>;
  /** Region a newcomer is from, drawn by the caller's tables (G-18 hometowns). */
  readonly homeRegion: (s: RandomStream) => string;
  readonly packNames?: cohorts.PackNameIndex;
  readonly nameDraw?: cohorts.NameDraw;
  readonly kinds?: readonly cohorts.CohortKind[];
}

const TIERS: readonly generator.Tier[] = [1, 2, 3, 4, 5];

export function cohortStep(b: CohortBinding): StepHandler {
  const positions = Object.keys(b.positionMix).sort();
  const weights = positions.map((p) => b.positionMix[p]!);
  const tierWeights = TIERS.map((t) => generator.TIER_SHARES[t]);
  return (ctx) => {
    const { world } = ctx;
    const season = world.date.seasonYear;
    const rnd: generator.GeneratorRandom = {
      open: (name, scope) => stream(world.seed, name, scope),
      seedHex: (name, scope) => seedToHex(deriveSeed(world.seed, name, scope)),
      math: DMATH,
    };
    const digest: Record<string, number> = {};
    for (const kind of b.kinds ?? GENERATED_COHORTS) {
      const makeup = cohorts.KIND_MAKEUP[kind];
      const made = new Map<number, number>();
      const makePerson = (slot: number, attempt: number, s: RandomStream): PersonRecord => {
        // One id per slot, reused across validation attempts, so a reseed never burns ids.
        const personId = made.get(slot) ?? world.nextIds.person!++;
        made.set(slot, personId);
        const age = cohorts.entryAge(kind, s);
        const classKey = { classYear: season, classType: `${kind}:${attempt}`, slotIndex: slot };
        const homeRegion = b.homeRegion(s);
        if (!makeup.plays) {
          return generator.generateNonPlayer({ personId, roles: makeup.roles, group: makeup.group, ageYears: age, seasonYear: season, classKey, homeRegion, hometown: null, name: b.names(s, season - age) }, rnd);
        }
        const talent: generator.Talent = makeup.group === 'pro_player' ? { kind: 'pro_entrant' } : { kind: 'tier', tier: TIERS[s.pick(tierWeights)]! };
        return generator.generatePlayer({
          personId, position: positions[s.pick(weights)]!, ageYears: age, seasonYear: season, talent, classKey,
          group: makeup.group, homeRegion, hometown: null,
        }, rnd, (ns) => b.names(ns, season - age)).record;
      };
      const r = cohorts.runCohort({
        kind, season, date: world.date, world: b.scale(world), open: (name, scope) => stream(world.seed, name, scope),
        makePerson, source: ctx.source, packNames: b.packNames, nameDraw: b.nameDraw,
      });
      const pool = world.pools.get(kind) ?? [];
      for (const p of r.people) { world.people.set(p.id, p); world.status.set(p.id, 'active'); pool.push(p.id); }
      world.pools.set(kind, pool);
      for (const e of r.emits) ctx.emit({ type: e.type, date: e.date, payload: e.payload, witnesses: e.witnesses, tier: e.tier });
      digest[kind] = r.people.length;
      digest[`${kind}_attempt`] = r.attempt;
    }
    return digest;
  };
}
