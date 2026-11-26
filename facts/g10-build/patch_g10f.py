"""G-10 blocked-facts pass (2026-11-26), thread "Collect blocked rule facts in browser". Quotes were read on the user's PC
in the built-in browser (pages the cloud cannot reach). Adds sources to existing rows, recomputes status with the same
rules as computeStatus, appends a statusHistory entry, and clears the PROVISIONAL note on rule values that become shippable.
Idempotent: a source with the same citation and quote is not added twice.  Run: python3 patch_g10f.py"""
import json, os, re, sys
from core import status
ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
DATE = '2026-11-26'
from g10f_core import SRC, ADD
import g10f_entries   # fills SRC and ADD

FILES = ['league', 'cap', 'college', 'college-keys', 'college-recruiting', 'schedule-staff', 'injury', 'measured-rate']
files = {f: json.load(open(f'{ROOT}/facts/{f}.json')) for f in FILES if os.path.exists(f'{ROOT}/facts/{f}.json')}
rows = {r['id']: (f, r) for f, d in files.items() for r in d['rows']}
changed = {}
touched = set()
for rid, name, loc, quote, val in ADD:
    if rid not in rows: sys.exit('no row ' + rid)
    f, r = rows[rid]; s = SRC[name]
    if any(x['citation'] == s['citation'] and x['quote'] == quote for x in r['sources']): continue
    e = dict(citation=s['citation'], locator=loc, dateRead=DATE, howRead='primary text' if s['primary'] else s['how'],
             independenceGroup=s['group'], primary=s['primary'], quote=quote)
    if val is not None: e['value'] = val
    r['sources'].append(e); touched.add(f)
    changed.setdefault(rid, name)
for rid in changed:
    f, r = rows[rid]
    old = r['status']; new = status(r)
    if new != old:
        r['status'] = new
        r.setdefault('statusHistory', []).append(dict(date=DATE, status=new, reason='G-10 blocked-facts pass: sources read in the PC browser and added (' + ', '.join(sorted({SRC[n]['group'] for rid2, n, *_ in ADD if rid2 == rid})) + ').'))
    print(rid, old, '->', new)
for f, d in files.items():
    if f not in touched: continue
    json.dump(d, open(f'{ROOT}/facts/{f}.json', 'w'), indent=1, ensure_ascii=False); open(f'{ROOT}/facts/{f}.json', 'a').write('\n')
# rule-set value notes
import glob
for p in glob.glob(f'{ROOT}/packages/rules-data/data/league/*league_2026.json'):
    d = json.load(open(p)); n = 0
    for v in d['values']:
        fid = v.get('factId')
        if fid in rows:
            st = rows[fid][1]['status']
            if st in ('Verified', 'Rulebook only'):
                if 'note' in v and v['note'].startswith('PROVISIONAL'): del v['note']; n += 1
            else:
                v['note'] = f'PROVISIONAL: status {st} (Q6.3.1)'
    json.dump(d, open(p, 'w'), indent=1); open(p, 'a').write('\n')
    if n: print(os.path.basename(p), 'notes cleared', n)
