# Computes the thirteen formerly zero-source calibration rows from nflverse (regular season).
# usage: python3 -I unverified-rows.py DATA_DIR  (pbp_YYYY.csv.gz, part_YYYY.csv)
import sys, json, pandas as pd, numpy as np
d = sys.argv[1]
yrs = [2022, 2023, 2024]
P = pd.concat([pd.read_csv(f'{d}/pbp_{y}.csv.gz', low_memory=False) for y in yrs])
P = P[P.season_type == 'REG']
Q = pd.concat([pd.read_csv(f'{d}/part_{y}.csv', low_memory=False) for y in yrs])
out = {}
pr = P[P.play_type.isin(['pass', 'run']) & (P.qb_kneel == 0) & (P.qb_spike == 0)]
f = pr[(pr.down == 1) & (pr.ydstogo == 10)]
out['0047_first10_pass_by_playtype'] = float((f.play_type == 'pass').mean())
out['0048_first10_dropback'] = float((f.qb_dropback == 1).mean())
out['n_first10'] = int(len(f))
# time per play: seconds from this snap to the next scrimmage snap, same game and drive, game clock (best natural definition)
S = P[P.play_type.isin(['pass', 'run'])].sort_values(['game_id', 'play_id']).copy()
S['dt'] = S.game_seconds_remaining - S.groupby(['game_id', 'drive']).game_seconds_remaining.shift(-1)
S = S[S.dt >= 0]
out['time_after_pass_drive_mean'] = float(S[S.play_type == 'pass'].dt.mean())
out['time_after_run_drive_mean'] = float(S[S.play_type == 'run'].dt.mean())
# pressure and sacks: participation file gives was_pressure and number_of_pass_rushers
m = P.merge(Q[['nflverse_game_id', 'play_id', 'number_of_pass_rushers', 'was_pressure']], left_on=['game_id', 'play_id'], right_on=['nflverse_game_id', 'play_id'], how='left')
dbk = m[(m.qb_dropback == 1) & (m.qb_scramble == 0)]
pd_ = dbk[dbk.was_pressure == True]
out['pressured_completion'] = float(pd_.complete_pass.mean())
out['pressured_yards_per_dropback_net'] = float(pd_.yards_gained.mean())
out['pressured_n'] = int(len(pd_))
pp = m[(m.play_type == 'pass') & (m.qb_spike == 0)]
for k in [3, 4, 5, 6]:
    g = pp[pp.number_of_pass_rushers == k]; out[f'sack_rate_{k}'] = float(g.sack.mean()); out[f'n_{k}'] = int(len(g))
g = pp[pp.number_of_pass_rushers >= 7]; out['sack_rate_7p'] = float(g.sack.mean()); out['n_7p'] = int(len(g))
# pre-snap offensive fouls per 100 snaps, SD across the 32 teams
pre = ['False Start', 'Delay of Game', 'Offside', 'Encroachment', 'Neutral Zone Infraction', 'Illegal Formation', 'Illegal Shift', 'Illegal Motion']
T = P[P.play_type.isin(['pass', 'run', 'no_play', 'qb_kneel', 'qb_spike'])]
v = [100 * ((g.penalty == 1) & g.penalty_type.isin(pre)).sum() / len(g) for t, g in T.groupby('posteam')]
out['presnap_off_per100_sd_teams'] = float(np.std(v, ddof=1)); out['presnap_off_per100_mean'] = float(np.mean(v)); out['teams'] = len(v)
# 2025 kickoff touchbacks (needs pbp_2025.csv.gz)
K = pd.read_csv(f'{d}/pbp_2025.csv.gz', low_memory=False); K = K[(K.season_type == 'REG') & (K.play_type == 'kickoff')]
out['kickoff_touchback_2025'] = float(K.touchback.mean()); out['kickoffs_2025'] = int(len(K))
print(json.dumps(out, indent=1))
