#!/usr/bin/env python3
"""Real NFL year-to-year variation behind the Q1.6.4 drift tolerances (G-88).

Downloads nflverse data from github.com (games, weekly rosters, season player stats), computes the series the
long-run harness tests, and writes drift-variation.out.json beside this file. Run:
    python3 -I scripts/research/drift-variation.py WORKDIR
WORKDIR is a new empty folder for the downloads (not committed). Nothing here uses a key.
Definitions (also in the output): season window 2002-2024 regular seasons (nflverse rosters start 2002);
roster = week-1 REG rows with status ACT or RES; age = years from birth date to Sept 1; "new to league" =
share of roster not on the previous season's week-1 roster; 2016 is dropped (roster file holds 85 rows
per team that year, an artefact) and 2017's turnover is dropped (its baseline is 2016).
"""
import csv, collections, datetime as dt, json, math, os, statistics as st, subprocess, sys

WORK = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
NV = 'https://github.com/nflverse/nflverse-data/releases/download'
SEASONS = range(2002, 2025)

def get(url, name):
    p = os.path.join(WORK, name)
    if not os.path.exists(p) or os.path.getsize(p) < 1000:
        subprocess.run(['curl', '-sL', '--fail', '-m', '240', '-o', p, url], check=True)
    return p

def ols(xs, ys):
    n = len(xs); mx = sum(xs) / n; my = sum(ys) / n; sxx = sum((x - mx) ** 2 for x in xs)
    b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx; a = my - b * mx
    se = math.sqrt(sum((y - a - b * x) ** 2 for x, y in zip(xs, ys)) / (n - 2) / sxx)
    return b, se

def summ(d, drop=()):
    ys = sorted(y for y in d if y not in drop); v = [d[y] for y in ys]; m = st.mean(v)
    b, se = ols(ys, v)
    dev = [(x - m) / m for x in v]
    dd = [v[i] - v[i - 1] for i in range(1, len(v)) if ys[i] - ys[i - 1] == 1]
    return {'years': [ys[0], ys[-1]], 'n': len(v), 'mean': m, 'sd': st.stdev(v), 'slopePerSeason': b, 'slopeSE': se,
            'slopeShare': abs(b) / m, 'twoSEShare': 2 * se / m, 'relMin': min(dev), 'relMax': max(dev),
            'sdYearToYear': st.stdev(dd), 'maxYearToYear': max(map(abs, dd)), 'values': {str(y): d[y] for y in ys}}

# --- scoring and parity from games
games = [r for r in csv.DictReader(open(get('https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv', 'games.csv')))
         if r['game_type'] == 'REG' and r['home_score'] != '']
by = collections.defaultdict(list)
for r in games: by[int(r['season'])].append(r)
ppg, wsd = {}, {}
for y in SEASONS:
    gs = by[y]
    ppg[y] = sum(float(r['home_score']) + float(r['away_score']) for r in gs) / len(gs)  # both teams, per game
    w = collections.defaultdict(float); n = collections.Counter()
    for r in gs:
        a, h = float(r['away_score']), float(r['home_score'])
        for t, s, o in ((r['home_team'], h, a), (r['away_team'], a, h)):
            n[t] += 1; w[t] += 1 if s > o else (0.5 if s == o else 0)
    wsd[y] = st.pstdev([w[t] / n[t] for t in n])

# --- rosters
snap, ages = {}, {}
for y in SEASONS:
    rows = [r for r in csv.DictReader(open(get(f'{NV}/weekly_rosters/roster_weekly_{y}.csv', f'rw_{y}.csv'))) if r['game_type'] == 'REG' and r['gsis_id']]
    wk = min(int(r['week']) for r in rows)
    sel = [r for r in rows if int(r['week']) == wk and r['status'] in ('ACT', 'RES')]
    snap[y] = {r['gsis_id'] for r in sel}
    a = [(dt.date(y, 9, 1) - dt.date.fromisoformat(r['birth_date'][:10])).days / 365.25 for r in sel if r['birth_date']]
    ages[y] = [x for x in a if 20 <= x <= 46]
age = {y: st.mean(ages[y]) for y in SEASONS}
agesd = {y: st.pstdev(ages[y]) for y in SEASONS}
newleague = {y: 1 - sum(1 for k in snap[y] if k in snap[y - 1]) / len(snap[y]) for y in SEASONS if y - 1 in snap}

# --- records since 1999: team-game and season-player records that fell, in 5-season windows
rec, falls = {}, []
for y in sorted(k for k in by if k <= 2024):
    gs = by[y]; tp = collections.Counter()
    for r in gs:
        tp[r['home_team']] += float(r['home_score']); tp[r['away_team']] += float(r['away_score'])
    for k, v in (('team_points_game', max(max(float(r['home_score']), float(r['away_score'])) for r in gs)),
                 ('margin_game', max(abs(float(r['home_score']) - float(r['away_score'])) for r in gs)),
                 ('team_points_season', max(tp.values()))):
        if k in rec and v > rec[k]: falls.append((y, k))
        rec[k] = max(rec.get(k, -1), v)
STATS = ['passing_yards', 'passing_tds', 'rushing_yards', 'rushing_tds', 'receptions', 'receiving_yards', 'receiving_tds',
         'def_sacks', 'def_interceptions', 'fg_made', 'def_tackles_solo', 'carries', 'completions', 'attempts']
best = {}
for y in range(1999, 2025):
    rows = [r for r in csv.DictReader(open(get(f'{NV}/stats_player/stats_player_reg_{y}.csv', f'ps_{y}.csv'))) if r['season_type'] == 'REG']
    for s in STATS:
        m = max(float(r[s]) for r in rows if r[s] not in ('', 'NA'))
        if s in best and m > best[s]: falls.append((y, s))
        best[s] = max(best.get(s, -1), m)
nrec = 3 + len(STATS)
windows = {}
for lo in (2000, 2005, 2010, 2015, 2020):
    n = sum(1 for y, _ in falls if lo <= y <= lo + 4)
    windows[f'{lo}-{lo + 4}'] = {'falls': n, 'perRecordPerSeason': n / (nrec * 5)}

out = {
    'source': 'nflverse (github.com/nflverse/nfldata games.csv; nflverse-data releases weekly_rosters and stats_player)',
    'computedOn': dt.date.today().isoformat(),
    'series': {
        'pointsPerGameBothTeams': summ(ppg),
        'teamWinPctSd': summ(wsd),
        'meanAgeWeek1Roster': summ(age, drop=(2016,)),
        'ageSdWithinRoster': summ(agesd, drop=(2016,)),
        'rosterShareNewToLeague': summ(newleague, drop=(2016, 2017)),
    },
    'records': {'trackedRecords': nrec, 'universe': 'records set in 1999 or later (not all-time)', 'windows': windows,
                'falls': falls},
}
json.dump(out, open(os.path.join(HERE, 'drift-variation.out.json'), 'w'), indent=1)
for k, v in out['series'].items():
    print(k, {x: round(v[x], 5) for x in ('mean', 'sd', 'slopeShare', 'twoSEShare', 'relMin', 'relMax', 'maxYearToYear')})
print(windows)
