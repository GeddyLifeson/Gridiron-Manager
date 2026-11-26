"""Adds the CBA Article 33 quote to the practice squad protection row (statement-matched, idempotent)."""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from core import *
from rows_cba import cba
p = os.path.join(os.path.dirname(__file__), '..', 'league.json'); d = json.load(open(p))
for r in d['rows']:
    if r['statement'].startswith('Practice squad protections (up to four players per week) ended'):
        if any(s['independenceGroup'] == 'nfl-nflpa-cba-2020' for s in r['sources']): break
        s = cba('Article 33 Section 2(a)', 'shall be completely free to negotiate and sign a Player Contract with any Club at any time during the League Year', 0)
        r['sources'].append(s)
        r['notes'] += ' CBA CHECK (2026-11-26, local text copy): Article 33 Section 2(a) says a practice squad player is "completely free" to sign with any club at any time "without penalty or restriction", and Article 33 has no protection clause (searched "protect" in the article). That is the text of record and implies no protection, but it is an inference from absence: the 2020 protections were a pandemic-era change that Wikipedia and Fantasy Nerds say ended after 2021. The only source for four a week in 2025 is one uncited ESPN line (2025-08-26). Marlon/key owner still decides; F-league-0078 is unchanged.'
        r['status'] = status(r); r['statusHistory'].append(dict(date='2026-11-26', status=r['status'], reason='CBA Article 33 Section 2(a) added.')); print(r['id'], r['status'])
json.dump(d, open(p, 'w'), indent=1, ensure_ascii=False); open(p, 'a').write('\n')
