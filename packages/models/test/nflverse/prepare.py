# Prepare nflverse play-by-play (2022-2024 regular seasons) as training rows for the G-07 bootstrap fit.
# Source files: https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_<year>.csv.gz
# (the same files research/nflverse_baselines.py reads). Usage:
#   python3 -I prepare.py <dir with play_by_play_YYYY.csv.gz or pbpYYYY.csv.gz> <out.csv>
# Output: one row per scrimmage or kickoff play with the state, the next score in the half relative to
# the team in possession (N2.2.1 rule 2), the final result relative to that team (N2.2.2 rule 1), and the
# nflfastR ep and wp columns kept only for the comparison report. Tries are summarised separately.
import sys, os, pandas as pd, numpy as np

src, out = sys.argv[1], sys.argv[2]
cols = ['game_id', 'play_id', 'season_type', 'qtr', 'game_half', 'game_seconds_remaining', 'half_seconds_remaining',
        'posteam', 'defteam', 'home_team', 'down', 'ydstogo', 'yardline_100', 'posteam_timeouts_remaining',
        'defteam_timeouts_remaining', 'score_differential', 'play_type', 'spread_line', 'result', 'home_opening_kickoff',
        'touchdown', 'td_team', 'field_goal_result', 'safety', 'extra_point_attempt', 'two_point_attempt',
        'extra_point_result', 'two_point_conv_result', 'kickoff_attempt', 'ep', 'wp', 'qb_kneel', 'qb_spike',
        'season', 'rush_attempt', 'pass_attempt']
frames = []
for y in (2022, 2023, 2024):
    for name in (f'play_by_play_{y}.csv.gz', f'pbp{y}.csv.gz'):
        p = os.path.join(src, name)
        if os.path.exists(p):
            frames.append(pd.read_csv(p, usecols=lambda c: c in cols, low_memory=False))
            break
    else:
        sys.exit(f'missing season {y}')
d = pd.concat(frames)
d = d[d.season_type == 'REG'].sort_values(['game_id', 'play_id']).reset_index(drop=True)

# Scoring events: (team that scored, class from that team's view).
d['score_team'] = None
d['score_kind'] = None
td = d.touchdown == 1
d.loc[td, 'score_team'] = d.loc[td, 'td_team']; d.loc[td, 'score_kind'] = 'td'
fg = d.field_goal_result == 'made'
d.loc[fg, 'score_team'] = d.loc[fg, 'posteam']; d.loc[fg, 'score_kind'] = 'fg'
sf = d.safety == 1
d.loc[sf, 'score_team'] = d.loc[sf, 'defteam']; d.loc[sf, 'score_kind'] = 'safety'

# Next score in the same game and half, looking from each play forward (the play itself included).
nxt_team = [None] * len(d); nxt_kind = [None] * len(d)
for (_, _), g in d.groupby(['game_id', 'game_half'], sort=False):
    team = None; kind = None
    for i in reversed(g.index):
        if isinstance(d.at[i, 'score_kind'], str):
            team, kind = d.at[i, 'score_team'], d.at[i, 'score_kind']
        nxt_team[i], nxt_kind[i] = team, kind
d['nxt_team'] = nxt_team; d['nxt_kind'] = nxt_kind
CLASS = {('td', True): 0, ('fg', True): 1, ('safety', True): 2, (None, None): 3, ('safety', False): 4, ('fg', False): 5, ('td', False): 6}
def cls(r):
    if not isinstance(r.nxt_kind, str): return 3
    return CLASS[(r.nxt_kind, r.nxt_team == r.posteam)]

# Tries (N2.2.1 rule 2: a touchdown is worth 6 plus the average try).
xp = d[d.extra_point_attempt == 1]; tp = d[d.two_point_attempt == 1]
xp_pts = (xp.extra_point_result == 'good').sum(); tp_pts = 2 * (tp.two_point_conv_result == 'success').sum()
print(f'tries: {len(xp)} kicks good {xp_pts}, {len(tp)} two-point good {tp_pts // 2}; average try points {(xp_pts + tp_pts) / (len(xp) + len(tp)):.4f}')
import json
tries = {}
for y in (2022, 2023, 2024):
    a = xp[xp.season == y]; b = tp[tp.season == y]
    tries[str(y)] = {'kicks': int(len(a)), 'kicksGood': int((a.extra_point_result == 'good').sum()),
                     'twoPoint': int(len(b)), 'twoPointGood': int((b.two_point_conv_result == 'success').sum())}
json.dump(tries, open(out + '.tries.json', 'w'), indent=1)

keep = d[d.posteam.notna() & d.posteam.ne('') & (d.extra_point_attempt != 1) & (d.two_point_attempt != 1)
         & d.play_type.isin(['pass', 'run', 'punt', 'field_goal', 'qb_kneel', 'qb_spike', 'no_play', 'kickoff'])].copy()
keep['kickoff'] = (keep.play_type == 'kickoff') | (keep.kickoff_attempt == 1)
keep = keep[keep.kickoff | keep.down.notna()]
keep['cls'] = keep.apply(cls, axis=1)
home = keep.posteam == keep.home_team
keep['home'] = home.astype(int)
margin = np.where(home, keep.result, -keep.result)
keep['won'] = np.where(margin > 0, 1.0, np.where(margin < 0, 0.0, 0.5))
keep['spread'] = np.where(home, keep.spread_line, -keep.spread_line)
# home_opening_kickoff = 1: the home team kicked off first, so it receives the second-half kickoff.
keep['rec2h'] = np.where(home, keep.home_opening_kickoff, 1 - keep.home_opening_kickoff).astype(int)
keep['ot'] = (keep.game_half == 'Overtime').astype(int)
keep['half'] = np.where(keep.game_half == 'Half1', 1, np.where(keep.game_half == 'Half2', 2, 3))
keep['down'] = keep.down.fillna(0).astype(int)
keep['ydstogo'] = keep.ydstogo.fillna(0)
o = keep[['season', 'game_id', 'play_id', 'qtr', 'half', 'ot', 'game_seconds_remaining', 'half_seconds_remaining', 'down',
          'ydstogo', 'yardline_100', 'posteam_timeouts_remaining', 'defteam_timeouts_remaining', 'score_differential',
          'home', 'rec2h', 'spread', 'kickoff', 'cls', 'won', 'ep', 'wp', 'play_type']].dropna(
    subset=['game_seconds_remaining', 'half_seconds_remaining', 'yardline_100', 'score_differential', 'spread',
            'posteam_timeouts_remaining', 'defteam_timeouts_remaining'])
o['kickoff'] = o.kickoff.astype(int)
o.to_csv(out, index=False, float_format='%.6g')
print(f'rows {len(o)} games {o.game_id.nunique()} written to {out}')
