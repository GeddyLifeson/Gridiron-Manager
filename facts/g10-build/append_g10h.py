"""G-10 seventh pass (2026-11-26), thread "Source the integrator's owed rule facts".
Appends rows to the existing facts files WITHOUT rerunning build.py (build.py would drop the g10f/g10g patches).
Idempotent: a row whose statement already exists is skipped. Status is computed (core.status), never typed.
All page text below was returned by the cloud web fetch on 2026-11-26 (no local copy, so the quote lint cannot re-find it)."""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from core import status
ROOT = os.path.join(os.path.dirname(__file__), '..')
D = '2026-11-26'
def src(cit, loc, how, group, primary, quote, value=None):
    d = dict(citation=cit, locator=loc, dateRead=D, howRead=how, independenceGroup=group, primary=primary, quote=quote)
    if value is not None: d['value'] = value
    return d
FETCH = 'Quote as returned by the cloud web fetch on 2026-11-26 (page text not saved locally, so the quote lint cannot re-find it). '
NFLP = 'NFL Football Operations, Performance Evaluation (https://edge-operations.nfl.com/rules-officiating/officiating/performance-evaluation; canonical https://operations.nfl.com/operations/rules-officiating/officiating/performance-evaluation; no page date, (c) 2026)'
EQ = 'NFL Football Operations, NFL Equity Rule (https://operations.nfl.com/the-rules/nfl-equity-rule; same text at https://operations.nfl.com/gameday/behind-the-scenes/nfl-equity-rule; no page date, (c) 2026)'
UNLV = 'UNLV Athletics, NEW NCAA Transfer Eligibility Requirements for 2-4 and 4-2-4 (rules for athletes first enrolling on or after 2012-08-01, https://unlv.edu/sites/default/files/page_files/3/NEW-NCAA-Transfer-Eligibility-Requirements-for-2-4-and-4-2-4.pdf)'
GUIDE = 'NCAA, 2019-20 Two-Year Transfer Guide, Division I charts pp. 11-13 ("Updated November 2018", hosted at https://www.tamiu.edu/athleticcompliance/documents/19-20-two-year-transfer.pdf)'
NFCA = 'NFCA and other coaches associations, letter to the NCAA Division I Board and Council (2025-03-11, https://nfca.org/web_docs/Coaches-Association-Letter-NCAA-Two-Year-Transfers.pdf)'
JUCO_NOTE = ('This is the Division I two-year-transfer rule as it stood BEFORE the May 2026 change. F-recruiting-0037 (NCAA AEC report, 2026-05-08) says the May 2026 change eliminates the 12-hour average and the 48/72-hour requirement for nonqualifiers, effective 2026-27, so this value is NOT the 2026-27 rule; the 2026 rule set should not take it unless the key is dated to 2025-26 and earlier. The replacement test ("based on enrollment history", NJCAA) is still unread. The sources are one NCAA rule restated by a school handout (2012), the NCAA guide (2018) and a coaches letter (2025); each is its own group. The letter quotes a marked-up bylaw whose strikethroughs did not survive extraction, so it was used only for the sentence naming the current rule. ' + FETCH)

IDMAP = []
def next_id(existing, wanted):
    prefix = wanted.rsplit('-', 1)[0]
    n = max(int(r['id'].rsplit('-', 1)[1]) for r in existing if r['id'].startswith(prefix + '-'))
    return f'{prefix}-{n + 1:04d}'
rows = {'league.json': [], 'college-recruiting.json': [], 'college-keys.json': []}
def add(file, id_, level, statement, value, unit, valid, sources, notes):
    r = dict(id=id_, level=level, domain='league-rule', statement=statement)
    if value is not None: r['value'] = value
    if unit: r['unit'] = unit
    r.update(validFor=valid, sources=sources, usedBy=[], notes=notes)
    r['status'] = status(r)
    r['statusHistory'] = [dict(date=D, status=r['status'], reason='G-10 seventh pass: sources read through the cloud web fetch.')]
    rows[file].append(r)

# ---- pro
add('league.json', 'F-league-0214', 'pro',
 'A head coach may submit up to nine plays each week to the league officiating department (Art McNally GameDay Central) for review.', 9, 'plays per week', '2026',
 [src(NFLP, 'Today\'s Technology, Coaches\' video', 'secondary summary', 'nfl-league-office', True,
   'Every head coach can submit up to nine plays each week for AMGC to review.', 9)],
 FETCH + 'The fetch tool rendered the page as an extracted summary, so howRead is "secondary summary" and the status stays 1 of 3 until the live page is read by eye. Three other NFL pages read the same pass (Art McNally GameDay Central, Preparing for Success, Behind the Stripes) state no weekly number; the ESPN story "How NFL teams complain" returned an empty page. NOT a per-game limit: the page says officials are graded on every play of every game. The bible key league.officiating_review.max_plays (I10.5.3) is the weekly coach cap.')
add('league.json', 'F-league-0215', 'pro',
 'Coach-to-player (C2P) equity rule: after a total system failure (complete inability to communicate from the sideline to the designated player), the opposing club hands over its C2P components to the league and both clubs use C2P again once the affected system works; a temporary disruption is not a total failure.', None, None, '2026',
 [src(EQ, 'Equity rule, C2P section', 'primary text', 'nfl-league-office', True,
   'A total system failure will be defined as the complete inability to communicate from the sideline to the designated player on the field.'),
  src(EQ, 'Equity rule, C2P section', 'primary text', 'nfl-league-office', True,
   'A disruption that results in the temporary inability to communicate play calls will not be considered a total system failure'),
  src(EQ, 'Equity rule, C2P section', 'primary text', 'nfl-league-office', True,
   'Once the affected C2P system is fully functional, both clubs will be permitted to use the C2P system.')],
 FETCH + 'One league page (two URLs, same text). The fetched text also says the opposing club\'s equipment manager is instructed to "hand over the C2P components"; no page read states a game delay or a time limit. Part of the rule (what the league technician does) was not read in full.')
add('league.json', 'F-league-0216', 'pro',
 'Coach-to-coach equity rule: if one team has total failure of its coach-to-coach headset system, the other team must stop using its own until the problem is resolved.', None, None, '2015 report; current text not found',
 [src('ESPN, Kevin Seifert, Malfunctioning headsets are common, but timing couldn\'t be worse (2015-09-11, https://www.espn.com/blog/nflnation/post/_/id/178579/malfunctioning-headsets-are-common-but-timing-couldnt-be-worse)', 'Article text', 'secondary summary', 'espn-2015', False,
   'the other team must discontinue its use, as well, until the problem is resolved.')],
 FETCH + 'One 2015 news article. The current NFL equity rule page covers only coach-to-player and sideline tablets, and says nothing on coach-to-coach. The article also says the rule "doesn\'t apply to coach-to-player", which the current NFL page contradicts for C2P, so the article is dated on that point. Still owed: the rulebook or Game Operations Manual text.')
add('league.json', 'F-league-0217', 'pro',
 'Practice squad protections (up to four players per week) ended after the 2021 season and are not in effect in 2026.', 0, 'count', '2026',
 [src('Wikipedia, Practice squad (https://en.wikipedia.org/wiki/Practice_squad; no revision date in the fetched text)', 'Protections paragraph', 'secondary summary', 'wikipedia', False,
   'Practice squad protections ended after the 2021 season.', 0),
  src('Fantasy Nerds, NFL practice squad rules, eligibility, pay and poaching explained (2026-08-31, rewrite of a Yahoo Sports article, https://fantasynerds.com/news/story/2026/08/31/nfl-practice-squad-rules-eligibility-pay-and-poaching-explained-1611683)', 'Article text', 'secondary summary', 'fantasynerds-yahoo', False,
   'are no longer in effect', 0)],
 FETCH + 'CONFLICT WITH F-league-0078 (value 4): ESPN (2025-08-26) says "Every Tuesday, teams can designate four players as protected", with no citation; the 2020 CBA text has no protection clause; no NFL page lists protections. Two of three sources say ended, so the 2026 value is most likely 0, but no league document was found either way. The key owner should decide; F-league-0078 was left unchanged.')

# ---- college recruiting: pre-May-2026 two-year transfer rule, one row per key
def juco(i, key, statement, value, unit, qs):
    add('college-recruiting.json', f'F-recruiting-{i:04d}', 'college', statement, value, unit, 'through 2025-26 (changed May 2026)',
        [src(UNLV, 'Nonqualifier/qualifier headings', 'secondary summary', 'unlv-handout', False, qs[0], value),
         src(GUIDE, 'Division I 2-4 transfer chart', 'primary text', 'ncaa-guide', True, qs[1], value),
         src(NFCA, 'Letter text describing the current rule', 'secondary summary', 'nfca', False, qs[2], value)],
        f'Key {key}. ' + JUCO_NOTE)
juco(38, 'juco.nonqualifier_full_time_terms', 'Before May 2026, a Division I two-year-college nonqualifier had to complete three full-time semesters (four quarters) before transferring.', 3, 'terms',
     ['Must spend at least three full-time semesters at the two-year college.', 'Complete at least three semesters or four quarters as a full-time student? Summer school does not count.', 'must have attended a minimum of 3 semesters/4 quarters, graduate from the two-year college with 48 semester hours'])
juco(39, 'juco.nonqualifier_hours', 'Before May 2026, a Division I two-year-college nonqualifier had to complete 48 semester (72 quarter) hours of transferable credit.', 48, 'semester hours',
     ['Must satisfactorily complete 48 semester hours of transferable credit.', 'Complete 48 transferable credit hours if your school uses semesters or 72 transferable credit hours if your school uses quarters?', 'graduate from the two-year college with 48 semester hours'])
juco(40, 'juco.nonqualifier_must_graduate', 'Before May 2026, a Division I two-year-college nonqualifier had to graduate from the two-year college.', True, None,
     ['Must graduate from the two-year college.', 'Graduate from your two-year school? You must have earned 25% of your credit hours at the two-year school awarding your degree.', 'graduate from the two-year college with 48 semester hours'])
juco(41, 'juco.qualifier_full_time_terms', 'Before May 2026, a Division I two-year-college qualifier had to complete at least one full-time semester or quarter.', 1, 'terms',
     ['Must spend at least one full-time semester at the two-year college.', 'Complete at least one semester or quarter as a full-time student? Summer school does not count.', 'Has spent at least one full-time semester or one full-time quarter of residence at the two-year college'])
juco(42, 'juco.qualifier_hours_per_term', 'Before May 2026, a Division I two-year-college qualifier had to average 12 transferable hours for each full-time term attended.', 12, 'hours per term',
     ['Must satisfactorily complete an average of 12 semester hours of transferable credit for each full-time semester at the two-year college.', 'Complete an average of 12 transferable credit hours in each term you attended full time?', 'average of at least 12-semester or quarter hours of transferable-degree credit'])

for f, rs in rows.items():
    p = os.path.join(ROOT, f); d = json.load(open(p))
    have = {r['statement'] for r in d['rows']}; ids = {r['id'] for r in d['rows']}
    for r in rs:
        if r['statement'] in have: continue
        r['id'] = next_id(d['rows'], r['id']); IDMAP.append((r['id']))
        d['rows'].append(r); print(f, r['id'], r['status'])
    json.dump(d, open(p, 'w'), indent=1, ensure_ascii=False); open(p, 'a').write('\n')
