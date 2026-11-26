"""Builds the sourced numbers for the aging fit and the contract-length scale, with their fact rows.

Sources (nflverse-data GitHub releases; download each into its own empty folder, then run with -I):
  combine/combine.parquet                     (Pro Football Reference combine results, 2000 onward)
  contracts/historical_contracts.parquet      (OverTheCap contracts, re-published by nflverse)
  players/players.parquet                     (birth dates, to age each contract at signing)

    python3 -I facts/aging-build/build.py <combine.parquet> <historical_contracts.parquet> <players.parquet> <date>

Writes:
  packages/league/src/development/speed-value.json   forty-yard standard deviation by position family
  packages/world/src/contracts/length-scale.json      veteran contract years by pay tier and age
  facts/aging.json                                    fact rows (status computed as in packages/schema facts.ts)
  facts/aging-build/targets.json                      the production targets fit-aging.ts fits the D8.2.1 curve to

The aging-curve targets (production change per year of age) are typed in TARGETS below from the
research run that computed them (football-manager/research/longrun-aging-injury-stability.md section 1,
script analysis_aging_curves.py over nflverse 1999-2025), with the published studies that cross-check
the shape. The fit of the D8.2.1 curve to them is done by packages/league/test/development/tools/fit-aging.ts.
"""
import json
import math
import os
import sys

import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

COMBINE_POS = {
    'QB': ['QB'], 'RB': ['RB', 'FB'], 'WR': ['WR'], 'TE': ['TE'], 'OL': ['OT', 'OG', 'C', 'OL', 'G', 'T'],
    'DL': ['DT', 'NT', 'DL'], 'EDGE': ['DE', 'EDGE', 'OLB'], 'LB': ['ILB', 'LB', 'MLB'], 'CB': ['CB'],
    'S': ['S', 'FS', 'SS', 'SAF'], 'P': ['P'],
}
# Specialists carry a quarter weight on speed (kick coverage, a snapper's cover duty): Assumption.
SPEED_WEIGHT = {f: 1 for f in ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'EDGE', 'LB', 'CB', 'S']} | {'K': 0.25, 'P': 0.25, 'LS': 0.25}

# OverTheCap position -> world contract group (as in facts/market-pay-build).
OTC_GROUP = {'QB': 'QB', 'RB': 'RB', 'FB': 'RB', 'WR': 'WR', 'TE': 'TE', 'LT': 'OL', 'RT': 'OL', 'LG': 'OL', 'RG': 'OL', 'C': 'OL',
             'IDL': 'DL', 'ED': 'DL', 'LB': 'LB', 'CB': 'DB', 'S': 'DB', 'K': 'ST', 'P': 'ST', 'LS': 'ST'}
TIER_EDGES = [0.0, 0.25, 0.5, 0.65, 0.8, 0.9, 1.0001]
AGE_EDGES = [0, 26, 28, 30, 32, 34, 60]

COMBINE_SRC = {
    'citation': 'NFL Scouting Combine results (Pro Football Reference) as re-published by nflverse (nflverse-data release "combine", combine.parquet), github.com/nflverse/nflverse-data releases; computed by the project',
    'howRead': 'dataset computed', 'independenceGroup': 'pfr-combine', 'primary': False,
}
OTC_SRC = {
    'citation': 'OverTheCap contract data as re-published by nflverse (nflverse-data release "contracts", historical_contracts.parquet), github.com/nflverse/nflverse-data releases; computed by the project',
    'howRead': 'dataset computed', 'independenceGroup': 'overthecap', 'primary': False,
}
NFLVERSE_AGING = {
    'citation': 'Project research run over nflverse play-by-play, weekly stats and snap counts 1999-2025 (football-manager/research/longrun-aging-injury-stability.md section 1, analysis_aging_curves.py), delta method, age on September 1',
    'howRead': 'dataset computed', 'independenceGroup': 'nflverse', 'primary': False,
}
FOURFOR4 = {
    'citation': 'Tristan Bassett, "Production Curves: Positional Breakouts, Prime Years, and Falloffs by Age", 4for4, 2025-08-23, 4for4.com/2025/preseason/production-curves-positional-breakouts-prime-years-and-falloffs-age',
    'howRead': 'secondary summary', 'independenceGroup': '4for4', 'primary': False,
}
ROTOWIRE = {
    'citation': 'Jeff Zimmerman, "The Stats Room: At What Age do Players Decline?", RotoWire, updated 2021-08-30, rotowire.com/football/article/the-stats-room-at-what-age-do-players-decline-29538 (delta method)',
    'howRead': 'secondary summary', 'independenceGroup': 'rotowire', 'primary': False,
}
REFERENCE_72 = {
    'citation': 'Fein 2009 (rate stats 1980-2007) and Schalter 2018 (Pro Football Reference Approximate Value, starters, 1978 on), as summarised in research/football-manager-reference.md section 7.2',
    'howRead': 'secondary summary', 'independenceGroup': 'fein-schalter', 'primary': False,
}

# Production change per year of age, percent of the position's mean (research run section 1). Bands are
# the age in the first season of each pair. Survivor bias: both seasons must qualify, so declines after
# 30 are understated. QB uses PPR points per game (the percent row); K and P are the absolute rows over
# their league means (FG% about 84, gross punt about 45 yards), converted to percent.
BANDS = ['21-24', '25-27', '28-30', '31-33']
TARGETS = {
    'QB': ([2.7, 0.7, 0.4, -3.0], 'PPR points per game'),
    'RB': ([8.2, -4.7, -10.9, -19.4], 'PPR points per game'),
    'WR': ([11.5, -2.2, -11.4, -19.3], 'PPR points per game'),
    'TE': ([15.1, -2.7, -7.6, -8.7], 'PPR points per game'),
    'OL': ([9.4, 2.6, -2.9, -11.1], 'snap share per game played'),
    'DL': ([9.0, 1.6, -3.9, -15.0], 'snap share'),
    'EDGE': ([6.6, 6.5, -11.7, -19.5], 'sacks per game'),
    'LB': ([14.5, 2.3, -4.8, -10.1], 'snap share (31-33: tackles per game)'),
    'DB': ([8.4, -3.4, -9.0, -15.5], 'passes defended plus interceptions per game'),
    'K': ([-0.6, 0.5, -0.8, -1.3], 'field goal percent (absolute points over a mean of about 84)'),
    'P': ([2.7, 1.1, 0.2, -1.8], 'gross yards per punt (absolute yards over a mean of about 45)'),
}
# Shape cross-checks (quotes from the pages, read 2026-11-26).
CROSS = {
    'RB': [(FOURFOR4, 'a back\'s best year is at about age 26, but remains roughly at their peaks ... until the age of 28'),
           (ROTOWIRE, 'the drop doesn\'t start until the back turns 25'),
           (REFERENCE_72, 'RB: Fein peak 23-24, age 32 steepest (-10% YPC); Schalter AV max 26')],
    'WR': [(FOURFOR4, 'Age 29 tends to indicate the start of the decline'),
           (ROTOWIRE, 'The curve works out to an age-25 peak and steady decline the next year'),
           (REFERENCE_72, 'WR: Fein peak 27 (24-30 close)')],
    'TE': [(FOURFOR4, 'The players in our sample didn\'t begin to show any signs of regression until age 31')],
    'QB': [(REFERENCE_72, 'consistent shape: early skill peak, passing efficiency holds to ~30, mobility fades first')],
    'DB': [(REFERENCE_72, 'DB: Schalter only: after year 3 peak AV slowly declines')],
}


def pooled_sd_pct(df, positions):
    rows = df[df.pos.isin(positions) & df.forty.notna()]
    # Pool the within-position spread (positions differ in mean).
    parts = [(len(g), g.forty.std(), g.forty.mean()) for _, g in rows.groupby('pos') if len(g) >= 20]
    n = sum(p[0] for p in parts)
    sd = math.sqrt(sum((p[0] - 1) * p[1] ** 2 for p in parts) / max(1, n - len(parts)))
    mean = sum(p[0] * p[2] for p in parts) / n
    return round(100 * sd / mean, 3), n, round(mean, 3), round(sd, 4)


def main(combine_path, contracts_path, players_path, date):
    facts = []

    def fact(fid, statement, value, unit, valid, sources, notes, assumption=False):
        read = [s for s in sources if s['howRead'] != 'model knowledge']
        groups = {s['independenceGroup'] for s in read}
        vals = [s['value'] for s in read if 'value' in s]
        status = 'Assumption' if assumption else ('Unverified' if not read else 'Conflict' if (value is not None and any(v != value for v in vals))
                                                 else 'Verified' if len(groups) >= 3 else '2 of 3' if len(groups) == 2 else '1 of 3')
        row = {'id': fid, 'level': 'pro', 'domain': 'measured-rate', 'statement': statement}
        if value is not None:
            row['value'] = value
        if unit:
            row['unit'] = unit
        row.update({'validFor': valid, 'sources': sources, 'status': status, 'usedBy': [], 'notes': notes,
                    'statusHistory': [{'date': date, 'status': status, 'reason': 'First load (facts/aging-build/build.py).'}]})
        facts.append(row)

    # 1. Forty spread by position family.
    comb = pd.read_parquet(combine_path)
    sdp = {}
    for fam, positions in COMBINE_POS.items():
        pct, n, mean, sd = pooled_sd_pct(comb, positions)
        sdp[fam] = pct
        fact(f'F-aging-{len(facts) + 1:04d}',
             f'Combine forty at {fam} ({", ".join(positions)}): pooled within-position standard deviation {sd} s on a mean of {mean} s, {pct} percent of the mean; {n} timed players {int(comb.season.min())}-{int(comb.season.max())}.',
             pct, 'percent of mean forty', 'combine invitees 2000-2026',
             [dict(COMBINE_SRC, locator=f'pos in {positions}, forty not null; facts/aging-build/build.py', dateRead=date, value=pct)],
             'One dataset. Cross-checks owed: a second combine archive (nflcombineresults.com) and a published spread study. Prospects, not pro starters: the ISS standard deviation is defined among starters (D2), so this is a stand-in.')
    sdp['K'] = sdp['P']
    sdp['LS'] = sdp['P']
    speed = {'basis': 'bible', 'leaf': 'D8.2.1',
             'note': 'Speed term of the whole-player value (value.ts): fortySdPercent is the combine forty standard deviation as percent of the mean by family (facts/aging.json, F-aging-0001..0011; K and LS read P); weight is the share of a standard deviation of forty that counts as one ISS standard deviation (1 for every non-specialist, 0.25 for kickers, punters and snappers for coverage duty: Assumption).',
             'fortySdPercent': {k: sdp[k] for k in ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'EDGE', 'LB', 'CB', 'S', 'K', 'P', 'LS']},
             'weight': SPEED_WEIGHT}
    with open(os.path.join(ROOT, 'packages/league/src/development/speed-value.json'), 'w') as f:
        json.dump(speed, f, indent=1)
        f.write('\n')

    # 2. Aging-curve targets with their cross-checks.
    for grp, (vals, metric) in TARGETS.items():
        src = [dict(NFLVERSE_AGING, locator=f'section 1 table, row {grp} {metric}', dateRead=date, value=vals[2])]
        for s, quote in CROSS.get(grp, []):
            src.append(dict(s, locator=f'{grp} section', dateRead=date, quote=quote))
        fact(f'F-aging-{len(facts) + 1:04d}',
             f'{grp} production change per year of age ({metric}, percent): ' + ', '.join(f'{b} {v:+}' for b, v in zip(BANDS, vals))
             + f'. The 28-30 band is the value; the cross-check sources support the shape (rise to the mid twenties, decline under way by 28-30), not the numbers.',
             vals[2], 'percent per year (28-30 band)', 'NFL 1999-2025, same-player pairs, both seasons qualifying',
             src, 'Survivor bias: declines after 30 are understated. Production mixes ability, role and playing time; rookie-age gains are mostly playing time. Numbers are one dataset; the other sources check the shape only.')

    with open(os.path.join(ROOT, 'facts/aging-build/targets.json'), 'w') as f:
        json.dump({'bands': BANDS, 'percentPerYear': {g: v for g, (v, _) in TARGETS.items()}, 'facts': {g: f'F-aging-{len(COMBINE_POS) + 1 + i:04d}' for i, g in enumerate(TARGETS)}}, f, indent=1)
        f.write('\n')

    # 3. Veteran contract length by pay tier and age at signing.
    c = pd.read_parquet(contracts_path)
    pl = pd.read_parquet(players_path)[['gsis_id', 'birth_date']]
    pl['bd'] = pd.to_datetime(pl.birth_date, errors='coerce')
    c = c.merge(pl[['gsis_id', 'bd']], on='gsis_id', how='left')
    c['grp'] = c.position.map(OTC_GROUP)
    c = c[c.grp.notna() & c.years.notna() & (c.years > 0) & c.apy_cap_pct.notna()]
    c = c[(c.year_signed >= 2011) & (c.year_signed <= 2025)]
    # Pay tier: where the contract's cap share falls on the active contracts' scale at its group, the same
    # scale the world prices from (facts/market-pay-build reads the is_active rows), so a world player's
    # public percentile names the same tier.
    import numpy as np
    active = {g: np.sort(a.apy_cap_pct.values) for g, a in c[c.is_active == True].groupby('grp')}
    c['tier'] = [float(np.searchsorted(active[g], v, side='right')) / len(active[g]) for g, v in zip(c.grp, c.apy_cap_pct)]
    dy = c.draft_year.fillna(0)
    vet = c[((dy == 0) | (c.year_signed >= dy + 4)) & c.bd.notna()].copy()
    vet['age'] = ((pd.to_datetime(vet.year_signed.astype(int).astype(str) + '-09-01') - vet.bd).dt.days / 365.25).apply(math.floor)
    vet['tb'] = pd.cut(vet.tier, TIER_EDGES, right=False, labels=False)
    vet['ab'] = pd.cut(vet.age, AGE_EDGES, right=False, labels=False)
    years = []
    counts = []
    quants = []
    QS = [(i + 0.5) / 10 for i in range(10)]
    for ti in range(len(TIER_EDGES) - 1):
        row, crow, qrow = [], [], []
        for ai in range(len(AGE_EDGES) - 1):
            cell = vet[(vet.tb == ti) & (vet.ab == ai)].years
            row.append(round(float(cell.mean()), 2) if len(cell) >= 30 else None)
            crow.append(int(len(cell)))
            qrow.append([int(round(float(cell.quantile(q, interpolation='lower')))) for q in QS] if len(cell) >= 30 else None)
        years.append(row)
        counts.append(crow)
        quants.append(qrow)
    # Fill thin cells from the next age band down (older and thinner cells borrow the younger value).
    for row in years + quants:
        for ai in range(len(row)):
            if row[ai] is None:
                near = [row[k] for k in sorted(range(len(row)), key=lambda k: (abs(k - ai), -k)) if row[k] is not None]
                row[ai] = near[0]
    share1 = round(float((vet.years == 1).mean()), 3)
    mean_years = round(float(vet.years.mean()), 2)
    length = {'basis': 'measured', 'note': 'Mean years of veteran contracts (signed 4 or more years after the draft year, or undrafted) 2011-2025 by pay tier (where the cap share falls among the active contracts at the position group, the scale the world prices from) and age on September 1 of the signing year. Rows are tiers, columns age bands; cells under 30 contracts take the nearest band with 30 (older first). yearsAtQuantile holds, per cell, the contract years at the quantilePoints of the cell (a player\'s place within his tier picks the quantile, so the better-paid get the longer deals). Built by facts/aging-build/build.py.',
              'tierStarts': TIER_EDGES[:-1], 'ageStarts': AGE_EDGES[:-1], 'quantilePoints': QS, 'yearsAtQuantile': quants, 'meanYears': years, 'contracts': counts,
              'veteranOneYearShare': share1, 'veteranMeanYears': mean_years, 'veteranContracts': int(len(vet))}
    with open(os.path.join(ROOT, 'packages/world/src/contracts/length-scale.json'), 'w') as f:
        json.dump(length, f, indent=1)
        f.write('\n')
    fact(f'F-aging-{len(facts) + 1:04d}',
         f'Veteran NFL contracts signed 2011-2025 (4 or more years after the draft year, or undrafted; {len(vet)} with a birth date): {round(100 * share1, 1)} percent are one year, mean {mean_years} years.',
         share1, 'share one year', 'contracts signed 2011-2025',
         [dict(OTC_SRC, locator='year_signed 2011-2025, draft_year + 4 <= year_signed; facts/aging-build/build.py', dateRead=date, value=share1)],
         'Flow of signings. The 57 percent one-year figure in PR 286 was over active contracts only, which keeps long deals and drops expired one-year deals, so it overstates length against a world that counts every signing. Cross-checks owed: Spotrac transaction lists.')
    for ti in range(len(TIER_EDGES) - 1):
        lo, hi = TIER_EDGES[ti], min(1, TIER_EDGES[ti + 1])
        fact(f'F-aging-{len(facts) + 1:04d}',
             f'Veteran contracts in pay tier {lo}-{hi} (percentile on the active contracts\' cap-share scale at the position group): mean years by age band '
             + ', '.join(f'{AGE_EDGES[a]}-{AGE_EDGES[a + 1] - 1}: {years[ti][a]} (n {counts[ti][a]})' for a in range(len(AGE_EDGES) - 1)) + '.',
             years[ti][1], 'years (age 26-27 band)', 'contracts signed 2011-2025',
             [dict(OTC_SRC, locator=f'tier {lo}-{hi}; facts/aging-build/build.py', dateRead=date, value=years[ti][1])],
             'One dataset. Cross-checks owed: Spotrac contract lists by length.')

    with open(os.path.join(ROOT, 'facts/aging.json'), 'w') as f:
        json.dump({'domain': 'measured-rate', 'rows': facts}, f, indent=1)
        f.write('\n')
    print(json.dumps({'fortySdPercent': speed['fortySdPercent'], 'veteranOneYearShare': share1, 'veteranMeanYears': mean_years, 'meanYears': years, 'contracts': counts}, indent=None))


if __name__ == '__main__':
    main(*sys.argv[1:5])
