"""Builds the sourced release rates of veteran contracts, with their fact rows.

Source (nflverse-data GitHub release; download into its own empty folder, then run with -I):
  contracts/historical_contracts.parquet      (OverTheCap contracts with each player's contract and season history)

    python3 -I facts/release-build/build.py <historical_contracts.parquet> <date>

Writes:
  facts/release-rates.json                    fact rows (status computed as in packages/schema facts.ts)

Method. Every contract in a player's `contract_history` is one row (duplicates across a player's rows dropped).
Veteran deals are contract types UFA, Extension, Franchise, RFA and Transition with two or more years, signed
2011 to 2021 so the outcome is known. The pay tier is the deal's percentile of average per year among the
veteran deals signed at the same OverTheCap position in the same year. Released means OverTheCap's status
`Terminated` or `June 1 Terminated`. Seasons served are the player's `season_history` seasons with that team
inside the deal's years. "Signed again" means the player's next contract was signed by the league year after
his last season served. The world's matching measurement is packages/world/test/contracts/tools/release-rates.test.ts.
"""
import json
import os
import sys

import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
VETERAN = ['UFA', 'Extension', 'Franchise', 'RFA', 'Transition']
RELEASED = ['Terminated', 'June 1 Terminated']
FIRST, LAST = 2011, 2021
TIERS = [(0.0, 0.5), (0.5, 0.8), (0.8, 0.9), (0.9, 1.0)]


def rows_of(d):
    out, seen = [], set()
    for _, r in d.iterrows():
        ch = list(r.contract_history) if r.contract_history is not None else []
        sh = list(r.season_history) if r.season_history is not None else []
        for i, c in enumerate(ch):
            key = (r.otc_id, c['team'], c['year_signed'], c['yrs'], c['total'])
            if key in seen or c['year_signed'] is None or not c['yrs']:
                continue
            seen.add(key)
            ys, yrs = int(c['year_signed']), int(c['yrs'])
            served = sum(1 for h in sh if h['team'] == c['team'] and ys <= int(h['year']) < ys + yrs)
            nxt = [x for x in ch[i + 1:] if x['year_signed'] is not None]
            out.append({'pos': r.position, 'ctype': c['contract_type'], 'status': c['status'], 'ys': ys, 'yrs': yrs, 'apy': c['apy'],
                        'served': served, 'next_ys': int(nxt[0]['year_signed']) if nxt else None})
    return pd.DataFrame(out)


def main(path, date):
    t = rows_of(pd.read_parquet(path))
    v = t[t.ctype.isin(VETERAN) & (t.ys >= FIRST) & (t.ys <= LAST) & (t.yrs >= 2)].copy()
    v['pct'] = v.groupby(['pos', 'ys']).apy.rank(pct=True)
    v['released'] = v.status.isin(RELEASED)
    v['after1'] = v.released & (v.served <= 1)
    facts = []
    src = lambda value, locator: {
        'citation': 'OverTheCap contract data as re-published by nflverse (nflverse-data release "contracts", historical_contracts.parquet), '
                    'github.com/nflverse/nflverse-data releases; computed by the project',
        'howRead': 'dataset computed', 'independenceGroup': 'overthecap', 'primary': False, 'locator': locator, 'dateRead': date, 'value': value}

    def fact(n, statement, value, unit, locator):
        facts.append({'id': f'F-release-{n:04d}', 'level': 'pro', 'domain': 'measured-rate', 'statement': statement, 'value': value, 'unit': unit,
                      'validFor': f'veteran contracts of 2+ years signed {FIRST}-{LAST}', 'sources': [src(value, locator)], 'status': '1 of 3', 'usedBy': [],
                      'notes': 'Cross-checked against Spotrac via The Ringer (F-release-0007..0010, facts/release-rates-spotrac.json): free-agent deals only, 2011-2015, counted by full seasons, so higher (2-year deals 54% vs 32% here). Both sources fall with contract length. PFF (2022, 2013-2021 UFA signings) reports completion near 1/length, consistent with both. Status stays 1 of 3 per value: the definitions differ.',
                      'statusHistory': [{'date': date, 'status': '1 of 3', 'reason': 'First load (facts/release-build/build.py).'}]})

    n = 1
    for lo, hi in TIERS:
        g = v[(v.pct > lo) & (v.pct <= hi)]
        share = round(float(g.after1.mean()), 3)
        fact(n, f'Veteran deals in pay tier {lo}-{hi} (percentile of average per year at the position and signing year): {share * 100:.1f}% '
                f'were released after one season or less (n {len(g)}); {g.released.mean() * 100:.1f}% were released before they ran out.',
             share, 'share released after one season', f'tier {lo}-{hi}; facts/release-build/build.py')
        n += 1
    share = round(float(v.after1.mean()), 3)
    fact(n, f'All veteran deals of two or more years: {share * 100:.1f}% were released after one season or less (n {len(v)}).', share,
         'share released after one season', 'all tiers; facts/release-build/build.py')
    n += 1
    top = v[(v.pct > 0.9) & v.released]
    again = round(float(((top.next_ys.notna()) & (top.next_ys <= top.ys + top.served + 1)).mean()), 3)
    fact(n, f'Of released veteran deals in the top pay tier (0.9-1), {again * 100:.1f}% of the players signed their next contract by the '
            f'league year after their last season with the club (n {len(top)}).', again, 'share signed again within a year',
         'tier 0.9-1, released; facts/release-build/build.py')
    with open(os.path.join(ROOT, 'facts/release-rates.json'), 'w') as f:
        json.dump({'domain': 'measured-rate', 'rows': facts}, f, indent=1)
    print(json.dumps([{'id': r['id'], 'value': r['value']} for r in facts]))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
