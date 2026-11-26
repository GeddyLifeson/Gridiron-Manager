import json, sys, glob, importlib, os
sys.path.insert(0, os.path.dirname(__file__))
from core import *
mods = ['rows_cba','rows_web','rows_more','rows_inj','rows_g10b']

regs = {}
for m in mods:
    mod = importlib.import_module(m)
    for name in ('LG','CAP','COL','INJ'):
        if hasattr(mod, name): regs[name] = getattr(mod, name)
root = os.path.join(os.path.dirname(__file__), '..')
files = {'LG':'league.json','CAP':'cap.json','COL':'college.json','INJ':'injury.json'}
keys = {'pro':{}, 'college':{}}; vals = {'pro':[], 'college':[]}
for n, reg in regs.items():
    for r in reg.rows:
        k = r.pop('_key')
        r['status'] = status(r)
        r['statusHistory'] = [dict(date='2026-11-26', status=r['status'], reason='First load by G-10 from sources read this session.')]
        if k:
            lvl = 'college' if r['level']=='college' else 'pro'
            key, meaning, owner = k[:3]; opts = k[3] if len(k)>3 else None
            unit = r.get('unit')
            t = 'boolean' if isinstance(r.get('value'), bool) else ('option' if isinstance(r.get('value'), str) else 'number')
            keys[lvl][key] = dict(key=key, type=t, meaning=meaning, ownerLeaf=owner, readBy=['league (G-10 data)'], **({'unit':unit} if unit and t=='number' else {}), **({'options':opts} if opts else {}))
            vals[lvl].append(dict(key=key, value=r['value'], **({'unit':unit} if unit and t=='number' else {}), factId=r['id'], **({} if r['status'] in ('Verified','Rulebook only') else {'note':'PROVISIONAL: status '+r['status']+' (Q6.3.1)'})))
    json.dump(dict(domain=reg.domain, rows=reg.rows), open(os.path.join(root, files[n]), 'w'), indent=1, ensure_ascii=False); open(os.path.join(root, files[n]),'a').write('\n')
d = os.path.join(root, '..', 'packages/rules-data/data/league'); os.makedirs(d, exist_ok=True)
for lvl in ('pro','college'):
    if not vals[lvl]: continue
    json.dump(dict(keys=list(keys[lvl].values())), open(f'{d}/keys_{lvl}.json','w'), indent=1); open(f'{d}/keys_{lvl}.json','a').write('\n')
    json.dump(dict(ruleset_id=f'{lvl}league_2026', level=lvl, season_year=2026, source=dict(document='Fact register rows F-league, F-cap, F-college', date='2026'), schema_version=1, values=vals[lvl]), open(f'{d}/{lvl}league_2026.json','w'), indent=1); open(f'{d}/{lvl}league_2026.json','a').write('\n')
from collections import Counter
for n, reg in regs.items(): print(n, len(reg.rows), Counter(r['status'] for r in reg.rows))
