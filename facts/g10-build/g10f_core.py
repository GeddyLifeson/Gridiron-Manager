import re
SRC = {}
def src(name, citation, group, primary=False, how='secondary summary'):
    SRC[name] = dict(citation=citation, group=group, primary=primary, how=how)
ADD = []   # (row id, source name, locator, quote, value or None)
def add(rid, name, locator, quote, value=None): ADD.append((rid, name, locator, re.sub(r'\s+', ' ', quote).strip(), value))
NOTES = []  # (row id, text)
def note(rid, text): NOTES.append((rid, text))
