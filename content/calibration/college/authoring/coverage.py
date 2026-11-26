# G-41: builds content/calibration/college/coverage.json and facts/college-targets.json.
# Run from the repo root: python3 content/calibration/college/authoring/coverage.py <path to T12 bible file>
# Every T12 table row is mapped to a target id in content/calibration/targets.college_2026.json (WP-13) or to a G-41 row
# in content/calibration/college/extra-targets.json. The pro column is kept only so a test can prove no college value equals it.
import json, re, sys, copy
sys.path.insert(0, 'content/calibration/authoring')
from lib import SRC, compute_status, LOAD_DATE

T12 = sys.argv[1] if len(sys.argv) > 1 else '/mnt/project-files/bible/T-college-football/T12-college-calibration-targets.md'
targets = {t['id']: t for t in json.load(open('content/calibration/targets.college_2026.json'))['targets']}

MAP = {  # (leaf, label) -> target id
 ('T12.1.1','Points per team per game'):'score.pointsPerTeam', ('T12.1.1','Total points'):'score.totalPoints',
 ('T12.1.1','Scrimmage plays per team'):'game.playsPerTeam', ('T12.1.1','Drives per team'):'drive.perTeam', ('T12.1.1','Tied games'):'result.ties',
 ('T12.2.1','Decided by 3 or fewer'):'result.marginLe3', ('T12.2.1','Decided by 8 or fewer'):'result.marginLe8',
 ('T12.2.1','Decided by 17 or more'):'result.marginGe17', ('T12.2.1','Decided by 28 or more'):'result.marginGe28',
 ('T12.2.1','Mean absolute margin'):'result.meanAbsMargin', ('T12.2.1','Home win share (non-neutral)'):'result.homeWinShare',
 ('T12.2.1','Home margin, raw'):'score.homeMargin', ('T12.2.1','Home win share, conference games only'):'result.homeWinShare.conference',
 ('T12.2.1','Home edge with team strength removed'):'spread.homeFieldRatingAdj', ('T12.2.1','Standard deviation of team rating'):'spread.teamRatingSd',
 ('T12.2.1','Standard deviation of team win share'):'spread.teamWinPctSd', ('T12.2.1','Team-seasons with 6 or more wins'):'spread.share6PlusWins',
 ('T12.2.1','Team-seasons with 10 or more wins'):'spread.share10PlusWins', ('T12.2.1','Team-seasons with 2 or fewer wins'):'spread.share2OrFewerWins',
 ('T12.2.1','Unbeaten and winless regular seasons'):['spread.unbeatenShare','spread.winlessShare'],
 ('T12.3.1','Pass rate (dropbacks over plays)'):'pass.rate', ('T12.3.1','Completion share'):'pass.completionPct', ('T12.3.1','Yards per attempt'):'pass.yardsPerAttempt',
 ('T12.3.1','Touchdown per attempt'):'pass.tdRate', ('T12.3.1','Interception per attempt'):'pass.intRate', ('T12.3.1','Sack per dropback'):'pass.sackRate',
 ('T12.3.1','Yards per rush (sacks excluded)'):'rush.yardsPerCarry', ('T12.3.1','Rush touchdown rate'):'rush.tdRate',
 ('T12.3.1','Rushes of 10 or more yards'):'rush.explosive10Rate', ('T12.3.1','Third-down conversion'):'down.thirdConv',
 ('T12.4.1','Fourth-down go rate (go over go plus punt plus field goal try)'):'decision.fourthGoRate', ('T12.4.1','Go rate, 1 to 2 yards to go'):'decision.fourthGoRate.ytg1to2',
 ('T12.4.1','Go rate, 3 to 5'):'decision.fourthGoRate.ytg3to5', ('T12.4.1','Go rate, 6 or more'):'decision.fourthGoRate.ytg6plus',
 ('T12.4.1','Fourth-down conversion'):'down.fourthConv', ('T12.4.1','Punts per team per game'):'kick.puntsPerTeam',
 ('T12.4.1','Field goal tries per team per game'):'kick.fgAttPerTeam', ('T12.4.1','Field goal share made'):'kick.fgPct',
 ('T12.5.1','Plays per drive'):'drive.playsPerDrive', ('T12.5.1','Yards per drive'):'drive.yardsPerDrive', ('T12.5.1','Touchdown'):'drive.tdShare',
 ('T12.5.1','Field goal made'):'drive.fgShare', ('T12.5.1','Punt'):'drive.puntShare', ('T12.5.1','Turnover'):'drive.turnoverShare',
 ('T12.5.1','Turnover on downs'):'drive.downsShare', ('T12.5.1','Drives reaching the red zone'):'drive.redZoneShare',
 ('T12.5.1','Red-zone touchdown rate'):'drive.redZoneTdRate', ('T12.5.1','Red-zone scoring rate'):'drive.redZoneScoreRate',
 ('T12.5.1','Points per drive (offense only)'):'drive.pointsPerDrive',
 ('T12.6.1','Accepted fouls per team per game'):'foul.acceptedPerTeam', ('T12.6.1','Foul yards per team per game'):'foul.yardsPerTeam',
 ('T12.6.1','Yards per accepted foul'):'foul.yardsPerAccepted', ('T12.6.1','Fumbles lost per play'):'turnover.fumbleLostPerPlay',
}
GAP = ['gap0to3','gap3to7','gap7to10','gap10to14','gap14to21','gap21to28','gap28plus']
OPEN = ['personnelShares','tempoNoHuddleShare','qbRunOptionRpoShares','pressureRateTimeToThrow','conceptTargetDepth','coverageShares','kickingByDistance','targetingPerGame','injuryRates','overtimeShare','secondSubdivision']

leaf = None; header = None; gapn = 0; opn = 0; rows = []
for line in open(T12, encoding='utf-8'):
    m = re.match(r'### (T12\.\d\.\d)', line)
    if m: leaf = m.group(1); header = None; continue
    if not line.startswith('|'): header = None if not line.strip() else header; continue
    cells = [c.strip() for c in line.strip().strip('|').split('|')]
    if set(''.join(cells)) <= set('- '): continue
    if header is None: header = cells; continue
    rows.append((leaf, header, cells))

def num(s):
    m = re.match(r'-?\+?\d[\d,]*\.?\d*', s or '')
    return float(m.group(0).replace(',', '').replace('+', '')) if m else None

coverage = []
gi = {'T12.2.2': 0}; seen_h = {}
for leaf, header, cells in rows:
    label = cells[0]; cols = dict(zip(header, cells))
    if leaf == 'T12.2.2':
        key = 'upset.' + ('ratingGap' if header[2:3] == ['Favourite wins'] and 'mean margin' in header[-1] else 'priorGap')
        i = GAP.index if False else None
        n = seen_h.setdefault(key, 0); seen_h[key] += 1
        suffix = GAP[n] if key.endswith('ratingGap') else ['gap0to3','gap3to7','gap7to10','gap10to14','gap14to21','gap21plus'][n]
        tid = f'{key}.{suffix}'
    elif leaf == 'T12.7.1':
        tid = 'open.' + OPEN[seen_h.setdefault('open', 0)]; seen_h['open'] += 1
    else:
        tid = MAP.get((leaf, label))
        if tid is None: sys.exit(f'unmapped T12 row: {leaf} | {label}')
    ids = tid if isinstance(tid, list) else [tid]
    pro = next((cols[h] for h in header if h.startswith('Pro')), '')
    coverage.append(dict(leaf=leaf, label=label, columns=cols, targetIds=ids, pro=pro or None,
                         power=cols.get('Power tier') or cols.get('Power'), other=cols.get('Other tier') or cols.get('Other')))

# tier-split bible rows (cross-tier win share) stay as WP-13 rows: tier.powerBeatsOther, tier.topSubBeatsLower (T12.2.2 text, no table)
json.dump(dict(source='bible/T-college-football/T12-college-calibration-targets.md', note='Every T12 table row mapped to a target id. The pro column is kept only so a test can prove no college value was copied from it (G-41).', rows=coverage),
          open('content/calibration/college/coverage.json', 'w'), indent=1)
print(len(coverage), 'rows')
