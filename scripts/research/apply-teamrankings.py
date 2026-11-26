# Third source for the fourth-down conversion rows: TeamRankings team tables read in a browser on 2026-11-26.
# Attempts and conversions per team are recovered from attempts-per-game (one decimal) and conversion percent (two decimals)
# by picking the integer attempt count that fits both; Cincinnati played 16 games in 2022. League total is the sum over 32 teams.
import json
raw = json.load(open('scripts/research/teamrankings-raw-2022-2024.json'))
def parse(s):
    o = {}
    for p in s.split(','):
        k, v = p.rsplit(':', 1); o[k] = None if v == '--' else float(v.rstrip('%'))
    return o
def total(y):
    pg, pct = parse(raw[y]['fourth-downs-per-game']), parse(raw[y]['fourth-down-conversion-pct'])
    A = C = 0
    for t, g in pg.items():
        games = 16 if (y == '2022' and t == 'Cincinnati') else 17
        c = [n for n in range(1, 60) if abs(n / games - g) <= 0.05 + 1e-9 and abs(round(pct[t] * n / 100) / n * 100 - pct[t]) < 0.006]
        assert len(c) == 1, (y, t, c)
        A += c[0]; C += round(pct[t] * c[0] / 100)
    return A, C
T = {y: total(y) for y in ('2022', '2023', '2024')}
pooled = (sum(a for a, c in T.values()), sum(c for a, c in T.values()))
M = {'F-measured-rate-0052': ('2022 to 2024', pooled), 'F-measured-rate-0053': ('2022', T['2022']), 'F-measured-rate-0054': ('2023', T['2023']), 'F-measured-rate-0055': ('2024', T['2024'])}
path = 'facts/measured-rate.json'; f = json.load(open(path))
def status(r):
    read = [s for s in r['sources'] if s['howRead'] != 'model knowledge']
    vals = [s['value'] for s in read if s.get('value') is not None]
    if r.get('value') is not None and any(v != r['value'] for v in vals): return 'Conflict'
    g = {s['independenceGroup'] for s in read}
    return 'Verified' if len(g) >= 3 else {2: '2 of 3'}.get(len(g), '1 of 3')
for r in f['rows']:
    if r['id'] not in M: continue
    yrs, (a, c) = M[r['id']]; v = c / a
    assert abs(v - r['value']) <= 0.01, (r['id'], v)
    r['sources'].append({'citation': 'TeamRankings.com team tables, fourth downs per game and fourth-down conversion percent, regular season %s (end-of-season dates 2023-01-09, 2024-01-08, 2025-01-06), summed over 32 teams: %d conversions on %d attempts = %.4f against the stored %s, within the 0.01 tolerance so counted as agreeing' % (yrs, c, a, v, r['value']),
        'locator': 'research/sources/teamrankings-raw-2022-2024.json (raw tables); scripts/research/apply-teamrankings.py',
        'dateRead': '2026-11-26', 'howRead': 'secondary summary', 'independenceGroup': 'teamrankings', 'primary': False})
    new = status(r)
    r['statusHistory'].append({'date': '2026-11-26', 'status': new, 'reason': 'Source added: TeamRankings team tables read in the PC browser (%d of %d, %.4f).' % (c, a, v)})
    r['status'] = new
json.dump(f, open(path, 'w'), indent=1, ensure_ascii=False)
print(T, pooled)
