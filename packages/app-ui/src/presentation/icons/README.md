# Icon set (PV-13)

48 flat, thick-line, two-colour icons in the 1970s and 1980s print and TV-graphics style
(presentation-build-plan.md 2.1 and 3.6). Each icon is code in `glyphs.ts`: SVG primitives on a
24-unit grid with 2.5-unit lines, coloured only by token roles (ink, one tone, and the page colour
for knock-outs). No image files ship, so no `assets/LICENSES.json` row is needed. No AI tool
drew any of them. No team, league, broadcast or film-company marks.

Every icon has a text label and names the information it carries. `<Icon>` shows the label by
default; `label="hidden"` keeps it as the accessible name for rows that already print the words.
States: `normal`, `active`, `holding` (hold-to-confirm ring, O2.5.3) and `disabled`, which must
carry a visible reason (MB-15).

## Checks (test/presentation/icons.test.ts)

| Check | Rule | Status and sources |
| --- | --- | --- |
| Ink and tone against bg, panel and raised surfaces at 3:1, in all 3 themes x 4 colour-vision palettes | WCAG 2.2 SC 1.4.11 Non-text Contrast | Verified: W3C Understanding 1.4.11 (WCAG 2.2); WebAIM "Contrast and Color Accessibility"; floor already Verified in O5.5.1 |
| The injury icon is a plus in a ring in ink only; no colour on it is red in any theme or palette | The red cross on a white ground and any imitation of it are protected | Verified: Geneva Convention I art. 38 and art. 53 (ICRC text, "any sign or designation constituting an imitation thereof, whatever the object of such use"); 18 U.S.C. 706 (Cornell LII, "the emblem of the Greek red cross on a white ground, or any sign or insignia made or colored in imitation thereof"); British Red Cross "The emblem" ("The red cross emblem is not a first aid or medical sign") |

Context: in 2017 the British Red Cross asked the makers of the game Prison Architect to remove a
small red cross from ambulances and paramedics (PC Gamer). A new theme (such as the planned
Classic theme) is picked up by both checks automatically because they loop over `THEME_IDS`.

"Red" in the emblem check means HSL saturation at least 0.25 and hue within 30 degrees of 0
(`EMBLEM_RED`, an assumption of this package, chosen wide so that orange-reds also fail).
