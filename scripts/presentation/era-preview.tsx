// PV-18 preview sheet: the Classic lamp board, segment clock, caption lower third, film looks and leader cards
// in three themes. Writes an HTML file; screenshot it with Playwright. Usage: npx tsx scripts/presentation/era-preview.tsx out.html
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { writeFileSync } from 'node:fs';
import { LampText, SegmentClock, LowerThird, filmLookCanvas, eraTokenVariables } from '../../packages/app-ui/src/presentation/era/index.ts';
import { cosmeticStream } from '../../packages/app-services/src/cosmetic/index.ts';
const out = process.argv[2]!;
function canvasSvg(w: number, hh: number, fn: (ctx: any) => void, under = '') {
  const rects: string[] = []; const ctx: any = { fillStyle: '', globalAlpha: 1, save() {}, restore() {}, fillRect(x: number, y: number, ww: number, hh2: number) { rects.push(`<rect x="${x}" y="${y}" width="${ww}" height="${hh2}" fill="${ctx.fillStyle}" fill-opacity="${ctx.globalAlpha}"/>`); } };
  fn(ctx);
  return `<svg width="${w}" height="${hh}" viewBox="0 0 ${w} ${hh}">${under}${rects.join('')}</svg>`;
}
const field = (turf: string) => `<rect width="480" height="270" fill="${turf}"/>` + Array.from({ length: 11 }, (_, i) => `<rect x="${20 + i * 44}" y="0" width="2" height="270" fill="#f7f3e6"/>`).join('') + `<circle cx="200" cy="130" r="7" fill="#8fb4e8"/><circle cx="260" cy="130" r="7" fill="#f2907a"/>`;
let body = '';
for (const theme of ['classic', 'light', 'high-contrast'] as const) {
  const vars = Object.entries(eraTokenVariables({ theme })).map(([k, v]) => `${k}:${v}`).join(';');
  body += `<section style="${vars};background:var(--gm-surface-bg);color:var(--gm-text-ink);padding:16px;margin-bottom:8px"><h3 style="font-family:system-ui;margin:0 0 8px">${theme}</h3>`;
  body += `<div style="display:flex;gap:12px;align-items:center">${renderToStaticMarkup(h(LampText, { text: 'HOME 21  VISITORS 17', sizePx: 36 }))}${renderToStaticMarkup(h(SegmentClock, { value: '12:34', sizePx: 48 }))}${renderToStaticMarkup(h(SegmentClock, { value: ':09', colour: 'alert', sizePx: 48 }))}${renderToStaticMarkup(h(LampText, { text: '3RD & 7', colour: 'alert', sizePx: 36 }))}</div>`;
  body += `<div style="margin-top:12px">${renderToStaticMarkup(h(LowerThird, { lines: ['TIMEOUT  HOME', '2 LEFT IN THE HALF'] } as any))}</div></section>`;
}
const scope = { gameId: 1, playNumber: 1 };
const film = filmLookCanvas('classic');
body += `<section style="background:#222;padding:16px;display:flex;gap:12px;flex-wrap:wrap">`;
body += canvasSvg(480, 270, (c) => film.drawLook(c, 480, 270, '16mm', cosmeticStream('abc', 'display', scope)), field('#2f5d25'));
body += canvasSvg(480, 270, (c) => film.drawLook(c, 480, 270, 'videotape', cosmeticStream('abc', 'display', scope)), field('#1f6b3e'));
body += canvasSvg(480, 270, (c) => film.drawLeader(c, 480, 270, { head: 'REEL 2  3RD QTR', lines: ['2ND AND 7  OWN 34'] }, '16mm'));
body += canvasSvg(480, 270, (c) => film.drawLeader(c, 480, 270, { head: 'TAPE 4  4TH QTR', lines: ['3RD AND 2  OPP 41'] }, 'videotape'));
body += `</section>`;
writeFileSync(out, `<!doctype html><html><body style="margin:0;background:#111">${body}</body></html>`);
