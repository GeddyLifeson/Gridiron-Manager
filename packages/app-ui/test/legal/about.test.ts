import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ABOUT_LEGAL, DISCLAIMER_PARAGRAPHS } from '../../src/legal/about.ts';

const ROOT = join(import.meta.dirname, '../../../..');

describe('About and legal text', () => {
  it('shows the same disclaimer as LEGAL.md', () => {
    const md = readFileSync(join(ROOT, 'LEGAL.md'), 'utf8').replace(/\r\n/g, '\n');
    const block = /<!-- in-game: disclaimer -->\n([\s\S]*?)\n<!-- \/in-game -->/.exec(md);
    expect(block).not.toBeNull();
    const paras = block![1]!.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
    expect(paras).toEqual([...DISCLAIMER_PARAGRAPHS]);
  });

  it('names the same copyright holder as LICENSE', () => {
    const lic = readFileSync(join(ROOT, 'LICENSE'), 'utf8');
    expect(lic).toContain(ABOUT_LEGAL.copyright.replace(' All rights reserved.', ''));
  });

  it('says the game is not affiliated with the NFL or the NCAA and that people are fictional', () => {
    const all = DISCLAIMER_PARAGRAPHS.join(' ');
    expect(all).toMatch(/not affiliated with, endorsed by/);
    expect(all).toMatch(/National Football League/);
    expect(all).toMatch(/National Collegiate Athletic Association/);
    expect(all).toMatch(/fictional/);
    expect(all).toMatch(/calibration/);
  });
});
