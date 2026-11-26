# College target rows (bible T12, college_2026) for content/calibration/targets.college_2026.json.
# Every row comes from bible/_sources/calibration.college_top.v1.json (the T12 record file) or from the T12
# tables themselves. No row is filled from a pro value (Q2.1.1). Fact ids continue after the pro rows.
import json, os
from lib import *

HERE = os.path.dirname(os.path.abspath(__file__))
SRC_FILE = '/mnt/project-files/bible/_sources/calibration.college_top.v1.json'


def build(start):
    b = Book('college', 'college_2026', start)
    rec = {r['id']: r for r in json.load(open(SRC_FILE))['targets']}
    used = set()
    PBP = 'cfbfastR play-by-play, FBS against FBS regular season 2022 to 2025, script research/college/college_baselines.py'
    SCH = 'ESPN college schedules, FBS against FBS regular season 2022 to 2025, script research/college/college_game_shape.py'

    def tol(r):
        return dict(type=r['tolerance']['type'], value=r['tolerance']['value'], low=None, high=None)

    def extras(r):
        out = []
        if 'bySeason' in r: out.append('By season ' + ', '.join('%s %s' % (k, v) for k, v in r['bySeason'].items()) + '.')
        if 'byTier' in r: out.append('Power tier %s, other tier %s (by the offense\'s conference).' % (r['byTier']['power'], r['byTier']['other']))
        if 'proSameScript' in r: out.append('Pro value from the same script %s (shown for comparison only, never used as a college value).' % r['proSameScript'])
        return ' '.join(out) or None

    def R(rid, leaf, layer, kind, quantity, measure, definition, words='', expect='1 of 3', srcs=None, value=None, unit=None, tier=None, tolr=None, note=None, tid=None, n=None, seasons=None):
        r = rec[rid]
        used.add(rid)
        v = r['value'] if value is None else value
        src_key = 'cfb' if r['sources'][0].startswith('cfbfastR') else 'cfbs'
        base = PBP if src_key == 'cfb' else SCH
        b.T(tid or rid, leaf, layer, kind, quantity, unit or r['unit'], measure, definition + ' Source: ' + base + ', ' + r['definition'] + '.', v,
            srcs or [(src_key, '=')], expect, tier or r['tier'], n=n if n is not None else r.get('n'), seasons=seasons or r['seasons'],
            tol=tolr or tol(r), rsd=r['ruleSetDependent'], note=' '.join(x for x in [note, extras(r)] if x) or None, words=words)

    # ---------------- T12.1.1 scoring and volume ----------------
    L = 'T12.1.1'
    R('score.pointsPerTeam', L, 'game', 'mean', 'Points per team per game', 'game.pointsPerTeam', 'Final points of each team, mean over team games.',
      srcs=[('cfb', '='), ('cfbs', None, '26.68 over 2,976 games; scope differs slightly (2,976 against 2,998 games), so no value is attached')], expect='2 of 3',
      note='Published CBS figures (27.78 for 2023, 28.01 for 2024) cover all FBS games, a different scope; not counted as a source (T12 verification pass).')
    r = rec['score.pointsPerTeam']
    b.T('score.pointsPerTeam.sd', L, 'game', 'sd', 'Points per team per game, standard deviation', 'points', 'game.pointsPerTeam', 'Standard deviation over team games of final points. Source: ' + PBP + '.', r['sd'], [('cfb', '=')], '1 of 3', 'tune', n=r['n'], seasons=r['seasons'], tol=SD)
    R('score.totalPoints', L, 'game', 'mean', 'Total points per game, both teams', 'game.totalPoints', 'Sum of both final scores, mean over games.', note='Median 52.')
    r = rec['score.totalPoints']
    b.T('score.totalPoints.sd', L, 'game', 'sd', 'Total points per game, standard deviation', 'points', 'game.totalPoints', 'Standard deviation over games of total points. Source: ' + SCH + '.', r['sd'], [('cfbs', '=')], '1 of 3', 'tune', n=r['n'], seasons=r['seasons'], tol=SD)
    R('game.playsPerTeam', L, 'game', 'mean', 'Scrimmage plays per team per game', 'game.scrimmagePlaysPerTeam', 'Pass and run plays per team game; kneel-downs, spikes and no-play fouls excluded (T12.3.1 definitions).',
      note='Rule-set dependent: the drop after 2022 matches the 2023 clock change (B13), so tune against 2023 to 2025 (65.7) under the 2026 rule set.')
    R('drive.perTeam', L, 'game', 'mean', 'Drives per team per game', 'drive.perTeamGame', 'Drives per team game as numbered in the play-by-play.')
    R('result.ties', L, 'game', 'rate', 'Games that end tied', 'game.tie', 'Tied final scores over all games. College overtime is played to a result, so the expected count is zero.', tolr=BAND(0, 0), note='T12.1.1 tolerance is "exact".')

    # ---------------- T12.2.1 margins and the spread of team strength ----------------
    L = 'T12.2.1'
    for rid, m, q in [('result.marginLe3', 'game.marginAtMost(3)', 'Games decided by 3 points or fewer'), ('result.marginLe8', 'game.marginAtMost(8)', 'Games decided by 8 points or fewer'),
                      ('result.marginGe17', 'game.marginAtLeast(17)', 'Games decided by 17 points or more'), ('result.marginGe28', 'game.marginAtLeast(28)', 'Games decided by 28 points or more')]:
        R(rid, L, 'game', 'rate', q, m, 'Absolute final margin, share of games.')
    R('result.meanAbsMargin', L, 'game', 'mean', 'Mean absolute final margin', 'game.absMargin', 'Absolute final margin, mean over games.', note='Median 14.')
    R('result.homeWinShare', L, 'game', 'rate', 'Home win share, non-neutral games', 'game.homeWin', 'Home wins over games played at a home site; neutral-site games (2.5%) excluded (T12.2.1 edge case).',
      note='The game summary has no neutral-site field, so the simulated value counts every game until one is added. Tune the venue effect against the conference-only and strength-removed rows, never this raw row.')
    r = rec['result.homeWinShare']
    b.T('result.homeWinShare.conference', L, 'game', 'rate', 'Home win share, conference games only', 'share', 'none', 'Home wins over conference games at a home site. Not measurable yet: the game summary has no conference field. Source: ' + SCH + '.', r['conferenceGamesOnly'], [('cfbs', '=')], '1 of 3', 'tune', n=None, seasons=r['seasons'], tol=REL(0.04))
    R('score.homeMargin', L, 'game', 'mean', 'Home margin, raw', 'game.homeMargin', 'Home final score minus visitor final score, mean over non-neutral games.',
      note='Inflated because stronger teams host more non-conference games (non-conference margin 10.13). Neutral-site games are not separated in the simulated summary yet.')
    r = rec['score.homeMargin']
    b.T('score.homeMargin.sd', L, 'game', 'sd', 'Home margin, standard deviation', 'points', 'game.homeMargin', 'Standard deviation of the home margin over non-neutral games. Source: ' + SCH + '.', r['sd'], [('cfbs', '=')], '1 of 3', 'tune', n=r['n_nonNeutral'], seasons=r['seasons'], tol=SD)
    b.T('score.homeMargin.conference', L, 'game', 'mean', 'Home margin, conference games only', 'points', 'none', 'Home margin over conference games. Not measurable yet: the game summary has no conference field. Source: ' + SCH + '.', r['conferenceGamesOnly'], [('cfbs', '=')], '1 of 3', 'tune', seasons=r['seasons'], tol=REL(0.25))
    NR = ' Season-level row: needs league mode with team ratings, which the harness does not have yet.'
    R('spread.homeFieldRatingAdj', L, 'season', 'mean', 'Home edge with team strength removed', 'none', 'Home term of a least-squares team rating on margins capped at 28, light ridge penalty, one season at a time.' + NR)
    R('spread.teamRatingSd', L, 'season', 'sd', 'Standard deviation of team rating', 'none', 'Standard deviation of the same team ratings (home term removed).' + NR, tolr=BAND(8.5, 10.0), note='T12.2.1 acceptance band 8.5 to 10.0.')
    r = rec['spread.teamWinPctSd']
    R('spread.teamWinPctSd', L, 'season', 'sd', 'Standard deviation of team win share', 'none', 'Standard deviation of regular-season win share over team-seasons.' + NR, n=r['n_teamSeasons'])
    for rid, q in [('spread.share6PlusWins', 'Team-seasons with 6 or more wins'), ('spread.share10PlusWins', 'Team-seasons with 10 or more wins'), ('spread.share2OrFewerWins', 'Team-seasons with 2 or fewer wins')]:
        R(rid, L, 'season', 'rate', q, 'none', 'Share of team-seasons, FBS against FBS games only.' + NR)

    R('schedule.conferenceGameShare', L, 'season', 'rate', 'Conference games, share of FBS against FBS games', 'none', 'Schedule shape, not an engine outcome: it checks the generated schedule (T3).' + NR)
    R('schedule.neutralShare', L, 'season', 'rate', 'Neutral-site games, share of FBS against FBS games', 'none', 'Schedule shape, not an engine outcome: it checks the generated schedule (T3). T12.2.1 edge case: 2.5% of games.' + NR)

    # ---------------- T12.2.2 upsets by strength gap ----------------
    L = 'T12.2.2'
    for rid, key, q in [('upset.favoriteWinByRatingGap', 'ratingGap', 'Favourite win share by same-season rating gap'), ('upset.favoriteWinByPriorSeasonGap', 'priorGap', 'Favourite win share by prior-season rating gap')]:
        r = rec[rid]
        used.add(rid)
        for bn in r['bins']:
            hi = bn['gapTo']
            tag = '%sto%s' % (bn['gapFrom'], hi) if hi is not None else '%splus' % bn['gapFrom']
            b.T('upset.%s.gap%s' % (key, tag), L, 'season', 'rate', '%s, gap %s to %s points' % (q, bn['gapFrom'], hi if hi is not None else 'more'), 'share', 'none',
                r['definition'] + '. Favourite win share in the bin. Source: ' + SCH + '.' + NR, bn['favoriteWin'], [('cfbs', '=')], '1 of 3', r['tier'], n=bn['n'], seasons=r['seasons'],
                tol=POIS if bn['favoriteWin'] >= 0.99 else tol(r), note=('Residual SD %s.' % r['residualSd']) if 'residualSd' in r else None)
    for rid, q in [('tier.powerBeatsOther', 'Power-tier teams beat other top-subdivision teams'), ('tier.topSubBeatsLower', 'Top-subdivision teams beat lower-subdivision teams')]:
        R(rid, L, 'season', 'rate', q, 'none', 'Win share of the stronger tier in cross-tier games.' + NR)

    # ---------------- T12.3.1 efficiency ----------------
    L = 'T12.3.1'
    R('pass.rate', L, 'decision_rate', 'rate', 'Pass rate, dropbacks over plays', 'situation.dropbackShare', 'Dropbacks (attempts, sacks and scrambles) over pass and run plays.')
    R('pass.completionPct', L, 'play', 'rate', 'Completion share', 'pass.completionPct', 'Completions over attempts.', note='CBS 61.4% for 2024 is a different scope (all FBS games); not counted as a source.')
    R('pass.yardsPerAttempt', L, 'play', 'mean', 'Yards per attempt', 'pass.yardsPerAttempt', 'Passing yards over attempts.')
    R('pass.tdRate', L, 'play', 'rate', 'Touchdown per attempt', 'pass.touchdownPerAttempt', 'Passing touchdowns over attempts.')
    R('pass.intRate', L, 'play', 'rate', 'Interception per attempt', 'pass.interceptionPerAttempt', 'Interceptions over attempts.')
    R('pass.sackRate', L, 'play', 'rate', 'Sack per dropback', 'pass.sackRate', 'Read as sacks over attempts plus sacks: the pro value from the same script (6.90%) equals the pro rate on that base (6.91%), so the script label "per dropback" is taken to mean attempts plus sacks. Inferred, not confirmed from the script.')
    R('rush.yardsPerCarry', L, 'play', 'mean', 'Yards per rush, sacks excluded', 'rush.yardsPerCarry', 'Run plays with sacks excluded (scrambles in, kneel-downs out). Official college statistics count sacks as rushes, so published averages are lower (4.54 recomputed for 2024 with sacks in).')
    R('rush.tdRate', L, 'play', 'rate', 'Rush touchdown rate', 'rush.touchdownPerCarry', 'Rushing touchdowns over carries, same carry definition as yards per rush.')
    R('rush.explosive10Rate', L, 'play', 'rate', 'Rushes of 10 or more yards', 'rush.gainAtLeastShare(10)', 'Carries gaining 10 or more yards over carries.')
    R('down.thirdConv', L, 'play', 'rate', 'Third-down conversion', 'situation.thirdDownConversion', 'Third downs converted over third-down pass and run plays.')

    # ---------------- T12.4.1 fourth down, punts, field goals ----------------
    L = 'T12.4.1'
    R('decision.fourthGoRate', L, 'decision_rate', 'rate', 'Fourth-down go rate', 'situation.fourthDown.share(go)', 'Go over go plus punt plus field goal try.', note='Rising by season; tune AI coaches to the save\'s era (B12).')
    for rid, args, q in [('decision.fourthGoRate.ytg1to2', '1,2', '1 to 2'), ('decision.fourthGoRate.ytg3to5', '3,5', '3 to 5'), ('decision.fourthGoRate.ytg6plus', '6,99', '6 or more')]:
        R(rid, L, 'decision_rate', 'rate', 'Fourth-down go rate, %s yards to go' % q, 'situation.fourthDown.goRate(%s)' % args, 'Go share of fourth downs in the yards-to-go bin (yards to go as a whole number, inches counted as 1).')
    R('down.fourthConv', L, 'play', 'rate', 'Fourth-down conversion', 'situation.fourthDownConversion', 'First down gained on fourth-down pass and run plays.')
    R('kick.puntsPerTeam', L, 'game', 'mean', 'Punts per team per game', 'game.puntsPerTeam', 'Punts per team game.')
    R('kick.fgAttPerTeam', L, 'game', 'mean', 'Field goal tries per team per game', 'game.fieldGoalAttemptsPerTeam', 'Field goal tries per team game.')
    R('kick.fgPct', L, 'play', 'rate', 'Field goal share made', 'kick.fieldGoalPct(0,99)', 'Field goals made over tries, all distances.')
    R('kick.kickoffTouchbackRate', L, 'play', 'rate', 'Kickoff touchback rate', 'none', 'Touchbacks over kickoffs. Not measurable yet: the play-by-play row has no kickoff result field.', tier='watch',
      note='T12.4.1 prints status Conflict: the one source disagrees with itself across seasons (75%, 61%, 77%, 66%, a likely data fault). The register computes 1 of 3 because only one source exists; the row is watch tier either way.')

    # ---------------- T12.5.1 drives ----------------
    L = 'T12.5.1'
    R('drive.playsPerDrive', L, 'game', 'mean', 'Plays per drive', 'drive.plays', 'Plays per drive.')
    R('drive.yardsPerDrive', L, 'game', 'mean', 'Yards per drive', 'drive.yards', 'Net yards per drive.')
    R('drive.secondsPerDrive', L, 'game', 'mean', 'Seconds per drive', 'drive.seconds', 'Game-clock seconds per drive.', note='Watch only: the source\'s drive clock is faulty in some games (T12.5.1).')
    for rid, key, q in [('drive.tdShare', 'touchdown', 'touchdown'), ('drive.fgShare', 'field_goal', 'field goal made'), ('drive.puntShare', 'punt', 'punt'), ('drive.turnoverShare', 'turnover', 'turnover'), ('drive.downsShare', 'downs', 'turnover on downs')]:
        R(rid, L, 'game', 'rate', 'Drives ending in: ' + q, 'drive.result(%s)' % key, 'Share of drives with this result.')
    R('drive.redZoneShare', L, 'game', 'rate', 'Drives reaching the red zone', 'drive.redZoneShare', 'Share of drives with a snap 20 or fewer yards from the goal.')
    R('drive.redZoneTdRate', L, 'game', 'rate', 'Red-zone touchdown rate', 'drive.redZoneResult(touchdown)', 'Touchdown drives over drives that reached the red zone.')
    R('drive.redZoneScoreRate', L, 'game', 'rate', 'Red-zone scoring rate', 'drive.redZoneResult(touchdown+field_goal)', 'Touchdown or field goal drives over drives that reached the red zone.')
    R('game.topSdBetweenTeamsMin', L, 'game', 'sd', 'Spread in possession time between teams', 'none', 'Between-team standard deviation of time of possession, minutes. The script definition is not restated in T12; not measured until it is.', note='T12.5.1: usable although the drive clock is faulty in some games.')

    # ---------------- T12.6.1 fouls and fumbles ----------------
    L = 'T12.6.1'
    R('foul.acceptedPerTeam', L, 'game', 'mean', 'Accepted fouls per team per game', 'game.penaltiesAcceptedPerTeam', 'Accepted penalties per team game.', note='College teams are flagged less in this data; may be how fouls are recorded in the source. Tune with a wide band until a second source agrees.')
    R('foul.yardsPerTeam', L, 'game', 'mean', 'Foul yards per team per game', 'game.penaltyYardsPerTeam', 'Yards of accepted penalties per team game.')
    a, y = rec['foul.acceptedPerTeam'], rec['foul.yardsPerTeam']
    b.T('foul.yardsPerAccepted', L, 'game', 'mean', 'Yards per accepted foul', 'yards', 'game.yardsPerPenalty', 'Yards of accepted penalties over accepted penalties (T12.6.1 table; equals the two rows above divided, %s / %s). Source: %s.' % (y['value'], a['value'], PBP), 8.25,
          [('cfb', '=', 'T12.6.1 table')], '1 of 3', 'watch', n=a['n'], seasons=a['seasons'], tol=REL(0.1))
    R('turnover.fumbleLostPerPlay', L, 'play', 'rate', 'Fumbles lost per play', 'play.fumbleLostPerPlay', 'Fumbles lost over pass and run plays.')

    # ---------------- T12.7.1 open rows (no college measurement; never filled from a pro value) ----------------
    L = 'T12.7.1'
    for tid, kind, q, unit, until in [
        ('open.personnelShares', 'rate', 'Personnel grouping shares (F1)', 'share', 'T10.5.1 Assumption'),
        ('open.tempoNoHuddleShare', 'rate', 'Tempo and no-huddle share (F3)', 'share', 'T10.5.1 Assumption'),
        ('open.qbRunOptionRpoShares', 'rate', 'Quarterback run, option and run-pass option shares (F4, F7)', 'share', 'T10.5.1 Assumption'),
        ('open.pressureRateTimeToThrow', 'rate', 'Pressure rate and time to throw (F5)', 'share', 'pro shape from J15.4.2, scaled so the sack rate lands at 6.0%'),
        ('open.conceptTargetDepth', 'quantiles', 'Concept and target-depth distributions (F6)', 'yards', 'pro shape, system priors from T10.2.1'),
        ('open.coverageShares', 'rate', 'Coverage shares (F10)', 'share', 'T10.3.1 Assumption'),
        ('open.kickingByDistance', 'rate', 'Field goals by distance, kickoff results, punt net (F12, B13.6)', 'share', 'pro curve shape, college ability distribution'),
        ('open.targetingPerGame', 'mean', 'Targeting fouls per game (B13.9)', 'count', 'starting value 0.2 per game, Assumption'),
        ('open.injuryRates', 'rate', 'Injury rates (J15.7.2)', 'share', 'pro rates, D11'),
        ('open.overtimeShare', 'rate', 'Overtime share (J15.2.1)', 'share', 'pro value as a placeholder, marked Unverified'),
        ('open.secondSubdivision', 'rate', 'Second-subdivision baselines (T2)', 'share', 'top-subdivision values with the other-tier column'),
    ]:
        b.missing(tid, L, 'game', kind, q, unit, 'Not measured for college. Until measured the engine uses: %s (a prior, never a target value). Missing source.' % until)

    left = set(rec) - used
    assert not left, left
    return b


if __name__ == '__main__':
    import pro
    root = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
    c = build(len(pro.b.facts))
    json.dump({'ruleSetId': 'pro_2026', 'version': '1', 'targets': pro.b.targets}, open(os.path.join(HERE, '..', 'targets.pro_2026.json'), 'w'), indent=1)
    json.dump({'ruleSetId': 'college_2026', 'version': '1', 'targets': c.targets}, open(os.path.join(HERE, '..', 'targets.college_2026.json'), 'w'), indent=1)
    json.dump({'domain': 'measured-rate', 'rows': pro.b.facts + c.facts}, open(os.path.join(root, 'facts', 'measured-rate.json'), 'w'), indent=1)
    print('pro', len(pro.b.targets), 'college', len(c.targets), 'facts', len(pro.b.facts) + len(c.facts))
