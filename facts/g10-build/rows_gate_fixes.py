"""Release-gate fixes (2026-11-26, G-100 findings): add the primary CBA text as a read source to rows that had
only a secondary summary. Run: python3 rows_gate_fixes.py  (idempotent; edits facts/cap.json and facts/league.json in place).
Quotes are searched in the local CBA text copy by core.S, so a missing quote stops the run. Status is recomputed by core.status."""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import core
from core import S, source, status
CBA = '/mnt/project-files/nfl-rules/cba_2020.txt'
source('cba', '2020 NFL-NFLPA Collective Bargaining Agreement (full text)', 'nfl-nflpa-cba-2020', True, 'primary text', CBA, 'cba_2020.txt')
ROOT = os.path.join(os.path.dirname(__file__), '..')
ADD = {
 'cap.json': {
  'F-cap-0047': S('cba', 'Article 27 Section 2(b)', 'to $187,500 for the 2026–27 League Years', 187500),
  'F-cap-0048': S('cba', 'Article 27 Section 7(b)', '$1.55 million for the 2026-27 League Years', 1550000),
  'F-cap-0050': S('cba', 'Article 7 Section 7(g)(i)-(iv): four salary formulas (third-through-25th, third-through-20th, Transition Tender, Franchise Tender)', 'shall equal the Franchise Tender that applies in the League Year that is the fourth year', 4),
 },
 'league.json': {
  'F-league-0058': S('cba', 'Article 26 Section 2', 'a total of three or more regular season games', 3),
  'F-league-0040': S('cba', 'Article 29 Section 1(a)', 'fourth year of credited service', 4),
 },
}
for fn, adds in ADD.items():
    p = os.path.join(ROOT, fn)
    d = json.load(open(p))
    for r in d['rows']:
        a = adds.get(r['id'])
        if not a or any(s['independenceGroup'] == a['independenceGroup'] for s in r['sources']): continue
        r['sources'].append(a)
        new = status(r)
        if new != r['status']:
            r['statusHistory'].append(dict(date='2026-11-26', status=new, reason='Release gate cleanup: primary CBA text read directly and added as a source.'))
            r['status'] = new
        r['notes'] = (r.get('notes') or '') + ' Primary CBA text added by the release-gate cleanup.'
    json.dump(d, open(p, 'w'), indent=1, ensure_ascii=False); open(p, 'a').write('\n')
