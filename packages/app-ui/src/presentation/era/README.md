# PV-18 Classic era skin

The 1970s and 1980s period look (presentation plan 2.1). A skin only: it carries no information, and the plain themes stay available.

- **Colours.** The Classic theme and the `era` colour group live in `tokens/tokens.json` with every other colour, so every check that loops over `THEME_IDS` (contrast, greyscale, icons, shell) covers Classic. Classic takes the dark colour-vision overrides (`VISION_BASE`). `field-surfaces.json` holds the two venue surfaces (grass, period artificial turf) that Classic lays over the field.
- **Faces, drawn by code, no font file.** `glyphs.ts` is a 5 x 7 bitmap drawn for this project. `lamp-font.ts` lays it out as round lamps and draws seven-segment clock digits. `cg-font.ts` emboldens it into the blocky uppercase caption face with a hard shadow. Components: `LampText`, `SegmentClock` (both take `colour: 'on' | 'alert'`), `CgText`, `LowerThird`, `LeaderCardView`.
- **Film looks.** `film.ts`: 16mm before the 1986 season and videotape from 1986 (fact status 2 of 3, flagged), still grain from `cosmetic.display`, vignette, tape lines, frame counter, leader titles. `film-canvas.ts` draws the look on a canvas for the film room's `FilmLookPort`. The look is off under reduced motion, high contrast and the plain film switch.
- **Preview.** `npx tsx scripts/presentation/era-preview.tsx out.html`, then screenshot it.

Change requests:
1. Settings owner: add `'classic'` to the `display.theme` options (app-services settings schema). Whether Classic is the default is open for Marlon.
2. Integrator: `export * as era from './presentation/era/index.ts'` in the app-ui barrel; export the cosmetic stream factory from the app-services entry so the era tests can use the real stream instead of `test/presentation/era/fake-cosmetic.ts`.
3. Film room (PV-12): pass `filmLookCanvas(theme, vision)` as the viewer's `look`.
