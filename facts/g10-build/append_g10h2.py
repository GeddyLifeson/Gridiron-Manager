"""G-10 seventh pass part 2 (2026-11-26): Hall of Fame and league-founding rows for PR 226. Same method as append_g10h.py."""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from core import status
ROOT = os.path.join(os.path.dirname(__file__), '..'); D = '2026-11-26'
FETCH = 'Quote as returned by the cloud web fetch on 2026-11-26 (page text not saved locally, so the quote lint cannot re-find it). '
def src(c, loc, how, g, p, q, v=None):
    d = dict(citation=c, locator=loc, dateRead=D, howRead=how, independenceGroup=g, primary=p, quote=q)
    if v is not None: d['value'] = v
    return d
WN = 'Wikipedia, National Football League (https://en.wikipedia.org/wiki/National_Football_League)'
WH = 'Wikipedia, History of the National Football League (https://en.wikipedia.org/wiki/History_of_the_National_Football_League)'
WP = 'Wikipedia, Pro Football Hall of Fame (https://en.wikipedia.org/wiki/Pro_Football_Hall_of_Fame)'
PH = 'Pro Football Hall of Fame, Hall of Fame history (https://www.profootballhof.com/visit/hall-of-fame-history/; no page date)'
PR = 'Pro Football Hall of Fame, selection process improvements ahead of the Class of 2027 election (2026-09-04, https://www.profootballhof.com/news/pro-football-hall-of-fame-announces-selection-process-improvements-ahead-of-class-of-2027-election)'
NF = 'National Football Foundation, College Football Hall of Fame criteria and voting process (https://footballfoundation.org/sports/2018/7/31/college-football-hall-of-fame-criteria-and-voting-process.aspx; no page date, (c) 2026)'
NA = 'National Football Foundation, College Football Hall of Fame about page (https://footballfoundation.org/sports/2018/7/31/college-football-hall-of-fame.aspx; no page date, (c) 2026)'
WC = 'Wikipedia, College Football Hall of Fame (https://en.wikipedia.org/wiki/College_Football_Hall_of_Fame)'
WD = 'Wikipedia, List of defunct NFL franchises (https://en.wikipedia.org/wiki/List_of_defunct_NFL_franchises)'
IDMAP = []
def next_id(existing, wanted):
    prefix = wanted.rsplit('-', 1)[0]
    n = max(int(r['id'].rsplit('-', 1)[1]) for r in existing if r['id'].startswith(prefix + '-'))
    return f'{prefix}-{n + 1:04d}'
rows = {'league.json': [], 'college.json': []}
def add(f, i, level, st, v, u, valid, srcs, notes):
    r = dict(id=i, level=level, domain='league-rule', statement=st)
    if v is not None: r['value'] = v
    if u: r['unit'] = u
    r.update(validFor=valid, sources=srcs, usedBy=[], notes=FETCH + notes)
    r['status'] = status(r)
    r['statusHistory'] = [dict(date=D, status=r['status'], reason='G-10 seventh pass: sources read through the cloud web fetch.')]
    rows[f].append(r)
add('league.json', 'F-league-0218', 'pro', 'The pro league was founded in 1920 as the American Professional Football Association (renamed National Football League for the 1922 season).', 1920, 'year', 'history',
 [src(WN, 'Lead', 'secondary summary', 'wikipedia', False, 'The NFL was formed in 1920 as the American Professional Football Association (APFA)', 1920),
  src(WH, 'Lead', 'secondary summary', 'wikipedia', False, 'was founded in 1920 as the American Professional Football Association (APFA)', 1920),
  src(PH, 'Hall history text', 'primary text', 'pfhof', True, 'was founded in Canton on Sept.17, 1920.', 1920)],
 'Wikipedia places the Canton meeting that formed the league on 1920-08-20 and the APFA name on 1920-09-17; the Hall of Fame page gives 1920-09-17. Only the year is claimed. The two Wikipedia pages count as one independence group.')
add('league.json', 'F-league-0219', 'pro', 'The Pro Football Hall of Fame opened to the public on September 7, 1963 (43 seasons after the league\'s 1920 founding).', 1963, 'year', 'history',
 [src(PH, 'Hall history text', 'primary text', 'pfhof', True, 'The Pro Football Hall of Fame opened to the public Sept. 7, 1963', 1963),
  src(WP, 'Infobox', 'secondary summary', 'wikipedia', False, 'Established: September 7, 1963', 1963)],
 'Opening year, not necessarily the first induction year: the size of the first (charter) class, assumed 17 in the history code, was NOT found in any page read, so no row is made for it.')
add('league.json', 'F-league-0220', 'pro', 'The Pro Football Hall of Fame Selection Committee has 28 members, of whom 25 vote in a given year (reduced from 50 ahead of the Class of 2027).', 28, 'members', '2027 election',
 [src(PR, 'Press release', 'primary text', 'pfhof', True, 'reducing the Selection Committee from 50 to 28', 28),
  src(WP, 'Selection section', 'secondary summary', 'wikipedia', False, 'enshrinees are selected by a 28-person panel officially known as the Selection Committee. Of this group, 25 will vote in a given year.', 28)],
 'The earlier committee was 50. The history code covers a span of seasons; the 28 applies to the 2027 election onward.')
add('league.json', 'F-league-0221', 'pro', 'A Pro Football Hall of Fame finalist needs at least 80 percent support from the Selection Committee.', 80, 'percent', 'unknown',
 [src(WP, 'Selection section', 'secondary summary', 'wikipedia', False, 'To be elected, a finalist must receive at least 80% support from the committee.', 80)],
 'One source. The Hall press release of 2026-09-04 does not mention the threshold, so it is not confirmed unchanged under the 28-member panel.')
add('league.json', 'F-league-0222', 'pro', 'The Pro Football Hall of Fame elects at least four and no more than nine candidates a year (the 2020 centennial class of 20 was a one-off).', 9, 'maximum per year', 'unknown',
 [src(WP, 'Selection section', 'secondary summary', 'wikipedia', False, 'At least four, but no more than nine, candidates are elected annually.', 9)],
 'One source; the minimum is 4. The per-category limits are being replaced by a single "Players" pool from 2027 (Hall press release and Wikipedia).')
add('league.json', 'F-league-0223', 'pro', 'Wikipedia states 49 defunct NFL franchises, but its own club table has 48 rows (the likely cause of the 48 vs 49 conflict).', 49, 'franchises', 'history',
 [src(WD, 'Lead sentence', 'secondary summary', 'wikipedia-defunct', False, 'The NFL has had a total of 49 franchises become defunct over its history', 49)],
 'No second count source found: Pro-Football-Reference\'s team list returned no defunct section and Pro Football Archives\' homepage has no list. Sample years in the Wikipedia table (joined/folded): Akron 1920/1926, Canton 1920/1926, Duluth 1923/1927, Frankford 1924/1931, Providence 1925/1931, Dallas Texans 1952/1952, Cincinnati Reds 1933/1934. Joined/folded years may differ from first/last game seasons; the Reds were revoked with three games left in 1934.')
add('college.json', 'F-college-0029', 'college', 'The College Football Hall of Fame inaugural class (1951) had 32 players and 22 coaches.', 54, 'inductees', '1951',
 [src(NA, 'About text', 'primary text', 'nff', True, 'Inaugural Hall of Fame Class in 1951 included 32 players and 22 coaches.', 54)
 ],
 'Value is the class total, 32 + 22. One source (NFF); Wikipedia gives the same founding year 1951. College eligibility: a player 10 full seasons after the last year of play (NFF criteria page; Wikipedia agrees); a coach 3 full seasons after retirement, or at once at age 70. STILL NOT FOUND: Honors Court size, any vote-share threshold (the page says the vote results are "to be used as a reference"), and a typical annual class size; the page gives only totals (1,129 players and 241 coaches after the 2026 class). A District Screening Committee forwards about 60 players to a national ballot sent to NFF chapter and academic members.')
for f, rs in rows.items():
    p = os.path.join(ROOT, f); d = json.load(open(p)); have = {r['statement'] for r in d['rows']}; ids = {r['id'] for r in d['rows']}
    for r in rs:
        if r['statement'] in have: continue
        r['id'] = next_id(d['rows'], r['id']); IDMAP.append((r['id']))
        d['rows'].append(r); print(f, r['id'], r['status'])
    json.dump(d, open(p, 'w'), indent=1, ensure_ascii=False); open(p, 'a').write('\n')
