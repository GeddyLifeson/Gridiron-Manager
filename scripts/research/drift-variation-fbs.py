#!/usr/bin/env python3
"""Real FBS year-to-year variation for the Q1.6.4 drift tolerances (G-88 follow-up).

Source: ESPN college football schedules and scores as republished in sportsdataverse-data (github.com/sportsdataverse,
release espn_cfb_schedules), regular seasons 2004-2024 (2002 and 2003 are not published). FBS teams are the teams with at
least 9 regular-season games in the file (the file holds only games that involve an FBS team, so FCS teams show 1 to 3).
Only FBS-vs-FBS games count. 2020 is dropped (69 teams played); 2006 is dropped for scoring (46.95 points per game against
52 to 55 in every neighbour year: a data gap). Writes drift-variation-fbs.out.json beside this file.
    python3 -I scripts/research/drift-variation-fbs.py WORKDIR
"""
import csv, collections, json, math, os, statistics as st, subprocess, sys

WORK, HERE = sys.argv[1], os.path.dirname(os.path.abspath(__file__))
URL = 'https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_cfb_schedules/cfb_schedule_{}.csv'

def ols(xs, ys):
    n = len(xs); mx = sum(xs) / n; my = sum(ys) / n; sxx = sum((x - mx) ** 2 for x in xs)
    b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx; a = my - b * mx
    return b, math.sqrt(sum((y - a - b * x) ** 2 for x, y in zip(xs, ys)) / (n - 2) / sxx)

def summ(d):
    ys = sorted(d); v = [d[y] for y in ys]; m = st.mean(v); b, se = ols(ys, v); dev = [(x - m) / m for x in v]
    return {'years': [ys[0], ys[-1]], 'n': len(v), 'mean': m, 'sd': st.stdev(v), 'slopeShare': abs(b) / m, 'twoSEShare': 2 * se / m,
            'relMin': min(dev), 'relMax': max(dev), 'values': {str(y): d[y] for y in ys}}

ppg, wsd, nteams = {}, {}, {}
for y in range(2004, 2025):
    if y == 2020: continue
    p = os.path.join(WORK, f's_{y}.csv')
    if not os.path.exists(p): subprocess.run(['curl', '-sL', '--fail', '-m', '120', '-o', p, URL.format(y)], check=True)
    g = [r for r in csv.DictReader(open(p)) if r['season_type'] == '2' and r['status'] == 'STATUS_FINAL' and r['home_score'] not in ('', 'None')]
    cnt = collections.Counter()
    for r in g: cnt[r['home_id']] += 1; cnt[r['away_id']] += 1
    fbs = {t for t, c in cnt.items() if c >= 9}
    gg = [r for r in g if r['home_id'] in fbs and r['away_id'] in fbs]
    if y != 2006: ppg[y] = sum(float(r['home_score']) + float(r['away_score']) for r in gg) / len(gg)
    w = collections.defaultdict(float); n = collections.Counter()
    for r in gg:
        a, h = float(r['away_score']), float(r['home_score'])
        for t, s, o in ((r['home_id'], h, a), (r['away_id'], a, h)):
            n[t] += 1; w[t] += 1 if s > o else .5 if s == o else 0
    wsd[y] = st.pstdev([w[t] / n[t] for t in n if n[t] >= 8]); nteams[y] = len(fbs)
out = {'source': 'ESPN scores via sportsdataverse-data espn_cfb_schedules', 'pointsPerGameBothTeams': summ(ppg), 'teamWinPctSd': summ(wsd), 'fbsTeams': nteams}
json.dump(out, open(os.path.join(HERE, 'drift-variation-fbs.out.json'), 'w'), indent=1)
for k in ('pointsPerGameBothTeams', 'teamWinPctSd'): print(k, {x: round(v, 4) for x, v in out[k].items() if isinstance(x, str) and isinstance(v, float)})
