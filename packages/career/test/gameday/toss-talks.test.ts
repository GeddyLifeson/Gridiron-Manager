// I1.5 captains and the toss, I1.6.1 pregame talk, I10.2.1 postgame talk.
import { describe, it, expect } from 'vitest';
import {
  checkCaptains, penaltyCaptainFor, captainMemories, resolveToss, instructionWarnings, windAdvice, withWind, aiTossInstruction, changeSecondHalfChoice,
  pregameTalk, pregameFocusAt, PREGAME_THEMES, postgameTalk, postgameMoraleAt, allowedTones, situationOf,
  type TossInstruction, type Team, type Privilege, type PregameTheme, type Stakes, type GameSummary,
} from '../../src/gameday/index.ts';
import { PRO, COLLEGE } from './fixtures.ts';

describe('I1.5.1 captains', () => {
  it('acceptance 1: at most six (four under the college key); speaker and penalty captains are captains', () => {
    const six = { captains: ['a', 'b', 'c', 'd', 'e', 'f'], speaker: 'a' };
    expect(checkCaptains(six, PRO)).toEqual([]);
    expect(checkCaptains({ ...six, captains: [...six.captains, 'g'] }, PRO)).toContain('too_many');
    expect(checkCaptains(six, COLLEGE)).toContain('too_many');
    expect(checkCaptains({ captains: ['a'], speaker: 'b' }, PRO)).toContain('speaker_not_captain');
  });
  it('acceptance 3: exactly one penalty captain per side, defaulting to the speaker', () => {
    const c = { captains: ['qb', 'mlb'], speaker: 'qb', penaltyCaptain: { defense: 'mlb' } };
    expect(penaltyCaptainFor(c, 'offense')).toBe('qb');
    expect(penaltyCaptainFor(c, 'defense')).toBe('mlb');
  });
  it('naming a game captain gains a little; passing over an active season captain costs a little', () => {
    const m = captainMemories({ captains: ['wr9', 'ol2'], speaker: 'ol2' }, ['ol2', 'lb1'], ['ol2', 'lb1', 'wr9'], ['wr9']);
    expect(m).toEqual([
      { playerId: 'wr9', kind: 'named_game_captain', strength: 8 },
      { playerId: 'lb1', kind: 'passed_over_as_captain', strength: -3 },
    ]);
  });
});

const goal = (defend: 'north' | 'south'): Privilege => ({ kind: 'goal', defend });
const ball = (take: 'receive' | 'kick'): Privilege => ({ kind: 'ball', take });
const instr = (over: Partial<TossInstruction> = {}): TossInstruction => ({ call: 'heads', ifWon: 'defer', whenChoosingFirst: ball('receive'), ifLeft: { take: 'receive', defend: 'north' }, ...over });
const other = (t: Team): Team => (t === 'home' ? 'away' : 'home');

describe('I1.5.2 coin toss', () => {
  it('acceptance 1: every result and choice follows Rule 4-2-2 and goals change after quarters 1 and 3', () => {
    const choices: ('defer' | Privilege)[] = ['defer', ball('receive'), ball('kick'), goal('north'), goal('south')];
    for (const won of choices) for (const coin of [0.1, 0.9]) for (const homeFirst of [ball('receive'), goal('south')]) {
      const i = { home: instr({ ifWon: won, whenChoosingFirst: homeFirst }), away: instr({ ifWon: won, call: 'tails' }) };
      const r = resolveToss(i, coin, PRO);
      expect(r.winner).toBe(r.landed === 'tails' ? 'away' : 'home');
      expect(r.homeDefends[1]).not.toBe(r.homeDefends[0]);
      expect(r.homeDefends[3]).not.toBe(r.homeDefends[2]);
      if (r.deferred) {
        expect(r.firstHalf.chooser).toBe(other(r.winner));
        expect(r.secondHalf.chooser).toBe(r.winner);
      } else {
        expect(r.firstHalf.chooser).toBe(r.winner);
        expect(r.secondHalf.chooser).toBe(other(r.winner));
      }
      // the second-half chooser's privilege is honoured
      const sc = r.secondHalf.choice;
      if (sc.kind === 'ball') expect(r.secondHalf.kicksOff === r.secondHalf.chooser).toBe(sc.take === 'kick');
      else expect(r.secondHalf.chooser === 'home' ? r.homeDefends[2] : r.homeDefends[2] === 'north' ? 'south' : 'north').toBe(sc.defend);
    }
  });
  it('the winner who receives gives the loser the goal; the loser chooses first in the second half', () => {
    const r = resolveToss({ home: instr({ ifWon: ball('receive') }), away: instr({ call: 'tails', ifLeft: { take: 'receive', defend: 'south' }, whenChoosingFirst: ball('receive') }) }, 0.1, PRO);
    expect(r.winner).toBe('home');
    expect(r.firstHalf.kicksOff).toBe('away');
    expect(r.homeDefends[0]).toBe('north');
    expect(r.secondHalf.chooser).toBe('away');
    expect(r.secondHalf.kicksOff).toBe('home');
  });
  it('acceptance 2: choosing kick with a won toss shows the warning', () => {
    expect(instructionWarnings(instr({ ifWon: ball('kick') }))).toEqual(['won_and_kicked']);
    expect(resolveToss({ home: instr({ ifWon: ball('kick') }), away: instr({ call: 'tails' }) }, 0.1, PRO).warnings).toEqual(['won_and_kicked']);
  });
  it('Rule 4-2-1: a team that lost its option makes no choice in either half', () => {
    const r = resolveToss({ home: instr(), away: instr({ call: 'tails' }) }, 0.1, PRO, 'home');
    expect(r.winner).toBe('away');
    expect(r.firstHalf.chooser).toBe('away');
    expect(r.secondHalf.chooser).toBe('away');
  });
  it('halftime may change the second-half choice (rule 8)', () => {
    const base = { home: instr({ ifWon: 'defer' }), away: instr({ call: 'tails' }) };
    const changed = changeSecondHalfChoice(base, 'home', goal('north'));
    const r = resolveToss(changed, 0.1, PRO);
    expect(r.secondHalf.choice).toEqual(goal('north'));
    expect(r.homeDefends[2]).toBe('north');
  });
  it('acceptance 4: with a strong steady wind the advice takes the wind in the fourth quarter; each half has the wind once', () => {
    expect(windAdvice(5)).toBeNull();
    const a = windAdvice(18)!;
    const r = resolveToss({ home: instr({ ifWon: 'defer', whenChoosingFirst: goal(a.secondHalfDefend) }), away: instr({ call: 'tails' }) }, 0.1, PRO);
    expect(withWind(r.homeDefends[3], 18)).toBe(true);
    for (const [q1, q2] of [[0, 1], [2, 3]] as const) expect(withWind(r.homeDefends[q1], 18) !== withWind(r.homeDefends[q2], 18)).toBe(true);
  });
  it('acceptance 3 (AI): in calm conditions AI coaches always defer', () => {
    for (const w of [0, 3, -6, 9]) expect(aiTossInstruction('heads', w, 12).ifWon).toBe('defer');
  });
});

describe('I1.6.1 pregame talk', () => {
  const base = { stakes: 'normal' as Stakes, youngShare: 0.3, sameThemeStreak: 0, keys: [] };
  it('is bounded by 0.1 z, decays to zero by the end of the first quarter, and repetition shrinks it', () => {
    for (const theme of PREGAME_THEMES) for (const stakes of ['low', 'normal', 'high'] as Stakes[]) for (const y of [0, 1]) {
      expect(Math.abs(pregameTalk({ ...base, theme, stakes, youngShare: y }).focusZ)).toBeLessThanOrEqual(0.1);
    }
    const e = pregameTalk({ ...base, theme: 'keys' });
    expect(pregameFocusAt(e.focusZ, 15)).toBe(0);
    expect(pregameFocusAt(e.focusZ, 7.5)).toBeCloseTo(e.focusZ / 2);
    expect(Math.abs(pregameTalk({ ...base, theme: 'keys', sameThemeStreak: 3 }).focusZ)).toBeLessThan(Math.abs(e.focusZ));
  });
  it('fit drives the sign: emotional to veterans before a low-stakes game does nothing or harms; to a young team before a rivalry it helps', () => {
    expect(pregameTalk({ ...base, theme: 'emotional', stakes: 'low', youngShare: 0.1 }).focusZ).toBeLessThanOrEqual(0);
    expect(pregameTalk({ ...base, theme: 'emotional', stakes: 'high', youngShare: 0.8 }).focusZ).toBeGreaterThan(0);
  });
  it('acceptance: no single theme is best in every context', () => {
    const best = new Set<PregameTheme>();
    for (const stakes of ['low', 'normal', 'high'] as Stakes[]) for (const y of [0, 1]) {
      const ranked = [...PREGAME_THEMES].sort((a, b) => pregameTalk({ ...base, theme: b, stakes, youngShare: y }).focusZ - pregameTalk({ ...base, theme: a, stakes, youngShare: y }).focusZ);
      best.add(ranked[0]!);
    }
    expect(best.size).toBeGreaterThan(1);
  });
  it('keys that match the week raise readiness; keys that contradict it cost trust; skipping is neutral', () => {
    const e = pregameTalk({ ...base, theme: 'keys', keys: [{ item: 'screen', matchesWeek: true }, { item: 'blitz', matchesWeek: false }] });
    expect(e.readinessItems).toEqual([{ item: 'screen', z: 0.02 }]);
    expect(e.trustStrength).toBe(-2);
    expect(pregameTalk({ ...base, theme: 'none' }).focusZ).toBe(0);
  });
});

describe('I10.2.1 postgame talk', () => {
  const sloppyWin: GameSummary = { won: true, margin: 3, expectation: 'favoured', sloppy: true, lowEffort: false, supports: ['penalties', 'turnovers'] };
  const closeLoss: GameSummary = { won: false, margin: 3, expectation: 'underdog', sloppy: false, lowEffort: false, supports: ['effort'] };
  const lossToBetter: GameSummary = { won: false, margin: 13, expectation: 'underdog', sloppy: false, lowEffort: false, supports: ['effort'] };
  const lazyWin: GameSummary = { won: true, margin: 7, expectation: 'favoured', sloppy: false, lowEffort: true, supports: [] };
  const talk = (tone: Parameters<typeof postgameTalk>[0]['tone'], game: GameSummary, over = {}) => postgameTalk({ tone, points: [], game, credibility: 1, sameToneStreak: 0, callouts: [], ...over });
  it('fit follows what the players saw', () => {
    expect(talk('demanding', sloppyWin).fit).toBe('good');
    expect(talk('level', closeLoss).fit).toBe('good');
    expect(talk('angry', lossToBetter).fit).toBe('poor');
    expect(talk('proud', lazyWin).fit).toBe('poor');
    expect(situationOf(lossToBetter)).toBe('loss_to_better_team');
  });
  it('acceptance: never above the cap; a poor fit lowers credibility; three straight weeks give 0.49 of the first', () => {
    for (const tone of ['proud', 'level', 'demanding', 'angry', 'brief'] as const) expect(Math.abs(talk(tone, sloppyWin).moraleZ)).toBeLessThanOrEqual(0.1);
    expect(talk('angry', lossToBetter).credibilityDelta).toBeLessThan(0);
    const first = talk('demanding', sloppyWin).moraleZ;
    expect(talk('demanding', sloppyWin, { sameToneStreak: 2 }).moraleZ / first).toBeCloseTo(0.49);
    expect(talk('demanding', sloppyWin, { points: ['injuries'] }).fit).toBe('neutral');
  });
  it('a public call-out costs more with a veteran or captain; effort rises only for those who respond', () => {
    const e = talk('demanding', sloppyWin, { callouts: [{ playerId: 'v', seasons: 8, captain: false, respondsToConfrontation: false }, { playerId: 'y', seasons: 2, captain: false, respondsToConfrontation: true }] });
    expect(e.callouts).toEqual([{ playerId: 'v', tie: -0.1, effortZ: 0 }, { playerId: 'y', tie: -0.05, effortZ: 0.05 }]);
  });
  it('decays by half by midweek and is gone by the next game; edge cases narrow the tones', () => {
    expect(postgameMoraleAt(0.1, 3.5)).toBeCloseTo(0.05);
    expect(postgameMoraleAt(0.1, 7)).toBe(0);
    expect(allowedTones(true, false)).toEqual(['level', 'brief']);
    expect(allowedTones(false, true)).toEqual(['proud']);
  });
});
