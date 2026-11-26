// WorldService target: the command and save layer every screen goes through (P1.1.3, P1.3.1, P5). The rig
// sends commands the way a screen would (WorldService.run), garbage the way a broken screen would, and
// skips time in bursts; it closes and reopens the save at random moments. After every step the visible
// state (world summary and save header) must agree with itself and with what came before.
import { WorldService } from '@gm/app-services';
import { NodePlatform } from '../../node-platform.ts';
import { screenCommandFamilies } from '../../playtest/stages/save.ts';
import { boundaryNumber, hostilePayload, hostileString, isCount } from '../hostile.ts';
import type { Action, BreakTarget, Mode, Outcome, Rnd, Violation } from '../types.ts';

/** C4 phase-0 calendar length (league data/calendar.json); read from the save's own behaviour, never assumed elsewhere. */
const DAYS_PER_YEAR = 365;
const MAX_DAYS = 366;
const OWNER = 'app-services WorldService and league world commands (schema integrator); saves G-83';

const ALL_SCREEN_TYPES = (): string[] => screenCommandFamilies().flatMap((f) => f.types);

function okName(n: unknown): boolean {
  if (typeof n !== 'string' || n.length < 1 || n.length > 60) return false;
  if (n.trim() === '') return false;
  if (/[\u0000-\u001f\u007f‪-‮]/.test(n)) return false;
  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(n)) return false;
  return true;
}

export class WorldServiceTarget implements BreakTarget {
  readonly name = 'world-service';
  readonly owner = OWNER;
  private svc: WorldService | null = null;
  private platform: NodePlatform;
  private saveName = '';
  private lastCal: { seasonYear: number; dayIndex: number } | null = null;

  constructor(private readonly saveDir: string) { this.platform = new NodePlatform(saveDir); }

  private get s(): WorldService { if (!this.svc) throw new Error('no world open'); return this.svc; }

  async reset(seedHex: string): Promise<void> {
    if (this.svc) await this.svc.close();
    this.saveName = `breaktest-ws-${seedHex}`;
    await this.platform.deleteSave(this.saveName);
    this.svc = await WorldService.newCareer(this.platform, { saveName: this.saveName, masterSeedHex: seedHex, startSeasonYear: 2026 });
    this.lastCal = null;
  }

  propose(mode: Mode, r: Rnd): Action {
    const comps = this.s.worldSummary().data.competitions.map((c) => c.id);
    switch (mode) {
      case 'legal':
        return r.chance(0.8)
          ? { kind: 'AdvanceDay', mode, args: { payload: { days: r.int(1, 14) } } }
          : { kind: 'RenameCompetition', mode, args: { payload: { competitionId: r.pick(comps), name: r.pick(['Pro League', 'College Football', 'Liga', 'National Conference']) } } };
      case 'hostile': {
        const which = r.int(0, 4);
        if (which === 0) return { kind: 'raw', mode, args: { type: hostileString(r), payload: hostilePayload(r) } };
        if (which === 1) return { kind: 'raw', mode, args: { type: r.pick(ALL_SCREEN_TYPES()), payload: hostilePayload(r) } };
        if (which === 2) return { kind: 'AdvanceDay', mode, args: { payload: hostilePayload(r) } };
        if (which === 3) return { kind: 'RenameCompetition', mode, args: { payload: { competitionId: r.pick(comps), name: hostileString(r) } } };
        return { kind: 'CreateWorld', mode, args: { payload: { masterSeedHex: '00000000000000ff', startSeasonYear: 2030, competitions: [{ name: 'X', level: 'pro', ruleSetId: 'pro_2026', leagueRulesId: 'pro_league_2026' }] } } };
      }
      case 'boundary':
        return r.chance(0.6)
          ? { kind: 'AdvanceDay', mode, args: { payload: { days: r.chance(0.5) ? boundaryNumber(r) : r.pick([0, 1, 364, 365, 366, 367, 730]) } } }
          : { kind: 'RenameCompetition', mode, args: { payload: { competitionId: r.pick([0, -1, 3, 1.5, NaN, 2 ** 53, ...comps]), name: 'x'.repeat(r.pick([1, 59, 60, 61])) } } };
      case 'out_of_order':
        // Rapid time skips: whole seasons in a burst, the way "sim to next year" spam would.
        return { kind: 'TimeSkip', mode, args: { days: r.pick([365, 366, 7, 1]), times: r.int(2, 12) } };
    }
  }

  expect(a: Action): string | null | undefined {
    const p = a.args['payload'] as Record<string, unknown> | undefined;
    const comps = new Set(this.s.worldSummary().data.competitions.map((c) => c.id));
    switch (a.kind) {
      case 'AdvanceDay': {
        if (!p || typeof p !== 'object' || Array.isArray(p) || Object.keys(p).some((k) => k !== 'days')) return 'payload must be exactly { days }';
        const d = p['days'];
        return isCount(d) && d >= 1 && d <= MAX_DAYS ? null : 'days must be a whole number from 1 to 366';
      }
      case 'RenameCompetition': {
        if (!p || typeof p !== 'object') return 'payload must be an object';
        if (!comps.has(p['competitionId'] as number)) return 'no such competition';
        return okName(p['name']) ? null : 'a competition name must be 1 to 60 printable characters, not blank';
      }
      case 'CreateWorld': return 'the world already exists';
      case 'raw': return 'unknown command or bad payload';
      case 'TimeSkip': return null;
      default: return undefined;
    }
  }

  async apply(a: Action): Promise<Outcome> {
    if (a.kind === 'TimeSkip') {
      const days = a.args['days'] as number, times = a.args['times'] as number;
      for (let i = 0; i < times; i++) {
        const r = await this.s.run('AdvanceDay', { days });
        if (!r.ok) return { accepted: false, reason: r.reason };
      }
      return { accepted: true };
    }
    const type = a.kind === 'raw' ? String(a.args['type']) : a.kind;
    const r = await this.s.run(type, a.args['payload']);
    return r.ok ? { accepted: true } : { accepted: false, reason: `${r.code}: ${r.reason}` };
  }

  invariants(): Violation[] {
    const out: Violation[] = [];
    const sum = this.s.worldSummary().data;
    const head = this.s.saveHeader();
    const c = sum.calendar;
    if (!Number.isSafeInteger(c.dayIndex) || c.dayIndex < 0 || c.dayIndex >= DAYS_PER_YEAR) out.push({ code: 'calendar.day_out_of_range', message: `Day index ${c.dayIndex} is outside 0 to ${DAYS_PER_YEAR - 1}.` });
    if (!Number.isSafeInteger(c.seasonYear)) out.push({ code: 'calendar.year_not_integer', message: `Season year ${c.seasonYear} is not a whole number.` });
    if (head.calendar.seasonYear !== c.seasonYear || head.calendar.dayIndex !== c.dayIndex) out.push({ code: 'header.calendar_mismatch', message: 'The save header calendar differs from the world calendar.', detail: { header: head.calendar, world: c } });
    if (this.lastCal && c.seasonYear * 1000 + c.dayIndex < this.lastCal.seasonYear * 1000 + this.lastCal.dayIndex) out.push({ code: 'calendar.went_back', message: 'The calendar went backwards.', detail: { before: this.lastCal, after: c } });
    this.lastCal = c;
    if (sum.competitions.length !== 2) out.push({ code: 'world.competition_count', message: `The world has ${sum.competitions.length} competitions, not 2.` });
    for (const comp of sum.competitions) if (!okName(comp.name)) out.push({ code: 'world.bad_competition_name', message: 'A competition carries a blank, over-long or unprintable name.', detail: { id: comp.id, length: comp.name.length } });
    if (head.ruleSets.length !== sum.competitions.length) out.push({ code: 'header.rule_sets_mismatch', message: 'The save header lists a different number of rule sets from the competitions.' });
    return out;
  }

  hash(): string { return this.s.worldSummary().data.stateHash; }

  async reload(): Promise<Violation[]> {
    const out: Violation[] = [];
    const v = await this.s.verify();
    if (!v.ok) out.push({ code: 'verify.failed', message: `The command log does not replay: ${v.problems.slice(0, 2).join('; ')}` });
    await this.s.close();
    this.svc = null;
    this.svc = await WorldService.load(this.platform, this.saveName);
    return out;
  }

  unreachable() {
    return [
      { code: 'ws.no_world_generation', message: 'WorldService.newCareer builds an empty world (no teams, people, rosters, money), so roster, cap, money, record and history invariants cannot run through the save layer yet. They run on the cap and world-loop targets instead until the app root binds G-81.' },
      { code: 'ws.no_fire_hire', message: 'No firing or hiring command reaches WorldService yet (no COMMANDS row), so firing and hiring mid-week cannot be sent through the app layer.' },
    ];
  }

  async close(): Promise<void> {
    if (this.svc) { await this.svc.close(); await this.platform.deleteSave(this.saveName); this.svc = null; }
  }
}
