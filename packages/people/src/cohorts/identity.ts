// X11.4 identity rules. X11.4.1: no generator reads another person's attributes or traits; a family
// link is a flag and an X7 edge only, and never touches a protected (imported) person. X11.4.2: a
// generated person may not share a full name with anyone in a loaded people pack; names are normalized
// before matching and a collision is redrawn first name first (5 times), then last name, then both.
import type { PersonRecord, RandomStream } from '@gm/schema';
import { param } from './params.ts';

const SUFFIXES: ReadonlySet<string> = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);

/**
 * Common short forms treated as the same first name (X11.4.2 rule 2). Deliberately conservative: a
 * content table; packs may extend it. Every entry maps to its long form.
 */
export const SHORT_FORMS: Readonly<Record<string, string>> = {
  mike: 'michael', mikey: 'michael', chris: 'christopher', matt: 'matthew', dave: 'david', dan: 'daniel', danny: 'daniel',
  jim: 'james', jimmy: 'james', jamie: 'james', bob: 'robert', bobby: 'robert', rob: 'robert', robbie: 'robert',
  bill: 'william', billy: 'william', will: 'william', willie: 'william', tom: 'thomas', tommy: 'thomas', joe: 'joseph', joey: 'joseph',
  tony: 'anthony', nick: 'nicholas', alex: 'alexander', andy: 'andrew', drew: 'andrew', ben: 'benjamin', sam: 'samuel',
  steve: 'steven', zach: 'zachary', zack: 'zachary', josh: 'joshua', jon: 'jonathan', jake: 'jacob', pat: 'patrick',
  rick: 'richard', ricky: 'richard', rich: 'richard', dick: 'richard', ed: 'edward', eddie: 'edward', ted: 'theodore',
  greg: 'gregory', jeff: 'jeffrey', ken: 'kenneth', kenny: 'kenneth', larry: 'lawrence', ron: 'ronald', ronnie: 'ronald',
  don: 'donald', donnie: 'donald', tim: 'timothy', timmy: 'timothy', fred: 'frederick', charlie: 'charles', chuck: 'charles',
  johnny: 'john', jack: 'john', gabe: 'gabriel', nate: 'nathan', manny: 'manuel', vince: 'vincent', phil: 'phillip',
};

/** Strip accents with a fixed table (no locale functions in core code, P1.1.1). */
const ACCENTS: Readonly<Record<string, string>> = {
  'á': 'a', 'à': 'a', 'â': 'a', 'ä': 'a', 'ã': 'a', 'å': 'a', 'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e', 'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
  'ó': 'o', 'ò': 'o', 'ô': 'o', 'ö': 'o', 'õ': 'o', 'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u', 'ñ': 'n', 'ç': 'c', 'ý': 'y', 'ÿ': 'y',
};

function fold(s: string): string {
  let out = '';
  for (const ch of s.toLowerCase()) out += ACCENTS[ch] ?? ch;
  return out;
}

/**
 * X11.4.2 rule 1: case-fold, strip accents, drop suffixes and punctuation, collapse hyphens and spaces,
 * and map short forms to the long first name. Returns "first last".
 */
export function normalizeName(first: string, last: string): string {
  const clean = (s: string) => fold(s).replace(/[-\s]+/g, '').replace(/[^a-z]/g, '');
  const lastWords = fold(last).replace(/[.,']/g, ' ').split(/\s+/).filter((w) => w && !SUFFIXES.has(w));
  const f = clean(first);
  return `${SHORT_FORMS[f] ?? f} ${clean(lastWords.join(' '))}`;
}

/** An index of normalized pack names, rebuilt when a pack is loaded or added. */
export class PackNameIndex {
  readonly #names = new Set<string>();
  constructor(packNames: readonly { first: string; last: string }[] = []) { this.add(packNames); }
  add(packNames: readonly { first: string; last: string }[]): void { for (const n of packNames) this.#names.add(normalizeName(n.first, n.last)); }
  collides(first: string, last: string): boolean { return this.#names.has(normalizeName(first, last)); }
  get size(): number { return this.#names.size; }
}

export interface NameDraw {
  first(s: RandomStream): string;
  last(s: RandomStream): string;
}

export interface GuardedName {
  readonly first: string;
  readonly last: string;
  /** Redraws used; 0 when the first draw was clear. Logged by the caller (X11.4.2 rule 3). */
  readonly redraws: number;
  /** False only when every redraw collided (the caller must drop the slot and report it). */
  readonly clear: boolean;
}

/**
 * X11.4.2 rule 3. `draw` comes from the population name tables (G-18 through the caller); `s` is the
 * derived stream for this slot. Order: the drawn name, then up to 5 first-name redraws, then last-name
 * redraws (5), then both (5). Same-name people inside the generated world are allowed (rule 4).
 */
export function guardName(first: string, last: string, index: PackNameIndex, draw: NameDraw, s: RandomStream): GuardedName {
  if (!index.collides(first, last)) return { first, last, redraws: 0, clear: true };
  const n = param('collisionFirstRedraws');
  let redraws = 0;
  let f = first, l = last;
  for (const mode of ['first', 'last', 'both'] as const) {
    for (let i = 0; i < n; i++) {
      redraws++;
      f = mode === 'last' ? first : draw.first(s);
      l = mode === 'first' ? last : draw.last(s);
      if (!index.collides(f, l)) return { first: f, last: l, redraws, clear: true };
    }
  }
  return { first: f, last: l, redraws, clear: false };
}

/** X11.4.2 edge case: a pack added mid-world never renames a generated person; the colliding import is skipped. */
export function packImportsToSkip(generated: readonly Pick<PersonRecord, 'id' | 'name' | 'origin'>[], incoming: readonly { key: string; first: string; last: string }[]): string[] {
  const names = new Set(generated.filter((p) => p.origin === 'generated').map((p) => normalizeName(p.name.first, p.name.last)));
  return incoming.filter((r) => names.has(normalizeName(r.first, r.last))).map((r) => r.key);
}

/** X11.4.1: a family link may never touch a protected person. Returns the offending pairs. */
export function familyEdgeProblems(
  links: readonly { a: number; b: number }[],
  originOf: (id: number) => PersonRecord['origin'] | undefined,
): { a: number; b: number }[] {
  return links.filter((l) => originOf(l.a) === 'imported' || originOf(l.b) === 'imported');
}
