# Authoring helper for content/calibration/targets.*.json and facts/measured-rate.json (WP-13).
# The JSON files are the source of truth once written; this script only saved typing on first load.
import json

LOAD_DATE = '2026-11-26'
V = 'docs/verify'  # shorthand

SRC = {
 'nv': dict(citation='nflverse play-by-play, regular seasons 2022 to 2024 (815 games), github.com/nflverse/nflverse-data releases; computed by the project', locator='research/nflverse_baselines.py; recomputed in research/audit-r-calibration-verify.md', dateRead='2026-11-25', howRead='dataset computed', independenceGroup='nflverse'),
 'nv25': dict(citation='nflverse play-by-play, 2025 season kickoffs; computed by the project', locator='bible J15.6.1 rules text (dated 2026-11-26)', dateRead='2026-11-26', howRead='dataset computed', independenceGroup='nflverse'),
 'of': dict(citation='footballdb.com and NFL.com team statistics, 2022 to 2024 (identical on 96 of 96 team rows; counted as one source)', locator='nfl-league-totals-2022-2024-crosscheck.md; research/audit-r-calibration-verify.md', dateRead='2026-11-25', howRead='dataset computed', independenceGroup='nfl-official-team-totals'),
 'espn': dict(citation='ESPN scoreboard, every regular-season game 2022 to 2024 (nfl-game-results-2022-2024-espn.csv)', locator='nfl-league-totals-2022-2024-crosscheck.md, game-level table', dateRead='2026-11-25', howRead='dataset computed', independenceGroup='espn-scoreboard'),
 'pfr': dict(citation='Pro-Football-Reference season penalty pages, 2022 and 2023', locator='research/audit-r-calibration-verify.md section 6', dateRead='2026-11-25', howRead='secondary summary', independenceGroup='pro-football-reference'),
 'cbs': dict(citation='CBS Sports kicking article dated 2024-11-18 (page cut at about 40k characters; figures are a summary)', locator='research/audit-r-calibration-verify.md section 5', dateRead='2026-11-25', howRead='secondary summary', independenceGroup='cbs-sports'),
 'wis': dict(citation='Wisconsin analytics season recap (fourth downs, two-point tries, kickoff returns)', locator='research/audit-r-calibration-verify.md sections 2 and 5; research/injuries-and-calibration.md section 4', dateRead='2026-11-25', howRead='secondary summary', independenceGroup='wisconsin-recap'),
 'fox': dict(citation='Fox Sports 2024 season recap (fourth downs, punts)', locator='research/audit-r-calibration-verify.md sections 2 and 5', dateRead='2026-11-25', howRead='secondary summary', independenceGroup='fox-sports'),
 'pff13': dict(citation='PFF, "Pass Rushing: Bringing Numbers", 2013 season, league-wide by number of rushers', locator='research/injuries-and-calibration.md section 5', dateRead='2026-11-25', howRead='secondary summary', independenceGroup='pff-2013-season'),
 'pff14': dict(citation='PFF 2014 team table, pressure and sack rate with and without a blitz', locator='research/injuries-and-calibration.md section 5', dateRead='2026-11-25', howRead='secondary summary', independenceGroup='pff-2014-season'),
 'tm': dict(citation='The 33rd Team, league pressure rate 2023 (TruMedia)', locator='research/injuries-and-calibration.md section 5; research/audit-r-calibration-verify.md section 4', dateRead='2026-11-25', howRead='secondary summary', independenceGroup='trumedia'),
 'ngs': dict(citation='NFL.com Next Gen Stats article, 2023 team pressure rates (Chiefs 36.7%, 49ers 38.5%)', locator='research/audit-r-calibration-verify.md section 4', dateRead='2026-11-25', howRead='secondary summary', independenceGroup='next-gen-stats'),
 'pff24n': dict(citation='PFF, neutral-situation pass rate 2024 (article dated 2026-06-03)', locator='bible J15.3.2 Football facts used', dateRead='2026-11-25', howRead='secondary summary', independenceGroup='pff-neutral-pass-rate'),
 'cov': dict(citation='Covers, total points by wind speed, 2010 to 2025 (2,720 games)', locator='research/injuries-and-calibration.md section 4', dateRead='2026-11-25', howRead='secondary summary', independenceGroup='covers'),
 'dd': dict(citation='Design doc measurement set, 1,466 games, 2021 to 2026; computed by the project', locator='bible J15.2.1 table, second column; design doc sections 10 and 18', dateRead='2026-11-25', howRead='dataset computed', independenceGroup='design-doc-game-set'),
 'old': dict(citation='sportsbookreview forum (about 13 to 13.9) and Football Perspective 1978 to 2016 (about 13.0); weak and old', locator='research/injuries-and-calibration.md section 4', dateRead='2026-11-25', howRead='secondary summary', independenceGroup='spread-residual-outside'),
 'lr': dict(citation='Project long-run file (multi-era league rates); computed by the project', locator='bible J15.3.2, J15.4.1 and J15.7.1 era notes; research/football-sim-engine-research.md', dateRead='2026-11-25', howRead='dataset computed', independenceGroup='long-run-file'),
 'aud': dict(citation='Project audit computation of pre-snap fouls (nflverse, eleven seasons)', locator='research/improvement-audit.md Part 11.1; research/analysis_discipline_spread.py', dateRead='2026-11-25', howRead='dataset computed', independenceGroup='project-audit-11-1'),
 'inj': dict(citation='nflverse injury reports and snap counts, 2012 to 2025; computed by the project', locator='bible J15.7.2; research/injuries-and-calibration.md', dateRead='2026-11-25', howRead='dataset computed', independenceGroup='nflverse-injury-reports'),
 'fbg': dict(citation='Footballguys, game-status designations 2017 to 2024 (skill positions only)', locator='bible J15.7.2 Football facts used; research/injuries-and-calibration.md', dateRead='2026-11-25', howRead='secondary summary', independenceGroup='footballguys'),
 'ajsm': dict(citation='American Journal of Sports Medicine 2021, ACL tears in the NFL 2015 to 2019', locator='bible J15.7.2 edge cases', dateRead='2026-11-25', howRead='secondary summary', independenceGroup='ajsm-2021-acl'),
 'sh': dict(citation='Sports Health 2024, stingers in the NFL', locator='bible J15.7.2 edge cases', dateRead='2026-11-25', howRead='secondary summary', independenceGroup='sports-health-2024-stingers'),
 'goff': dict(citation='Goff et al. (2019), found only as a citation inside Farnell et al. (2021)', locator='research/audit-r-grading-coach-effect.md R15', dateRead='2026-11-25', howRead='secondary summary', independenceGroup='goff-2019'),
 'bf': dict(citation='Berry and Fowler (2019), one study reported by three outlets', locator='research/audit-r-grading-coach-effect.md; bible Q2.5.1', dateRead='2026-11-25', howRead='secondary summary', independenceGroup='berry-fowler-2019'),
 'pa': dict(citation='Project analysis of play action and prior run success (nflverse); computed by the project', locator='research/audit-r-pa-definitions.md; bible F7.1.2', dateRead='2026-11-25', howRead='dataset computed', independenceGroup='project-pa-analysis'),
 'pffttt': dict(citation='PFF, league average time to throw 2.86 s for 2025, "has increased every season since 2020"', locator='bible J15.4.1 Football facts used (pff.com, read 2026-11-26)', dateRead='2026-11-26', howRead='secondary summary', independenceGroup='pff-time-to-throw'),
 'cfb': dict(citation='cfbfastR play-by-play (sportsdataverse-data releases), FBS against FBS regular season 2022 to 2025; computed by the project', locator='bible/_sources/calibration.college_top.v1.json; research/college/college_baselines.py', dateRead='2026-11-25', howRead='dataset computed', independenceGroup='cfbfastr-pbp'),
 'cfbs': dict(citation='ESPN college schedules (sportsdataverse-data releases), FBS against FBS regular season 2022 to 2025; computed by the project', locator='bible/_sources/calibration.college_top.v1.json; research/college/college_game_shape.py', dateRead='2026-11-25', howRead='dataset computed', independenceGroup='espn-cfb-schedules'),
}

REL = lambda v: dict(type='rel', value=v, low=None, high=None)
CORE = REL(0.03)       # Q2.3.1 rates and means; J15.1.2 core rates (Assumption)
RARE = REL(0.10)       # J15.1.2 rare-event rates (Assumption)
SD = REL(0.05)         # J15.1.2 standard deviations (Assumption)
QUANT = dict(type='rel', value=0.03, low=0.5, high=None)  # Q2.3.1: 3% relative or 0.5 yd, whichever is larger
POIS = dict(type='poisson', value=0.10, low=None, high=None)  # Q2.3.1 rate under 1%: by count; floor from J15.1.2 rare events
ORDER = dict(type='band', value=0.95, low=0.95, high=1)       # Q2.3.1: order holds in at least 95% of seed groups
BAND = lambda lo, hi: dict(type='band', value=0, low=lo, high=hi)

def compute_status(row):
    if row.get('assumption'): return 'Assumption'
    read = [s for s in row['sources'] if s['howRead'] != 'model knowledge']
    if not read: return 'Unverified'
    if 'value' in row and any(('value' in s and s['value'] != row['value']) for s in read): return 'Conflict'
    groups = {s['independenceGroup'] for s in read}
    if len(groups) >= 3: return 'Verified'
    if len(groups) == 2: return '2 of 3'
    return '1 of 3'

class Book:
    def __init__(self, level, rule_set, start):
        self.level, self.rule_set = level, rule_set
        self.facts, self.targets, self.n = [], [], start
        self.ids = set()

    def fact(self, statement, value, unit, srcs, seasons, notes=None, assumption=False, domain='measured-rate'):
        self.n += 1
        fid = 'F-measured-rate-%04d' % self.n
        sources = []
        for s in srcs:
            key, val, extra = (s + (None, None))[:3] if isinstance(s, tuple) else (s, None, None)
            src = dict(SRC[key]); src['primary'] = False
            if extra: src['locator'] = src['locator'] + '; ' + extra
            if val == '=': src['value'] = value
            elif val is not None: src['value'] = val
            sources.append(src)
        row = dict(id=fid, level=self.level, domain=domain, statement=statement)
        if value is not None: row['value'] = value
        if unit: row['unit'] = unit
        row['validFor'] = seasons
        row['sources'] = sources
        if assumption: row['assumption'] = True
        row['status'] = compute_status(row)
        row['usedBy'] = []
        if notes: row['notes'] = notes
        row['statusHistory'] = [dict(date=LOAD_DATE, status=row['status'], reason='First load of the calibration targets from the bible (WP-13). Sources are the ones the bible and the research files record; no outside page was re-opened in this load.')]
        self.facts.append(row)
        return fid, row['status']

    def T(self, id, leaf, layer, kind, quantity, unit, measure, definition, value, srcs, expect, tier,
          n=None, seasons='2022-2024', tol=None, rsd=False, note=None, fnotes=None, assumption=False, words=''):
        assert id not in self.ids, id
        self.ids.add(id)
        if tol is None:
            tol = {'rate': CORE, 'mean': CORE, 'sd': SD, 'quantiles': QUANT, 'ordering': ORDER}[kind]
        fact_id = None
        if expect == 'MISSING':
            assert value == [] and tier == 'watch'
        else:
            fv = value if isinstance(value, (int, float)) and not isinstance(value, bool) else (', '.join(str(x) for x in value) if kind != 'ordering' else None)
            fact_id, status = self.fact('%s: %s (%s, %s).' % (quantity, fv if fv is not None else 'order ' + ' < '.join(value), self.level, seasons) + (' ' + definition if kind == 'ordering' else ''), fv, unit if kind != 'ordering' else None, srcs, seasons, fnotes, assumption)
            assert status == expect, (id, status, expect)
            if tier == 'certify': assert status == 'Verified', id
        self.targets.append(dict(id=id, ruleSetId=self.rule_set, leaf=leaf, layer=layer, kind=kind, quantity=quantity, unit=unit,
                                 filter=measure + (': ' + words if words else ''), definition=definition, value=value, n=n, seasons=seasons, tolerance=tol,
                                 factId=fact_id, tier=tier, ruleSetDependent=rsd, note=note))

    def missing(self, id, leaf, layer, kind, quantity, unit, note, measure='none'):
        self.T(id, leaf, layer, kind, quantity, unit, measure, 'No number is held in the bible. The row exists so the report prints MISSING SOURCE.', [], [], 'MISSING', 'watch', seasons='none', tol=CORE if kind != 'ordering' else ORDER, note=note)
