#!/usr/bin/env python3
"""G-93 builder: turns the verified research rows into data/glossary/*.json (not shipped).
Usage: python3 -I build.py RESEARCH_DIR BIBLE_A4_FILE OUT_DIR
Reads RESEARCH_DIR/final/glossary-terms.jsonl and dropped-terms.jsonl and the A4.5 tables of the bible (for ownerLeaf).
Status is never copied: facts files carry sources and the test computes status with computeStatus (Q6.1.2)."""
import json, re, sys, collections, hashlib
research, bible, out = sys.argv[1:4]
RULES = [(r'ncaa.*rule|ncaa \(official', 'ncaa-rulebook'), (r'cba|collective bargaining', 'nfl'),
 (r'nfl.*rulebook|official rulebook|nfl rule', 'nfl'), (r'nflpa|players association', 'nflpa'),
 (r'^nfl\b|football operations|nfl\.com|next gen|seahawks|texans|patriots|falcons|buccaneers|steelers\.com|media access', 'nfl'),
 (r'wikipedia', 'wikipedia'), (r'under armour', 'underarmour'), (r'the42', 'the42'), (r'inside the pylon|scouting academy', 'itp'),
 (r'fox sports', 'fox'), (r'active', 'active'), (r'viqtory', 'viqtory'), (r'daily wildcat', 'wildcat'), (r'pff|pro football focus', 'pff'),
 (r'match ?quarters', 'matchquarters'), (r'reisland', 'reisland'), (r'zone ?coverage', 'zonecoverage'), (r'oocities', 'oocities'),
 (r'cran|nflverse', 'nflverse'), (r'ncaa', 'ncaa')]
def grp(p):
    q = (p or '').lower().strip()
    for rx, g in RULES:
        if re.search(rx, q): return g
    return re.sub(r'[^a-z0-9]', '', q)[:20] or '?'
def is_primary(s):
    q = ((s.get('publisher') or '') + ' ' + (s.get('title') or '')).lower()
    k = (s.get('kind') or '').lower()
    return bool(re.search(r'rulebook|collective bargaining|\bcba\b', q)) and (k in ('rulebook', 'cba', 'primary-rule-text', 'rule-text') or 'primary' in q or 'official' in q or 'rulebook' in k)
rows = [json.loads(l) for l in open(research + '/final/glossary-terms.jsonl')]
dropped = [json.loads(l) for l in open(research + '/final/dropped-terms.jsonl')]
# ownerLeaf from the bible A4.5 tables
leaf = {}; sec = None
for l in open(bible).read().split('\n')[300:]:
    m = re.match(r'### (A4\.5\.\d+)', l)
    if m: sec = m.group(1); continue
    if sec and sec != 'A4.5.11' and l.startswith('| ') and not l.startswith('| Term') and not l.startswith('| ---'):
        c = [x.strip() for x in l.strip().strip('|').split('|')]
        leaf.setdefault((c[0].lower(), c[3] if len(c) > 3 else ''), sec)
        leaf.setdefault((c[0].lower(), ''), sec)
FILES = {'A4.5.1': 'rules', 'A4.5.2': 'offense', 'A4.5.3': 'defense', 'A4.5.4': 'special-teams', 'A4.5.5': 'situational',
 'A4.5.6': 'front-office', 'A4.5.7': 'college', 'A4.5.8': 'staff', 'A4.5.9': 'scouting', 'A4.5.10': 'practice-medical-media'}
FACT_DOMAIN = {'rule': 'rule', 'front-office': 'league-rule', 'medical': 'medical'}
KIND_HOW = lambda s, prim: 'primary text' if prim else 'secondary summary'
def compute_status(srcs):  # mirrors computeStatus in packages/schema/src/facts.ts (Q6.1.2); the test checks the two agree
    if not srcs: return 'Unverified'
    groups = {x['independenceGroup'] for x in srcs}
    primary = any(x['primary'] and x['howRead'] == 'primary text' for x in srcs)
    if len(groups) >= 3 or (primary and len(groups) >= 2): return 'Verified'
    if primary: return 'Rulebook only'
    return '2 of 3' if len(groups) == 2 else '1 of 3'
terms = collections.defaultdict(list); facts = collections.defaultdict(list); n = 0
missing = []
for r in sorted(rows, key=lambda r: r['id']):
    n += 1
    ol = leaf.get((r['term'].lower(), r['level'])) or leaf.get((r['term'].lower(), ''))
    if not ol: missing.append(r['id']); continue
    fd = FACT_DOMAIN.get(r['domain'], 'coaching-convention')
    fid = 'F-glossary-%04d' % n
    srcs = []; seen = set()
    for s in r['sources']:
        if s['url'] in seen: continue
        seen.add(s['url'])
        prim = is_primary(s)
        o = {'citation': (s['title'] + ' (' + s['publisher'] + ')')[:300], 'locator': s['url'], 'dateRead': '2026-11-26',
             'howRead': KIND_HOW(s, prim), 'independenceGroup': grp(s.get('publisher') or s.get('title')), 'primary': prim}
        q = s.get('quote')
        if q and 'paraphrase' not in (s.get('kind') or '') and len(q.split()) <= 20: o['quote'] = q
        srcs.append(o)
    if srcs and {x['independenceGroup'] for x in srcs} <= {'nfl', 'ncaa-rulebook'} and any(x['primary'] and x['independenceGroup'] == 'nfl' for x in srcs):  # an NFL page is not independent of the NFL rulebook (A5.2.1) and two rulebooks agreeing are not a cross-check by themselves: keep the researched 'Rulebook only'
        for x in srcs: x['independenceGroup'] = 'rulebooks'
    facts[fd].append({'id': fid, 'level': r['level'], 'domain': fd, 'statement': r['term'] + ': ' + r['definition'],
      'validFor': '2026 NFL and NCAA rulebooks and CBA' if r['domain'] == 'rule' else 'current usage, read 2026-11-26',
      'sources': srcs, 'status': compute_status(srcs), 'usedBy': [r['id']],
      'statusHistory': [{'date': '2026-11-26', 'status': compute_status(srcs), 'reason': 'First load (G-93).'}],
      **({'notes': r['notes']} if r.get('notes') else {})})
    t = {'id': r['id'], 'term': r['term'], 'aliases': r['aliases'], 'definition': r['definition'], 'domain': r['domain'],
         'subdomain': r['subdomain'], 'level': r['level'], 'ownerLeaf': ol, 'factRow': fid}
    if r.get('variants'): t['variants'] = r['variants']
    terms[FILES[ol]].append(t)
assert not missing, missing[:10]
for k, v in terms.items(): json.dump({'leaf': [a for a, b in FILES.items() if b == k][0], 'terms': v}, open(f'{out}/terms-{k}.json', 'w'), indent=1, ensure_ascii=False)
for k, v in facts.items(): json.dump({'domain': k, 'rows': v}, open(f'{out}/facts-{k}.json', 'w'), indent=1, ensure_ascii=False)
shipped = {r['term'].lower() for r in rows} | {a.lower() for r in rows for a in r['aliases']}
ns = []; seen_ns = set()
for d in dropped:
    k = d['term'].lower()
    if k in shipped or k in seen_ns: continue  # a term that was later sourced is not blocked
    seen_ns.add(k); ns.append({'term': d['term'], 'domain': d['domain'], 'level': d['level']})
json.dump({'note': 'A4.5.11: real-sounding terms that no page actually read could source. No screen, lesson or template may use them until a source is found.', 'terms': ns}, open(f'{out}/not-shipped.json', 'w'), indent=1, ensure_ascii=False)
print(n, {k: len(v) for k, v in terms.items()}, len(ns))
