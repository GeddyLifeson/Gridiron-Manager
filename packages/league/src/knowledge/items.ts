// D9.1.1 knowledge items: family, concept or call, variation, and terminology (one per family), each with
// a parent, and a difficulty 1 to 5 per position. A called play uses a set of items; a player's effective
// knowledge for his assignment is the minimum over the items it uses that he has an assignment in.
import { num, type KnowledgeNumbers } from './params.ts';

export const ITEM_LEVELS = ['family', 'concept', 'variation', 'terminology'] as const;
export type ItemLevel = (typeof ITEM_LEVELS)[number];

/** One knowledge item. Ids come from the playbook content (G1 to G4); the family id is its root. */
export interface KnowledgeItem {
  readonly id: string;
  readonly level: ItemLevel;
  /** Parent id: none for a family, the family for a concept or terminology, the concept for a variation. */
  readonly parent: string | null;
  /** Difficulty 1 to 5 by position code (G assigns it). A missing position reads the item's default. */
  readonly difficulty: Readonly<Record<string, number>>;
  readonly defaultDifficulty: number;
}

/** The team's catalogue of items, installed or not. */
export class ItemCatalogue {
  private readonly byId = new Map<string, KnowledgeItem>();
  /** Items in the current playbook. Removed items keep their knowledge (D9.1.1 edge case) but leave this set. */
  private readonly installedIds = new Set<string>();

  constructor(private readonly n: KnowledgeNumbers, items: readonly KnowledgeItem[] = []) {
    for (const it of items) this.add(it);
  }

  add(item: KnowledgeItem): void {
    const lo = num(this.n, 'items.difficultyMin');
    const hi = num(this.n, 'items.difficultyMax');
    if (this.byId.has(item.id)) throw new Error(`item ${item.id} added twice`);
    if ((item.level === 'family') !== (item.parent === null)) throw new Error(`item ${item.id}: only a family has no parent`);
    if (item.parent !== null) {
      const parent = this.byId.get(item.parent);
      if (!parent) throw new Error(`item ${item.id}: parent ${item.parent} not in the catalogue`);
      const want: ItemLevel = item.level === 'variation' ? 'concept' : 'family';
      if (parent.level !== want) throw new Error(`item ${item.id}: a ${item.level} hangs under a ${want}`);
    }
    for (const d of [item.defaultDifficulty, ...Object.values(item.difficulty)]) {
      if (!(d >= lo && d <= hi)) throw new Error(`item ${item.id}: difficulty ${d} outside ${lo} to ${hi}`);
    }
    this.byId.set(item.id, item);
  }

  get(id: string): KnowledgeItem | undefined { return this.byId.get(id); }
  all(): KnowledgeItem[] { return [...this.byId.values()]; }

  install(id: string): void {
    if (!this.byId.has(id)) throw new Error(`cannot install unknown item ${id}`);
    this.installedIds.add(id);
  }
  remove(id: string): void { this.installedIds.delete(id); }
  isInstalled(id: string): boolean { return this.installedIds.has(id); }
  installed(): string[] { return [...this.installedIds].sort(); }

  /** The family an item belongs to. */
  familyOf(id: string): string {
    let it = this.byId.get(id);
    while (it && it.parent !== null) it = this.byId.get(it.parent);
    if (!it) throw new Error(`unknown item ${id}`);
    return it.id;
  }

  /** The item's chain to its family, item first. */
  chain(id: string): KnowledgeItem[] {
    const out: KnowledgeItem[] = [];
    let it = this.byId.get(id);
    while (it) { out.push(it); it = it.parent === null ? undefined : this.byId.get(it.parent); }
    return out;
  }

  difficulty(id: string, position: string): number {
    const it = this.byId.get(id);
    if (!it) throw new Error(`unknown item ${id}`);
    return it.difficulty[position] ?? it.defaultDifficulty;
  }
}

/** One player's part in a called play: the items his assignment uses. */
export interface Assignment {
  readonly player: number;
  readonly position: string;
  readonly items: readonly string[];
  /** Items changed at the line after the huddle (check, audible, shift, motion): D9.4.1 times 1.3. */
  readonly changedAtLine?: readonly string[];
}

/** A play as the knowledge model sees it: its items and who holds what. */
export interface CalledPlay {
  readonly id: string;
  readonly items: readonly string[];
  readonly assignments: readonly Assignment[];
}

export interface PlayWarning {
  readonly play: string;
  readonly item: string;
  readonly why: 'not_installed' | 'unknown_item' | 'unassigned_item';
}

/**
 * D9.1.1 acceptance: every assignment maps to known items; an item the playbook has not installed reads zero
 * knowledge and warns on the call sheet. An item no assignment uses is warned as unassigned.
 */
export function playWarnings(cat: ItemCatalogue, play: CalledPlay): PlayWarning[] {
  const out: PlayWarning[] = [];
  const used = new Set<string>();
  for (const a of play.assignments) for (const i of a.items) used.add(i);
  for (const id of [...new Set([...play.items, ...used])].sort()) {
    if (!cat.get(id)) out.push({ play: play.id, item: id, why: 'unknown_item' });
    else if (!cat.isInstalled(id)) out.push({ play: play.id, item: id, why: 'not_installed' });
    else if (!used.has(id)) out.push({ play: play.id, item: id, why: 'unassigned_item' });
  }
  return out;
}
