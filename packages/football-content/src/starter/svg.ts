// Formation reference image (F2, G1.1.3): an overhead diagram generated from the formation data, never
// stored by hand. Offense is drawn as circles with the center as a square. Pure string building.
import type { FormationDef } from './types.ts';

const W = 480, H = 220, SCALE = 12, CX = W / 2, LOS = 70;

function num(x: number): string { return (Math.round(x * 10) / 10).toString(); }

export function formationSvg(f: FormationDef): string {
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${f.name}">`);
  parts.push(`<rect width="${W}" height="${H}" fill="#f4f1e8"/>`);
  parts.push(`<line x1="0" y1="${LOS}" x2="${W}" y2="${LOS}" stroke="#2b4a2b" stroke-width="2"/>`);
  for (const p of f.players) {
    const x = CX + p.py * SCALE, y = LOS - p.px * SCALE;
    if (p.role === 'C') parts.push(`<rect x="${num(x - 8)}" y="${num(y - 8)}" width="16" height="16" fill="#fff" stroke="#111"/>`);
    else parts.push(`<circle cx="${num(x)}" cy="${num(y)}" r="8" fill="#fff" stroke="#111"/>`);
    parts.push(`<text x="${num(x)}" y="${num(y + 3.5)}" font-family="sans-serif" font-size="9" text-anchor="middle" fill="#111">${p.role}</text>`);
  }
  parts.push(`<text x="8" y="${H - 8}" font-family="sans-serif" font-size="11" fill="#333">${f.name} (${f.personnel}, ${f.structure})</text>`);
  parts.push('</svg>');
  return parts.join('\n');
}
