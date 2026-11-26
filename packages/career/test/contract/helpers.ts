// Test helpers: a seeded stream (mulberry32) standing in for the world runner's engine-core stream.
import { draftContract, type CoachContract, type ContractRandom, type DraftInput } from '../../src/contract/index.ts';

export function rng(seed: number): ContractRandom {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

export const usd = (x: number) => Math.round(x * 100);

export function draft(over: Partial<DraftInput> = {}, seed = 1): CoachContract {
  return draftContract({
    id: 1, coachId: 10, employerId: 20, jobId: 30, seatId: 'head_coach', tier: 'pro', seat: 'head_coach', rung: 9,
    startYear: 2030, firstYearPayCents: usd(6_000_000), ...over,
  }, rng(seed));
}

/** A contract with flat pay and set terms, for hand-worked acceptance cases. */
export function flat(c: CoachContract, perYearCents: number): CoachContract {
  return { ...c, salary: c.salary.map((y) => ({ ...y, baseCents: perYearCents, supplementalCents: 0 })) };
}
