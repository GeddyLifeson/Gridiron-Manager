// G-95 certified mode and the coaching record file (N4.3, N4.4, P8.1, P7.4.1, P5.7.2).
import { describe, expect, it } from 'vitest';
import { SaveFile } from '../../src/save/save-file.ts';
import { CONFORMANCE_VERSIONS, conformanceHeader, conformanceWorld } from '../../src/save/conformance.ts';
import { DEFAULT_CERTIFIED_SWITCHES, GameVoids, MAX_RESUMES_PER_GAME, breakReasonFor, startProblems, CERTIFIED_RULESET_VERSION, type CertifiedContentItem } from '../../src/certified/conditions.ts';
import { MemoryIdentityIndex, readIdentity, startIdentity } from '../../src/certified/identity.ts';
import { markCopy, openCertified } from '../../src/certified/open.ts';
import { bytesToHex, packSignatureState, signedBytes } from '../../src/certified/signatures.ts';
import { readRecordFile, writeRecordFile, type RecordFileDeps } from '../../src/certified/record-file.ts';
import { deps, memoryDb } from '../save/helpers.ts';
import { bytesHash } from '@gm/engine-core';
import { decisions } from '@gm/models';

type DecisionRecord = Parameters<decisions.DecisionLog['appendDecision']>[0];
const SEGMENT = { gameVersion: '0.1.0', seed: 'seed-1', settings: { certified: true } };
/** A minimal fourth-down record, in the N3.1.1 shape. Values are fixtures. */
function rec(id: string, chosen: string): DecisionRecord {
  return {
    id, time: { worldDate: '2027-10-03', gameId: 7, playIndex: 12, period: 2, gameClockTenths: 4200 }, actor: { kind: 'user', personId: 101 },
    rung: 'job.head_coach', type: 'fourth_down', owner: 'I5', teamId: 3, situation: { down: 4, distance: 2 },
    options: [{ optionId: 'go', labelKey: 'opt.go', detail: null }, { optionId: 'punt', labelKey: 'opt.punt', detail: null }], chosen,
    information: [], timeTaken: { tenthsFromPrompt: 85, playClockLeftTenths: 120 },
    attribution: { creditedPersonId: 101, basis: 'own_decision', viaPersonId: null }, notMade: false, supersedes: null, snapshotId: null, violationLogId: null,
  };
}

const official = (id: string): CertifiedContentItem => ({ id, kind: 'pack', signature: 'official', userPlaybook: false, overridesCore: false });

describe('N4.3.1 / P8.1.1 certified conditions', () => {
  const start = { content: [official('core')], peoplePacks: [], ruleSetOverride: false, publishedSeed: 'season-2027-a' };
  it('a clean start is allowed; each breaking condition is named', () => {
    expect(startProblems(start)).toEqual([]);
    expect(startProblems({ ...start, content: [{ ...official('x'), signature: 'community' }] })).toEqual(['unsigned_content']);
    expect(startProblems({ ...start, content: [{ ...official('pb'), signature: 'community', userPlaybook: true }] })).toEqual([]);
    expect(startProblems({ ...start, content: [{ ...official('o'), overridesCore: true }] })).toEqual(['core_override']);
    expect(startProblems({ ...start, ruleSetOverride: true })).toEqual(['rule_set_override']);
    expect(startProblems({ ...start, publishedSeed: null })).toEqual(['unpublished_seed']);
  });
  it('people packs: none while the switch is off, at most one when on (P7.4.1, awaiting Marlon)', () => {
    const one = { ...start, peoplePacks: [{ id: 'p', hash: 'h' }] };
    expect(DEFAULT_CERTIFIED_SWITCHES.allowPeoplePack).toBe(false);
    expect(startProblems(one)).toEqual(['people_pack_not_allowed']);
    expect(startProblems(one, { allowPeoplePack: true })).toEqual([]);
    expect(startProblems({ ...one, peoplePacks: [{ id: 'p', hash: 'h' }, { id: 'q', hash: 'i' }] }, { allowPeoplePack: true })).toEqual(['people_pack_not_allowed']);
  });
  it('events: edits to imported people, truth builds and copies break; an official update does not', () => {
    expect(breakReasonFor({ kind: 'imported_person_changed', personId: 4 })).toBe('people_pack_edited');
    expect(breakReasonFor({ kind: 'opened_by_truth_build' })).toBe('truth_build_opened');
    expect(breakReasonFor({ kind: 'copy_saved' })).toBe('copy_saved');
    expect(breakReasonFor({ kind: 'content_adopted', item: { ...official('c'), signature: 'community' } })).toBe('unsigned_content');
    expect(breakReasonFor({ kind: 'official_update', version: '0.2.0' })).toBeNull();
  });
  it('a reload voids the game; resumes beyond the limit void it', () => {
    const v = new GameVoids();
    for (let i = 0; i < MAX_RESUMES_PER_GAME; i++) expect(v.resume(1)).toBeNull();
    expect(v.resume(1)).toBe('too_many_resumes');
    expect(v.reload(2)).toBe('reload');
    expect(v.status(3)).toBeNull();
    expect(v.voidedGames()).toEqual([{ gameId: 1, reason: 'too_many_resumes' }, { gameId: 2, reason: 'reload' }]);
  });
});

describe('P7.4.1 official signatures', () => {
  it('a signed pack is official; one changed byte makes it community', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']) as CryptoKeyPair;
    const pub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
    const hash = 'ab'.repeat(32);
    const sig = bytesToHex(new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, pair.privateKey, signedBytes(hash) as BufferSource)));
    expect(await packSignatureState(hash, sig, pub)).toBe('official');
    expect(await packSignatureState(`ac${hash.slice(2)}`, sig, pub)).toBe('community');
    expect(await packSignatureState(hash, null, pub)).toBe('community');
  });
});

async function certifiedSave() {
  const d = await memoryDb();
  const save = await SaveFile.create(d, deps(), { header: conformanceHeader(), state: conformanceWorld(), versions: CONFORMANCE_VERSIONS });
  return cycle(save, d);
}

/** Closes a save and opens its bytes again, as a restart would. */
async function cycle(save: { close(): Promise<void> }, d: Awaited<ReturnType<typeof memoryDb>>) {
  const bytes = await d.exportBytes!();
  await save.close();
  return memoryDb(bytes);
}

describe('P8.1.2 / N3.5.1 certified load checks', () => {
  const okChain = () => ({ ok: true, reason: null });
  it('a clean certified career stays certified across loads', async () => {
    const index = new MemoryIdentityIndex();
    let d = await certifiedSave();
    await startIdentity(d, index, 'career-1');
    for (let i = 0; i < 3; i++) {
      const o = await openCertified(d, deps(), { index, decisionChain: okChain });
      expect(o.broken).toBeNull();
      expect(o.save.header().certified).toBe(true);
      d = await cycle(o.save, d);
    }
    expect((await readIdentity(d))!.session).toBe(3);
  });

  it('restoring an older copy breaks certification with the reason shown', async () => {
    const index = new MemoryIdentityIndex();
    const d = await certifiedSave();
    await startIdentity(d, index, 'career-2');
    const oldCopy = await d.exportBytes!();
    const first = await openCertified(d, deps(), { index, decisionChain: okChain });
    expect(first.broken).toBeNull();
    await cycle(first.save, d);
    const restored = await memoryDb(oldCopy);
    const o = await openCertified(restored, deps(), { index, decisionChain: okChain });
    expect(o.broken!.reason).toBe('older_copy');
    expect(o.save.header().certified).toBe(false);
    expect(o.save.header().certifiedBrokenReason).toMatch(/^older_copy/);
  });

  it('a tampered decision log breaks certification and it never returns', async () => {
    const index = new MemoryIdentityIndex();
    let d = await certifiedSave();
    await startIdentity(d, index, 'career-3');
    const log = decisions.DecisionLog.create(SEGMENT);
    log.appendDecision(rec('x1', 'go'));
    const tampered = log.entries.map((e, i) => (i === 1 && e.payload.kind === 'decision' ? { ...e, payload: { ...e.payload, record: { ...e.payload.record, chosen: 'b' } } } : e));
    const o = await openCertified(d, deps(), { index, decisionChain: () => decisions.verifyChain(tampered) });
    expect(o.broken!.reason).toBe('decision_chain_failed');
    d = await cycle(o.save, d);
    const again = await openCertified(d, deps(), { index, decisionChain: okChain });
    expect(again.save.header().certified).toBe(false);
  });

  it('application breaks (a truth build) end certification; a copy is uncertified', async () => {
    const index = new MemoryIdentityIndex();
    const d = await certifiedSave();
    await startIdentity(d, index, 'career-4');
    const o = await openCertified(d, deps(), { index, decisionChain: okChain, breaks: ['truth_build_opened'] });
    expect(o.broken!.textKey).toBe('certified.broken.truth_build_opened');
    const c = await certifiedSave();
    const copy = await SaveFile.open(c, deps());
    await markCopy(copy);
    expect(copy.header().certifiedBrokenReason).toBe('copy_saved');
  });
});

// The full record (models rating buildRecord and verifyRecord) is checked in models/test/rating. Until the
// barrel line for `rating` lands (CR-G95-2), this file wraps a stand-in record whose check is the decision
// chain itself, which is what the record file has to carry intact.
describe('N4.4.1 exportable record file round trip', () => {
  const log = decisions.DecisionLog.create(SEGMENT);
  for (let i = 0; i < 6; i++) log.appendDecision(rec(`q${i}`, i % 2 ? 'go' : 'punt'));
  type Stand = { name: string; conditions: { certified: boolean; certifiedRuleset: string }; chain: { entries: decisions.LogEntry[]; head: string } };
  const record: Stand = { name: 'Coach', conditions: { certified: true, certifiedRuleset: CERTIFIED_RULESET_VERSION }, chain: { entries: [...log.entries], head: log.headHash } };
  const enc = new TextEncoder();
  const fileDeps: RecordFileDeps = {
    hashText: (t) => bytesHash(enc.encode(t)),
    verifyRecord: (r) => {
      const c = (r as Stand).chain;
      const v = decisions.verifyChain(c.entries);
      const problems = [...(v.ok ? [] : [v.reason!]), ...(c.entries[c.entries.length - 1]!.hash === c.head ? [] : ['head'])];
      return { ok: problems.length === 0, problems };
    },
    describe: (r) => { const c = r as Stand; return { certified: c.conditions.certified, chainHead: c.chain.head, certifiedRuleset: c.conditions.certifiedRuleset }; },
  };

  it('export then import gives an identical record and the same file text', () => {
    const text = writeRecordFile(record, fileDeps);
    const back = readRecordFile(text, fileDeps);
    expect(back.problems).toEqual([]);
    expect(back.file!.record).toEqual(JSON.parse(JSON.stringify(record)));
    expect(writeRecordFile(back.file!.record, fileDeps)).toBe(text);
    expect(back.file!.certified).toBe(true);
    expect(back.file!.chainHead).toBe(log.headHash);
  });

  it('altering one record in the file makes verification fail', () => {
    const text = writeRecordFile(record, fileDeps);
    const f = JSON.parse(text);
    f.record.chain.entries[2].payload.record.chosen = 'kneel';
    expect(readRecordFile(JSON.stringify(f), fileDeps).ok).toBe(false);
    const g = JSON.parse(text);
    g.certified = false;
    expect(readRecordFile(JSON.stringify(g), fileDeps).problems).toContain('content does not match its hash');
    expect(readRecordFile('not json', fileDeps).ok).toBe(false);
  });

  it('refuses to write a record that fails its own checks', () => {
    expect(() => writeRecordFile({ ...record, chain: { ...record.chain, head: 'x' } }, fileDeps)).toThrow(/fails its checks/);
  });
});
