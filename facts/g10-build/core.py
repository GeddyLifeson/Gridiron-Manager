"""G-10 fact builder core. Every quote is searched in a local text copy of its source (when one exists);
a quote that is not found stops the build. Status is never typed: the repo's computeStatus recomputes it
(the lint and the test fail if a stored status differs)."""
import json, re, sys, os

TEXTS = {}
def norm_with_lines(raw):
    out, lines = [], []
    ln = 1
    i, n = 0, len(raw)
    while i < n:
        c = raw[i]
        if c == '-' and i + 1 < n and raw[i+1] == '\n' and out and not out[-1].isdigit():
            # drop a hyphenation break when the next visible char is a lowercase letter
            j = i + 2
            while j < n and raw[j] in ' \t': j += 1
            if j < n and raw[j].islower():
                ln += 1; i = j; continue
        if c == '\n': ln += 1
        if c.isspace():
            if out and out[-1] != ' ': out.append(' '); lines.append(ln)
        else:
            out.append(c); lines.append(ln)
        i += 1
    return ''.join(out).strip(), lines

def load(path):
    if path not in TEXTS:
        raw = open(path, encoding='utf-8', errors='replace').read().replace('­', '')
        s, lines = norm_with_lines(raw)
        TEXTS[path] = (s, lines)
    return TEXTS[path]

def norm_quote(q):
    return re.sub(r'\s+', ' ', q.replace('­', '')).strip()

SOURCES = {}
def source(name, citation, group, primary, how, path=None, copy=None, date='2026-11-26'):
    SOURCES[name] = dict(citation=citation, group=group, primary=primary, how=how, path=path, copy=copy, date=date)

def S(name, where, quote, value=None):
    """One source entry. If the source has a local text copy the quote must be found in it."""
    s = SOURCES[name]
    q = norm_quote(quote)
    loc = where
    if s['path']:
        text, lines = load(s['path'])
        k = text.find(q)
        if k < 0:
            sys.exit(f"QUOTE NOT FOUND in {name}: {q!r}")
        loc = f"{where} (text copy {s['copy']}, line {lines[k]})"
    d = dict(citation=s['citation'], locator=loc, dateRead=s['date'], howRead=s['how'],
             independenceGroup=s['group'], primary=s['primary'], quote=q)
    if value is not None: d['value'] = value
    return d

class Reg:
    def __init__(self, domain, prefix):
        self.domain, self.prefix, self.rows, self.n = domain, prefix, [], 0
    def add(self, key, src, value_check=None):
        for r in self.rows:
            if r.get('_key') and r['_key'][0] == key:
                r['sources'].append(src); return
        raise SystemExit('no row for key '+key)
    def row(self, level, statement, value, unit, valid, sources, key=None, notes=None, assumption=False, ruledomain=None):
        self.n += 1
        r = dict(id=f"F-{self.prefix}-{self.n:04d}", level=level, domain=ruledomain or self.domain, statement=statement)
        if value is not None: r['value'] = value
        if unit: r['unit'] = unit
        r.update(validFor=valid, sources=sources)
        if assumption: r['assumption'] = True
        r['usedBy'] = []
        if notes: r['notes'] = notes
        r['_key'] = key
        self.rows.append(r)
        return r['id']

def status(r):
    """Mirror of computeStatus in packages/schema/src/facts.ts."""
    if r.get('assumption'): return 'Assumption'
    read = [s for s in r['sources'] if s['howRead'] != 'model knowledge']
    if not read: return 'Unverified'
    vals = [s['value'] for s in read if 'value' in s]
    if 'value' in r and any(v != r['value'] for v in vals): return 'Conflict'
    groups = {s['independenceGroup'] for s in read}
    primary = any(s['primary'] and s['howRead'] == 'primary text' for s in read)
    if len(groups) >= 3: return 'Verified'
    if primary and len(groups) >= 2: return 'Verified'
    if primary: return 'Rulebook only'
    if len(groups) == 2: return '2 of 3'
    return '1 of 3'
