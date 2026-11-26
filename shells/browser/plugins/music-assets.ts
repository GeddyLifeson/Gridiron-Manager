// Menu music files for the browser build and the desktop web view. The PV-11 loops are rendered to
// `assets/music/<id>.ogg` at the repository root (MuseScore Studio renders); the sound stage loads
// them by that path relative to the page. This plugin copies them into the bundle at the same path
// (so the offline worker precaches them) and serves them in development. Only the .ogg renders ship:
// the scores and notes stay in the repository.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

export const MUSIC_URL_DIR = 'assets/music';

export async function musicFiles(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((f) => f.endsWith('.ogg')).sort();
  } catch {
    return [];
  }
}

export function musicAssetsPlugin(dir = fileURLToPath(new URL('../../../assets/music', import.meta.url))): Plugin {
  return {
    name: 'gm-music-assets',
    async generateBundle() {
      for (const f of await musicFiles(dir)) {
        this.emitFile({ type: 'asset', fileName: `${MUSIC_URL_DIR}/${f}`, source: await readFile(join(dir, f)) });
      }
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const m = /^\/assets\/music\/([\w-]+\.ogg)(\?.*)?$/.exec(req.url ?? '');
        if (!m || !(await musicFiles(dir)).includes(m[1]!)) return next();
        res.setHeader('Content-Type', 'audio/ogg');
        res.end(await readFile(join(dir, m[1]!)));
      });
    },
  };
}
