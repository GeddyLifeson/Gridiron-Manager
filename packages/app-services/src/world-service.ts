// Command handling, read models and saves (P1.1.3, P1.3.1, P1.3.2). Phase 0 runs on the main thread
// behind async calls with the same shapes a world worker will use (P2.1.2 moves it in phase 2).
import {
  stateHash, chainNext, canonicalBytes, bytesHash, CHAIN_GENESIS, ENGINE_CORE_VERSION,
} from '@gm/engine-core';
import { applyCommand, emptyWorld, isCheckpoint } from '@gm/league';
import { RULE_SET_FILES, LEAGUE_RULES_IDS } from '@gm/rules-data';
import { DUMMY_PARAMETER_SET, ENGINE_VERSION } from '@gm/engine-game';
import {
  SAVE_FORMAT_VERSION, CommandEnvelope, type SaveHeader, type WorldState, type WorldSummaryModel, WorldSummaryModel as WorldSummarySchema,
} from '@gm/schema';
import { SaveStore, readHeader, verifySaveLog, type SqlDriver, type ContentItem, type ReplayDeps, type ReplayReport } from '@gm/store';
import type { Platform } from './platform.ts';
import type { CareerYear, CareerYearOptions } from './play/career-year.ts';
import { readCareerYear, readLiveWorldMeta, writeCareerYear, type LiveWorldMeta } from './play/career-save.ts';

export const APP_SERVICES_VERSION = `app 0.0.1 / ${ENGINE_VERSION}`;

export interface NewCareerOptions {
  saveName: string;
  masterSeedHex: string;
  startSeasonYear: number;
}

export type CommandOutcome = { ok: true; events: { type: string; detail: string }[] } | { ok: false; reason: string; code: string };

function contentItems(): ContentItem[] {
  return RULE_SET_FILES.map((f) => ({ id: `ruleset:${f.ruleset_id}`, kind: 'ruleset', hash: bytesHash(canonicalBytes(f)), body: f }));
}

export class WorldService {
  private constructor(
    private readonly platform: Platform,
    readonly saveName: string,
    private readonly driver: SqlDriver,
    private readonly store: SaveStore,
    private world: WorldState,
    private header: SaveHeader,
    private nextSeq: number,
    private chainHead: string,
    private version = 0,
  ) {}

  static async newCareer(platform: Platform, o: NewCareerOptions): Promise<WorldService> {
    const driver = await platform.openSave(o.saveName, true);
    const appVersion = `${platform.appVersion()} / ${APP_SERVICES_VERSION}`;
    const header: SaveHeader = {
      saveFormatVersion: SAVE_FORMAT_VERSION,
      engineVersion: ENGINE_VERSION,
      parameterSetVersion: DUMMY_PARAMETER_SET,
      masterSeed: o.masterSeedHex,
      generatorOptions: { worldSize: 'small' },
      contentManifest: contentItems().map((c) => ({ packId: c.id, version: '2026', hash: c.hash })),
      ruleSets: [],
      settings: { worldSize: 'small', retentionProfile: 'standard' },
      certified: true,
      calendar: { seasonYear: o.startSeasonYear, dayIndex: 0 },
      userPersonId: null,
      userJob: null,
      summary: 'Empty world',
      hashChainHead: CHAIN_GENESIS,
      createdWith: appVersion,
      lastWrittenWith: appVersion,
    };
    const world0 = emptyWorld();
    const store = await SaveStore.create(driver, header, world0, contentItems());
    await store.writeSnapshot('creation', 0, stateHash(world0), world0);
    const svc = new WorldService(platform, o.saveName, driver, store, world0, header, 1, CHAIN_GENESIS);
    const r = await svc.run('CreateWorld', {
      masterSeedHex: o.masterSeedHex,
      startSeasonYear: o.startSeasonYear,
      competitions: [
        { name: 'College', level: 'college', ruleSetId: 'college_2026', leagueRulesId: LEAGUE_RULES_IDS[1] },
        { name: 'Pro', level: 'pro', ruleSetId: 'pro_2026', leagueRulesId: LEAGUE_RULES_IDS[0] },
      ],
    });
    if (!r.ok) throw new Error(`world creation failed: ${r.reason}`);
    return svc;
  }

  static async load(platform: Platform, saveName: string): Promise<WorldService> {
    const driver = await platform.openSave(saveName, false);
    const store = await SaveStore.open(driver);
    const header = await readHeader(driver);
    const world = await store.world();
    const log = await store.commandLog();
    const svc = new WorldService(platform, saveName, driver, store, world, header, (log.at(-1)?.seq ?? 0) + 1, header.hashChainHead);
    const v = await svc.verify();
    if (!v.ok) throw new Error(`save failed its integrity check: ${v.problems.join('; ')}`);
    return svc;
  }

  /** Issues one command (P1.1.3): validate and apply in the core, then log and save in one transaction. */
  async run(type: string, payload: unknown): Promise<CommandOutcome> {
    const cmd = CommandEnvelope.parse({
      id: this.nextSeq, type, actor: { personId: null, job: 'system' }, worldTime: this.world.calendar, payload, schemaVersion: 1,
    });
    const r = applyCommand(this.world, cmd);
    if (!r.ok) return { ok: false, reason: r.reason, code: r.code }; // rejected commands are not logged
    const hash = stateHash(r.world);
    const eventsHash = bytesHash(canonicalBytes(r.events));
    let checkpoint;
    if (isCheckpoint(type)) {
      const head = chainNext({ prev: this.chainHead, stateHash: hash, logSequence: cmd.id, engineVersion: ENGINE_VERSION, parameterSetVersion: DUMMY_PARAMETER_SET });
      checkpoint = { stateHash: hash, head, prev: this.chainHead, engineVersion: ENGINE_VERSION, parameterSetVersion: DUMMY_PARAMETER_SET };
    }
    const header: SaveHeader = {
      ...this.header,
      calendar: r.world.calendar,
      ruleSets: r.world.competitions.map((c) => ({ competitionId: c.id, ruleSetId: c.ruleSetId, leagueRulesId: c.leagueRulesId })),
      summary: `${r.world.competitions.length} competitions, season ${r.world.calendar.seasonYear}, day ${r.world.calendar.dayIndex}`,
      hashChainHead: checkpoint?.head ?? this.chainHead,
      lastWrittenWith: `${this.platform.appVersion()} / ${APP_SERVICES_VERSION}`,
    };
    await this.store.appendCommand(cmd, r.world, header, eventsHash, checkpoint);
    await this.platform.flushSave(this.saveName, this.driver);
    this.world = r.world;
    this.header = header;
    this.nextSeq += 1;
    if (checkpoint) this.chainHead = checkpoint.head;
    this.version += 1;
    return { ok: true, events: r.events };
  }

  /** P1.1.3 acceptance 2 and P5.3.2: replay the log from the creation snapshot and check every hash. */
  verify(): Promise<ReplayReport> {
    return verifySaveLog(this.store, replayDeps());
  }

  worldSummary(): WorldSummaryModel {
    const w = this.world;
    return WorldSummarySchema.parse({
      key: 'worldSummary',
      version: this.version,
      permission: 'Read',
      data: {
        masterSeedHex: w.masterSeedHex,
        calendar: w.calendar,
        competitions: w.competitions.map((c) => ({ id: c.id, name: c.name, level: c.level, ruleSetId: c.ruleSetId, teamCount: c.teamIds.length })),
        peopleCount: w.people.length,
        stateHash: stateHash(w),
      },
      meta: {},
    });
  }

  saveHeader(): SaveHeader { return this.header; }

  /** Writes the career's live world (the career year) into this save and flushes the file (P5, X12.1). */
  async saveCareerYear(y: CareerYear): Promise<LiveWorldMeta> {
    const meta = await writeCareerYear(this.driver, y);
    await this.platform.flushSave(this.saveName, this.driver);
    return meta;
  }

  /** The career year this save holds, checked against its saved world hash, or null when it has none. */
  loadCareerYear(o: Omit<CareerYearOptions, 'world' | 'seatTeamId'>): Promise<CareerYear | null> {
    return readCareerYear(this.driver, o);
  }

  /** Where the saved live world stands, without restoring it; null when the save has none. */
  liveWorldMeta(): Promise<LiveWorldMeta | null> { return readLiveWorldMeta(this.driver); }

  async close(): Promise<void> { await this.driver.close(); }
}

/** The core functions a save replay needs (P1.1.3). */
export function replayDeps(): ReplayDeps {
  return {
    apply: (w, cmd) => applyCommand(w, cmd),
    stateHash,
    eventsHash: (e) => bytesHash(canonicalBytes(e)),
    chainNext,
    genesis: CHAIN_GENESIS,
  };
}

export const VERSIONS = { engineCore: ENGINE_CORE_VERSION, engine: ENGINE_VERSION, parameterSet: DUMMY_PARAMETER_SET, saveFormat: SAVE_FORMAT_VERSION };
