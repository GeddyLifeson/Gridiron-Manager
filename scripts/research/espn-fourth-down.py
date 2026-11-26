# Second, independent source for the fourth-down, decision-mix and punt rows of facts/measured-rate.json.
# Data: ESPN play-by-play as published by sportsdataverse (github.com/sportsdataverse/sportsdataverse-data, release espn_nfl_pbp),
# regular seasons 2022 to 2024 (815 games). Independent of nflverse, which is built from the NFL's own feed.
# usage: python3 -I espn-fourth-down.py DATA_DIR OUT_JSON   (DATA_DIR holds e2022.parquet, e2023.parquet, e2024.parquet; needs pyarrow)
import sys, json, pandas as pd
d, out = sys.argv[1], sys.argv[2]
D = []
for y in (2022, 2023, 2024):
    x = pd.read_parquet(f'{d}/e{y}.parquet'); D.append(x[x.season_type == 2])
x = pd.concat(D)
x['down'] = pd.to_numeric(x.down, errors='coerce')
f = x[x.down == 4]
GO = ['Rush', 'Pass Incompletion', 'Pass Reception', 'Passing Touchdown', 'Rushing Touchdown', 'Sack', 'Interception Return', 'Interception Return Touchdown', 'Fumble Recovery (Own)', 'Fumble Recovery (Opponent)']
go = f[f['type.text'].isin(GO) & (f.isPenalty != True) & (f.kneel_down != True)].copy()
go['dist'] = pd.to_numeric(go['start.distance'], errors='coerce')
go['conv'] = (go.td_play == True) | (go.first_down_created == True)
PU = ['Punt', 'Blocked Punt', 'Punt Team Fumble Recovery', 'Punt Return Touchdown', 'Punt (Safety)', 'Blocked Punt Touchdown']
FG = ['Field Goal Good', 'Field Goal Missed', 'Blocked Field Goal', 'Blocked Field Goal Touchdown']
pu = int(f['type.text'].isin(PU).sum()); fg = int(f['type.text'].isin(FG).sum()); n = pu + fg + len(go)
r = {'games': int(x.game_id.nunique()), 'go_attempts': int(len(go)), 'conv_pooled': float(go.conv.mean()),
     'conv_by_year': {int(k): float(v) for k, v in go.groupby('season').conv.mean().items()},
     'conv_1to2': float(go[go.dist <= 2].conv.mean()), 'n_1to2': int((go.dist <= 2).sum()),
     'mix_punt': pu / n, 'mix_fg': fg / n, 'mix_go': len(go) / n, 'mix_n': int(n)}
y24 = x[x.season == 2024]; g24 = y24.game_id.nunique()
r['punts_per_game_2024'] = float(y24['type.text'].isin(PU).sum() / g24); r['games_2024'] = int(g24)
tp = x[x.two_point_attempt == True]; r['espn_two_point_tries'] = int(len(tp))  # nflverse finds 381; ESPN feed misses some, so not used
json.dump(r, open(out, 'w'), indent=1); print(json.dumps(r, indent=1))
