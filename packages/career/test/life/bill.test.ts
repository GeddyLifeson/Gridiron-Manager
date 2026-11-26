// The week as a bill (plans/head-coach-nuance.md item 4, Q3): neither doing everything himself nor handing
// everything off wins; protecting his time for his strengths and giving the rest to good staff does. Asks cost
// hours or standing, and skipped work falls due weeks later.
import { describe, expect, it } from 'vitest';
import { answerAsk, billWeek, dueIn, overloadFactor, type BlockChoice, type WorkBlock } from '../../src/life/index.ts';

const BLOCKS: WorkBlock[] = [
  ...[1, 2, 3, 4, 5, 6].map((r): WorkBlock => ({ id: `room${r}`, kind: 'room', aboutId: r, hours: 4 })),
  { id: 'plan', kind: 'plan', aboutId: 0, hours: 10 },
  ...[1, 2, 3, 4, 5, 6].map((p): WorkBlock => ({ id: `talk${p}`, kind: 'people', aboutId: 100 + p, hours: 1.5 })),
];
const STRENGTH = { room: 0.9, plan: 0.85, people: 0.4 };
const STAFF: Record<WorkBlock['kind'], number> = { room: 0.7, plan: 0.7, people: 0.75 };
const totalDebt = (choose: (b: WorkBlock) => BlockChoice): number => {
  const choices = Object.fromEntries(BLOCKS.map((b) => [b.id, choose(b)]));
  return billWeek({ week: 1, baseHours: 50, blocks: BLOCKS, choices, strength: STRENGTH }).debts.reduce((s, d) => s + d.size, 0);
};

describe('the week as a bill', () => {
  it('protecting time for his strengths and delegating the rest beats doing everything and delegating everything', () => {
    const everything = totalDebt(() => ({ by: 'self' }));
    const handOff = totalDebt((b) => ({ by: 'staff', quality: STAFF[b.kind] }));
    const balanced = totalDebt((b) => (STRENGTH[b.kind] > STAFF[b.kind] ? { by: 'self' } : { by: 'staff', quality: STAFF[b.kind] }));
    expect(balanced).toBeLessThan(everything);
    expect(balanced).toBeLessThan(handOff);
  });

  it('overwork past the heavy band wears down what he does himself', () => {
    expect(overloadFactor(70)).toBe(1);
    expect(overloadFactor(100)).toBeLessThan(overloadFactor(85));
  });

  it('a skipped room falls due weeks later, a skipped plan review on game day', () => {
    const bill = billWeek({ week: 5, baseHours: 50, blocks: BLOCKS, choices: {}, strength: STRENGTH });
    const room = bill.debts.find((d) => d.blockId === 'room1')!, plan = bill.debts.find((d) => d.blockId === 'plan')!;
    expect(room.dueWeek).toBeGreaterThan(plan.dueWeek);
    expect(dueIn(bill.debts, 6).due.map((d) => d.blockId)).toEqual(['plan']);
    expect(dueIn(bill.debts, 8).due.length).toBeGreaterThan(1);
  });

  it('a yes costs hours, a no costs standing, sending someone costs part; the owner remembers a no longest', () => {
    const media = { id: 'a1', from: 'media' as const, personId: 7, hours: 2, atStake: 3 };
    const owner = { ...media, id: 'a2', from: 'owner' as const };
    expect(answerAsk(media, 'yes')).toMatchObject({ coachHours: 2, sentHours: 0 });
    expect(answerAsk(media, 'yes').standing).toBeGreaterThan(0);
    expect(answerAsk(media, 'no')).toMatchObject({ coachHours: 0, standing: -3 });
    expect(answerAsk(media, 'send_someone').standing).toBeGreaterThan(answerAsk(media, 'no').standing);
    expect(answerAsk(owner, 'no').standing).toBeLessThan(answerAsk(media, 'no').standing);
    const bill = billWeek({ week: 1, baseHours: 50, blocks: [], choices: {}, strength: STRENGTH, asks: [media, owner], answers: { a1: 'yes' } });
    expect(bill.workHours).toBe(52);
    expect(bill.standing.map((s) => s.askId)).toEqual(['a1', 'a2']);
  });
});
