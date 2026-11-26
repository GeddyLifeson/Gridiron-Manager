// G-93 / A4.1.1: one record per term. Screens, lessons and text templates link to the `id`.

export type GlossaryDomain =
  | 'rule' | 'offense' | 'defense' | 'special-teams' | 'situational' | 'front-office'
  | 'college' | 'staff' | 'scouting' | 'personnel' | 'medical' | 'practice' | 'media';
export type GlossaryLevel = 'pro' | 'college' | 'both';
/** The level in play on the screen (a save is at one level at a time). */
export type PlayLevel = 'pro' | 'college';

export interface TermRecord {
  /** Stable, `term.<slug>`. Never reused. */
  readonly id: string;
  readonly term: string;
  /** Other real names for the same thing (A4.1.2). */
  readonly aliases: readonly string[];
  /** One sentence, plain. */
  readonly definition: string;
  readonly domain: GlossaryDomain;
  readonly subdomain: string;
  readonly level: GlossaryLevel;
  /** The A4.5.n leaf that owns the meaning. */
  readonly ownerLeaf: string;
  /** Register row (Q6.1.1) that carries the sources; its status is computed, never typed here. */
  readonly factRow: string;
  /** System or regional names found in sources. */
  readonly variants?: readonly string[];
  /** Optional diagram and lesson references (set by G-94 and the diagram pass; absent until then). */
  readonly diagram?: string;
  readonly lesson?: string;
}

export interface NotShipped { readonly term: string; readonly domain: string; readonly level: GlossaryLevel }

/** A piece of linked text: plain text, or a term the reader can open. */
export type Segment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'term'; readonly text: string; readonly id: string; readonly matched: 'term' | 'alias' };
