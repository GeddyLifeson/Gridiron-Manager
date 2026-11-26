// Writes the release checklist: CHECKLIST.md (verdict, release gate, suites, phase gates, plans, bible summary),
// BIBLE-CHECKLIST.md (one line per bible leaf) and results.json (every check, machine-readable).
import type { CheckResult, CheckStatus, CheckGroup, GateContext } from './types.ts';
import { RELEASE_SUITES, PLATFORMS } from './suites.ts';

const STATUSES: CheckStatus[] = ['PASS', 'FAIL', 'MISSING', 'STALE', 'PENDING', 'NOT_APPLICABLE'];
const esc = (s: string) => s.replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export function counts(list: readonly CheckResult[]): Record<CheckStatus, number> {
  const c = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<CheckStatus, number>;
  for (const r of list) c[r.status]++;
  return c;
}

const GROUP_TITLES: Record<CheckGroup, string> = {
  'release-gate': 'Release gate items (R1.2.10)',
  'release-suites': 'Q1.8.1 "Before a release" suites by platform',
  'phase-gates': 'Earlier phase gates (R1.2.1 to R1.2.9)',
  'engine-plan': 'Engine work packages (plans/engine-build-plan.md)',
  'game-plan': 'Game work packages (plans/game-build-plan.md)',
  bible: 'Bible acceptance criteria (every leaf)',
};

export interface ReportMeta { ctx: GateContext; pass: boolean; reasons: string[]; bibleSource: string; notes: string[]; generatedAt: string }

export function checklistMarkdown(all: readonly CheckResult[], meta: ReportMeta): string {
  const L: string[] = [];
  L.push('# Release gate checklist (G-100)', '');
  L.push(`**Verdict: ${meta.pass ? 'PASS' : 'HOLD'}.** ${meta.reasons.join('. ')}${meta.reasons.length ? '.' : ''}`, '');
  L.push(`Commit \`${meta.ctx.commit.slice(0, 12)}\`${meta.ctx.dirty ? ' (uncommitted source changes)' : ''}. Generated ${meta.generatedAt} by \`npx tsx scripts/release/gate.ts\`. Bible: ${meta.bibleSource}.`, '');
  L.push('A check is PASS only when it was verified at this commit: an automated check that ran here, or a recorded verification with three independent confirmations (scripts/release/data/evidence.json). MISSING means the module or input does not exist yet; PENDING means it exists but nothing has verified it at this commit; STALE means the only evidence is from another commit.', '');
  for (const n of meta.notes) L.push(`- ${n}`);
  if (meta.notes.length) L.push('');
  L.push('## Summary', '', `| Group | ${STATUSES.join(' | ')} | Total |`, `| --- | ${STATUSES.map(() => '---:').join(' | ')} | ---: |`);
  for (const g of Object.keys(GROUP_TITLES) as CheckGroup[]) {
    const list = all.filter((c) => c.group === g);
    const c = counts(list);
    L.push(`| ${GROUP_TITLES[g]} | ${STATUSES.map((s) => c[s]).join(' | ')} | ${list.length} |`);
  }
  const t = counts(all);
  L.push(`| **All** | ${STATUSES.map((s) => `**${t[s]}**`).join(' | ')} | **${all.length}** |`, '');

  L.push(`## ${GROUP_TITLES['release-gate']}`, '', '| Item | Status | Kind | Detail |', '| --- | --- | --- | --- |');
  for (const c of all.filter((x) => x.group === 'release-gate')) L.push(`| ${esc(c.title)} (${c.source}) | **${c.status}** | ${c.kind} | ${esc(c.detail)} |`);

  L.push('', `## ${GROUP_TITLES['release-suites']}`, '', `| Suite | ${PLATFORMS.join(' | ')} |`, `| --- | ${PLATFORMS.map(() => '---').join(' | ')} |`);
  const byId = new Map(all.map((c) => [c.id, c]));
  for (const s of RELEASE_SUITES) L.push(`| ${s.id} ${s.title}${s.needsBothRuleSets ? ' (both rule sets)' : ''} | ${PLATFORMS.map((p) => byId.get(`suite:${s.id}:${p}`)?.status ?? '').join(' | ')} |`);
  L.push('', 'Details per suite and platform are in results.json. macOS is recorded as not tested (no machine, R1.2.1 item 1).');

  L.push('', `## ${GROUP_TITLES['phase-gates']}`, '', '| Item | Status | Criterion | Detail |', '| --- | --- | --- | --- |');
  for (const c of all.filter((x) => x.group === 'phase-gates')) L.push(`| ${c.id.replace('gate:', '')} | ${c.status} | ${esc(cut(c.criterion, 180))} | ${esc(c.detail)} |`);

  for (const g of ['engine-plan', 'game-plan'] as const) {
    L.push('', `## ${GROUP_TITLES[g]}`, '', '| Package | Status | Acceptance | Detail |', '| --- | --- | --- | --- |');
    for (const c of all.filter((x) => x.group === g)) L.push(`| ${esc(c.title)} | ${c.status} | ${esc(cut(c.criterion, 200))} | ${esc(cut(c.detail, 160))} |`);
  }

  const bible = all.filter((c) => c.group === 'bible');
  L.push('', `## ${GROUP_TITLES.bible}`, '', `Every leaf, one line each, is in BIBLE-CHECKLIST.md. By area:`, '', `| Area | ${STATUSES.join(' | ')} | Total |`, `| --- | ${STATUSES.map(() => '---:').join(' | ')} | ---: |`);
  const areas = [...new Set(bible.map((c) => c.id.replace('bible:', '').replace(/\d.*$/, '')))].sort();
  for (const a of areas) {
    const list = bible.filter((c) => c.id.replace('bible:', '').replace(/\d.*$/, '') === a);
    const c = counts(list);
    L.push(`| ${a} | ${STATUSES.map((s) => c[s]).join(' | ')} | ${list.length} |`);
  }
  return L.join('\n') + '\n';
}

export function bibleMarkdown(all: readonly CheckResult[], meta: ReportMeta): string {
  const L: string[] = ['# Bible acceptance checklist (G-100)', '', `Commit \`${meta.ctx.commit.slice(0, 12)}\`. Bible: ${meta.bibleSource}. One line per leaf: status, owner, criterion (cut at 160 characters; full text in results.json).`, ''];
  let area = '';
  for (const c of all.filter((x) => x.group === 'bible')) {
    const a = c.id.replace('bible:', '').replace(/\d.*$/, '');
    if (a !== area) { area = a; L.push('', `## ${a}`, '', '| Leaf | Status | Owner | Criterion |', '| --- | --- | --- | --- |'); }
    L.push(`| ${esc(c.title)} | ${c.status} | ${c.owner ?? ''} | ${esc(cut(c.criterion || c.detail, 160))} |`);
  }
  return L.join('\n') + '\n';
}
