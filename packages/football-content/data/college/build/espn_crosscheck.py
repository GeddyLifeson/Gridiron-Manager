"""G-40 second-source cross-check for the college level priors (T10.5.1).
Run: python3 -I espn_crosscheck.py ESPN_DIR OUT.json
ESPN_DIR holds e2022.parquet, e2023.parquet, e2024.parquet, downloaded from
github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_cfb_pbp/play_by_play_YYYY.parquet
(ESPN-lineage columns). The first source is the project's CFBD-lineage run in research/college/college_baselines.py
(FBS vs FBS, 2022-2025). This file reads regular-season games of all teams ESPN lists (FBS and FCS opponents),
so small differences are expected. Numbers are rounded to 4 places.
"""
import json, sys
import pandas as pd

src, out = sys.argv[1:3]
res = {}
for y in (2022, 2023, 2024):
    d = pd.read_parquet(f'{src}/e{y}.parquet')
    d = d[d.seasonType == 2]
    tg = d.game_id.nunique() * 2
    tt = d['type.text'].fillna('')
    kn = d.text.fillna('').str.contains('kneel|spike', case=False)
    sc = d[((d['rush'] == 1) | (d['pass'] == 1)) & ~kn & (d.penalty_no_play != True)]
    s4 = sc[sc.down == 4]
    pu = d[(d.down == 4) & tt.str.contains('Punt') & ~tt.str.contains('Return')]
    fg = d[(d.down == 4) & tt.str.contains('Field Goal')]
    row = {'team_games': tg, 'scrimmage_plays_per_team_game': len(sc) / tg,
           'pass_rate': float((sc['pass'] == 1).mean()),
           'fourth_go_rate': len(s4) / (len(s4) + len(pu) + len(fg))}
    for lo, hi, nm in ((1, 2, '1-2'), (3, 5, '3-5'), (6, 99, '6+')):
        f = lambda x: x[(x.distance >= lo) & (x.distance <= hi)]
        a, b, c = len(f(s4)), len(f(pu)), len(f(fg))
        row[f'fourth_go_rate_{nm}'] = a / (a + b + c)
    # Same attempt definition as the CFBD run: made, missed and blocked kicks all count as attempts.
    good = int((tt == 'Field Goal Good').sum())
    att = int(tt.isin(['Field Goal Good', 'Field Goal Missed', 'Blocked Field Goal', 'Blocked Field Goal Touchdown']).sum())
    row['fg_attempts_per_team_game'] = att / tg
    row['fg_pct'] = good / att
    row['punts_per_team_game'] = int((tt == 'Punt').sum()) / tg
    res[str(y)] = {k: round(v, 4) if isinstance(v, float) else v for k, v in row.items()}
keys = [k for k in res['2022'] if k != 'team_games']
res['mean_2022_2024'] = {k: round(sum(res[y][k] for y in ('2022', '2023', '2024')) / 3, 4) for k in keys}
json.dump(res, open(out, 'w'), indent=1)
print(json.dumps(res['mean_2022_2024'], indent=1))
