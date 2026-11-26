"""Builds the sourced pay scale by position (C8.3.1 rule 1) and its fact rows.

Source: nflverse-data release `contracts`, file historical_contracts.parquet (OverTheCap contract data,
re-published by nflverse). Download it first, then run with -I so nothing in the download folder loads:

    curl -sSL -o /tmp/otc/hc.parquet \
      https://github.com/nflverse/nflverse-data/releases/download/contracts/historical_contracts.parquet
    python3 -I facts/market-pay-build/build.py /tmp/otc/hc.parquet 2026-11-25

The second argument is the file's Last-Modified date (the snapshot the numbers describe).

Rows used: every contract the file marks active (`is_active`), its `apy_cap_pct` (average per year over
the salary cap of the year it was signed, as OverTheCap computes it). For each world position (the
roster-mix codes) the shares of its OverTheCap positions are pooled, sorted highest first and read at
POINTS evenly spaced percentiles, 1 (the best-paid contract) down to 0 (the lowest). The game's
`market.shareAt` interpolates linearly between list entries, so the evenly spaced list reads the same
curve as the full list to within one step.

Writes packages/world/src/contracts/pay-scale.json and facts/market-pay.json.
"""
import json
import os
import sys

import pandas as pd

POINTS = 51
TOP_N = 5

# World roster-mix position -> OverTheCap positions. OverTheCap's split of the line and the pass rushers
# is finer than the world's: tackles pool LT and RT, guards LG and RG. ED (edge) covers 4-3 ends and
# 3-4 rush linebackers; the world's DE reads ED and its OLB reads LB (off-ball linebackers), an
# Assumption noted on the rows. NT and DT both read IDL; FS and SS both read S.
WORLD = {
    'QB': ['QB'], 'RB': ['RB'], 'FB': ['FB'], 'WR': ['WR'], 'TE': ['TE'],
    'T': ['LT', 'RT'], 'G': ['LG', 'RG'], 'C': ['C'],
    'DE': ['ED'], 'DT': ['IDL'], 'NT': ['IDL'],
    'OLB': ['LB'], 'ILB': ['LB'], 'MLB': ['LB'],
    'CB': ['CB'], 'FS': ['S'], 'SS': ['S'],
    'K': ['K'], 'P': ['P'], 'LS': ['LS'],
}

SOURCE = {
    'citation': 'OverTheCap contract data as re-published by nflverse (nflverse-data release "contracts", historical_contracts.parquet), github.com/nflverse/nflverse-data releases; computed by the project',
    'howRead': 'dataset computed',
    'independenceGroup': 'overthecap',
    'primary': False,
}


def quantiles(shares):
    s = sorted(shares, reverse=True)
    out = []
    for i in range(POINTS):
        pos = i * (len(s) - 1) / (POINTS - 1)
        lo, hi = int(pos), min(len(s) - 1, int(pos) + 1)
        out.append(round(s[lo] + (s[hi] - s[lo]) * (pos - lo), 5))
    return out


def main(path, snapshot):
    d = pd.read_parquet(path)
    a = d[d.is_active == True]  # noqa: E712 (pandas mask)
    root = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
    rows, positions = [], {}
    for n, (pos, otc) in enumerate(sorted(WORLD.items()), start=1):
        shares = [float(x) for x in a[a.position.isin(otc)].apy_cap_pct]
        fid = f'F-market-pay-{n:04d}'
        top = sorted(shares, reverse=True)[:TOP_N]
        top_mean = round(sum(top) / len(top), 4)
        median = round(sorted(shares)[len(shares) // 2], 4)
        positions[pos] = {'from': otc, 'contracts': len(shares), 'factId': fid, 'shares': quantiles(shares)}
        mapping = '' if pos in ('QB', 'RB', 'FB', 'WR', 'TE', 'C', 'CB', 'K', 'P', 'LS') else f' World {pos} reads OverTheCap {"+".join(otc)} (mapping is an Assumption of this build).'
        rows.append({
            'id': fid, 'level': 'pro', 'domain': 'measured-rate',
            'statement': f'Pro pay at {pos}: the five best-paid active contracts average {top_mean} of the salary cap (APY over the cap of the signing year); median {median}; {len(shares)} active contracts.{mapping}',
            'value': top_mean, 'unit': 'share of cap', 'validFor': f'active contracts at {snapshot}',
            'sources': [{**SOURCE, 'locator': f'is_active rows, position in {otc}, apy_cap_pct; facts/market-pay-build/build.py', 'dateRead': snapshot, 'value': top_mean}],
            'status': '1 of 3', 'usedBy': [],
            'notes': 'One dataset so far. Cross-checks owed: a second publisher (Spotrac positional pages) and the league\'s franchise tag figures (CBA Art. 10 s.2, average of the five largest prior-year salaries, F-league-0013). The cloud cannot reach either site.',
            'statusHistory': [{'date': snapshot, 'status': '1 of 3', 'reason': 'First load from the nflverse OverTheCap file (Last-Modified ' + snapshot + ').'}],
        })
    scale = {
        '$comment': 'C8.3.1 rule 1 founding scale: shares of the salary cap by world position, highest first, at evenly spaced percentiles (1 = best paid, 0 = lowest). Built by facts/market-pay-build/build.py from OverTheCap active contracts (nflverse). Status 1 of 3: see each factId.',
        'snapshot': snapshot, 'points': POINTS, 'positions': positions,
    }
    with open(os.path.join(root, 'packages/world/src/contracts/pay-scale.json'), 'w') as f:
        json.dump(scale, f, indent=1)
        f.write('\n')
    with open(os.path.join(root, 'facts/market-pay.json'), 'w') as f:
        json.dump({'domain': 'measured-rate', 'rows': rows}, f, indent=1)
        f.write('\n')
    for pos, p in sorted(positions.items()):
        print(pos, p['contracts'], p['shares'][0], p['shares'][5], p['shares'][25], p['shares'][-1])


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
