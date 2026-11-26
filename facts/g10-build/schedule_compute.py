"""Schedule facts computed from SAM's local NFL data (sam-local-nfl-data.zip, nfl/data/games.csv: regular-season games 2021-2026, nflverse-derived).
Output: schedule_out.json. Run: python3 schedule_compute.py [path to games.csv]. Rest columns are days since each club's previous game."""
import csv, json, sys, zipfile, io, collections
p = sys.argv[1] if len(sys.argv) > 1 else None
raw = open(p, encoding='utf-8').read() if p else zipfile.ZipFile('/mnt/project-files/sam-local-nfl-data.zip').read('nfl/data/games.csv').decode()
rows = list(csv.DictReader(io.StringIO(raw)))
out = {}
for s in sorted({r['season'] for r in rows}):
    g = [r for r in rows if r['season'] == s]
    played = collections.defaultdict(set); n = collections.Counter()
    for r in g:
        for t in (r['away_team'], r['home_team']): played[t].add(int(r['week'])); n[t] += 1
    wk = max(int(r['week']) for r in g)
    byes = sorted(w for t, p_ in played.items() for w in range(1, wk + 1) if w not in p_)
    last = [r for r in g if r['week'] == str(wk)]
    tg = {r['week'] for r in g if r['weekday'] == 'Thursday' and r['gameday'][5:7] == '11' and 22 <= int(r['gameday'][8:]) <= 28}
    tg_days = {r['gameday'] for r in g if r['weekday'] == 'Thursday' and r['gameday'][5:7] == '11' and 22 <= int(r['gameday'][8:]) <= 28}
    short = collections.Counter(); thu = collections.Counter()
    for r in g:
        if r['weekday'] == 'Thursday':
            for side, rest in (('away_team', 'away_rest'), ('home_team', 'home_rest')):
                thu[r[side]] += 1
                if r[rest] and float(r[rest]) <= 5 and int(r['week']) > 1 and r['gameday'] not in tg_days: short[r[side]] += 1  # Thanksgiving day not counted
    out[s] = dict(games=len(g), clubs=len(n), games_per_club=sorted(set(n.values())), weeks=wk, bye_first=min(byes), bye_last=max(byes),
        byes_in_thanksgiving_week=sum(1 for w in byes if str(w) in tg), thanksgiving_week=sorted(tg),
        last_week_division_games=sum(int(r['div_game']) for r in last), last_week_games=len(last),
        saturday_by_week={w: sum(1 for r in g if r['weekday'] == 'Saturday' and r['week'] == w) for w in sorted({r['week'] for r in g if r['weekday'] == 'Saturday'}, key=int)},
        non_home_location_games=sum(1 for r in g if r['location'] != 'Home'),
        max_thursday_games_per_club=max(thu.values()), max_short_rest_thursday_per_club=max(short.values()) if short else 0)
json.dump(out, open('schedule_out.json', 'w'), indent=1)
for s, v in out.items(): print(s, v)
