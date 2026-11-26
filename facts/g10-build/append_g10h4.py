"""G-10 seventh pass part 4 (2026-11-26): 2026-27 CFP byes are not reserved for conference champions."""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from core import status
ROOT = os.path.join(os.path.dirname(__file__), '..'); D = '2026-11-26'
def src(c, loc, how, g, p, q, v):
    return dict(citation=c, locator=loc, dateRead=D, howRead=how, independenceGroup=g, primary=p, quote=q, value=v)
CFP = 'College Football Playoff, About the 12-Team CFP Format (2026-27) (https://collegefootballplayoff.com/sports/2024/5/29/12-team-format; no page date, (c) 2026)'
r = dict(id='F-college-0000', level='college', domain='league-rule',
  statement='2026-27 CFP: first-round byes are not reserved for conference champions; seeds 1-4 by the committee ranking get them.', value=False, validFor='2026-27',
  sources=[src(CFP, 'Format summary', 'primary text', 'cfp-official', True, 'Seeds 1-4 receive first-round byes', False),
           src(CFP, 'Seeding', 'primary text', 'cfp-official', True, 'The CFP bracket will follow the selection committee\'s rankings', False),
           src('Wikipedia, College Football Playoff (https://en.wikipedia.org/wiki/College_Football_Playoff; no revision date shown)', 'Features list', 'secondary summary', 'wikipedia', False,
               'This was changed for the 2025 season, with the four highest-ranked teams overall now receiving first-round byes, regardless of conference champion status.', False)],
  usedBy=[], notes='Quote as returned by the cloud web fetch on 2026-11-26 (page text not saved locally, so the quote lint cannot re-find it). Two groups, one primary. The CFP page does not use the words "regardless of conference championship"; that wording is Wikipedia\'s. For 2024 the four highest-ranked conference champions got byes. Automatic bids are NOT zero in 2026-27: the CFP page shows 4 automatic bids for ACC, Big Ten, Big 12 and SEC champions and 1 for the highest-ranked Group of Six team (F-college-0018 and 0019); automatic qualifiers ranked outside the top 12 are placed at the bottom of the seeding.')
r['status'] = status(r); r['statusHistory'] = [dict(date=D, status=r['status'], reason='G-10 seventh pass.')]
p = os.path.join(ROOT, 'college.json'); d = json.load(open(p))
if not any(x['statement'] == r['statement'] for x in d['rows']):
    n = max(int(x['id'].rsplit('-', 1)[1]) for x in d['rows']) + 1; r['id'] = f'F-college-{n:04d}'; d['rows'].append(r); print(r['id'], r['status'])
    json.dump(d, open(p, 'w'), indent=1, ensure_ascii=False); open(p, 'a').write('\n')
