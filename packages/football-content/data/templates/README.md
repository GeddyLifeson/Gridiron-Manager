# Text templates (G-32, P4.6.1, L6.2, H7.2)

`en/*.json` are `TemplateFile`s for the G-08 engine (`src/templates/`). Language `en`; the structure allows more later.

| File | Holds |
|---|---|
| `crisis.json` | A title and one inbox text per stage for each of the 16 crisis types. Level variants say owner or athletic director, league or school; a few carry rung variants. |
| `acts.json` | Label and detail text for the 13 response acts. |
| `warnings.json` | The L8.2.5 warnings shown before a rule-breaking response. |
| `media.json` | Public crisis headlines, death notices (age and years of life only, never a cause), the seven hot-topic questions, the eight stances and their digest headlines, the four injury answers, who-is-listening and reaction lines, background-talk choices, announcement and hold text, and the media-week line by rung. |

Each entry's `note` carries `guard=football`, `guard=personal` or `guard=none` (L9.1.2). The test checks it matches the catalogue row.

No template holds a quotation, a generated person's words, a diagnosis, a cause of death, a team mark or a real name. The test scans every text for them, using the project's blocked-terms list and the real-name guard hashes.
