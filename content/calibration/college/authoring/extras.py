# G-41: the three T12 rows WP-13 did not load. Run from the repo root after coverage.py's lib is importable.
import json, sys
sys.path.insert(0, 'content/calibration/authoring')
from lib import SRC, compute_status, REL, POIS
D = '2026-11-26'
def fact(n, stmt, value, unit, key, locator, seasons='2022-2025'):
    s = dict(SRC[key]); s['primary'] = False; s['value'] = value; s['locator'] = locator
    row = dict(id='F-college-targets-%04d' % n, level='college', domain='measured-rate', statement=stmt, value=value, unit=unit, validFor=seasons, sources=[s])
    row['status'] = compute_status(row); row['usedBy'] = []
    row['statusHistory'] = [dict(date=D, status=row['status'], reason='G-41: row printed in T12 but not loaded by WP-13. Value re-read from the project script output on 2026-11-26; no outside page opened.')]
    return row
F = [
 fact(1, 'Share of FBS team-seasons that were unbeaten in FBS-against-FBS regular-season games: 8 of 531 (college, 2022-2025).', round(8/531, 4), 'share', 'cfbs',
      'research/college/results/college_game_shape_2022_2025.txt line 35 (unbeaten 8, n 531); research/college/college_game_shape.py line 59'),
 fact(2, 'Share of FBS team-seasons that were winless in FBS-against-FBS regular-season games: 2 of 531 (college, 2022-2025).', round(2/531, 4), 'share', 'cfbs',
      'research/college/results/college_game_shape_2022_2025.txt line 35 (winless 2, n 531); research/college/college_game_shape.py line 59'),
 fact(3, 'Points per drive, offense only: 2.1756 (college, 2022-2025).', 2.1756, 'points', 'cfb',
      'research/college/results/college_vs_nfl_baselines_T.csv row points_per_drive, column FBS 2022-2025; research/college/college_baselines.py line 93'),
]
json.dump(dict(domain='measured-rate', rows=F), open('facts/college-targets.json', 'w'), indent=1)
common = dict(ruleSetId='college_2026', unit='share', value=None, tolerance=POIS, tier='watch', ruleSetDependent=False, kind='rate')
T = [
 dict(common, id='spread.unbeatenShare', leaf='T12.2.1', layer='season', quantity='Unbeaten FBS regular seasons, share of team-seasons', filter='none', value=F[0]['value'], n=531, seasons='2022-2025', factId=F[0]['id'],
      definition='FBS team-seasons with no loss in FBS-against-FBS regular-season games, over all 531 team-seasons. T12.2.1 prints 8 in four seasons. Season-level row: needs league mode with team ratings.',
      note='A count of 8; judged by the Poisson rule, so the band is wide. Pro has no comparable row.'),
 dict(common, id='spread.winlessShare', leaf='T12.2.1', layer='season', quantity='Winless FBS regular seasons, share of team-seasons', filter='none', value=F[1]['value'], n=531, seasons='2022-2025', factId=F[1]['id'],
      definition='FBS team-seasons with no win in FBS-against-FBS regular-season games, over all 531 team-seasons. T12.2.1 prints 2 in four seasons.',
      note='A count of 2; the band is wide. Pro has no comparable row.'),
 dict(common, id='drive.pointsPerDrive', leaf='T12.5.1', layer='game', quantity='Points per drive, offense only', unit='points', filter='none', value=F[2]['value'], n=2998, seasons='2022-2025', factId=F[2]['id'], tolerance=REL(0.04),
      definition='Points scored by the offense on a drive (touchdown, field goal, safety conceded excluded) over drives. T12.5.1 prints 2.18; the script value is 2.1756. Power tier 2.2988, other tier 2.0438 (by the offense\'s conference).',
      note='The pro column in T12.5.1 says not comparable (pro value from the same script 2.0382 is not used). Filter is none until the drive measure exists in the harness.'),
]
json.dump(dict(ruleSetId='college_2026', version=1, source='G-41', targets=T), open('content/calibration/college/extra-targets.json', 'w'), indent=1)
