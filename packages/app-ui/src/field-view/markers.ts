// Marker table lookup (O6.3.1). Data, not code: the table lives in markers.json.
import table from './markers.json' with { type: 'json' };

export type MarkerShape = 'circle' | 'square' | 'triangle' | 'diamond' | 'smallSquare';
export interface MarkerStyle {
  readonly shape: MarkerShape;
  readonly fill: 'filled' | 'open';
  readonly outline: 'normal' | 'heavy';
  readonly mark: 'none' | 'bar' | 'dot';
}
export interface MarkerTable {
  readonly groups: Readonly<Record<string, MarkerStyle>>;
  readonly roles: Readonly<Record<string, string>>;
  readonly fallback: { readonly offense: string; readonly defense: string };
}

export const DEFAULT_MARKERS = table as unknown as MarkerTable;

/** Marker row for a position code. Unknown codes fall back by side so offense and defense stay apart. */
export function markerFor(role: string, onOffense: boolean, t: MarkerTable = DEFAULT_MARKERS): { group: string; style: MarkerStyle } {
  const group = t.roles[role.toUpperCase()] ?? (onOffense ? t.fallback.offense : t.fallback.defense);
  const style = t.groups[group];
  if (!style) throw new Error(`marker table has no group ${group} (role ${role})`);
  return { group, style };
}

/** Short position letter drawn beside the marker (I9.1.1). */
export function positionLetter(role: string): string {
  return role.toUpperCase().slice(0, 4);
}
