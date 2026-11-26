# Presentation build plan: graphics and sound

Scope: everything the user sees and hears that is not a screen's data: the field, markers and play animation, broadcast-style overlays, the film room's look, interface art, and all audio. It extends `plans/game-build-plan.md` (G-00 to G-100) with packages `PV-00` to `PV-18`. Every rule in that file's sections 0 and 2 binds these packages (owned paths, integrator, checks, PRs, facts).

Written 2026-11-26 by the thread "Plan graphics and sound" from: O6 (presentation rules), O2.3 and O2.6 (field and film), O5.3.2 and O5.5 (settings, accessibility), I9 (game presentation), J12.6.1 (crowd noise), J13 (streams), A6 (legal lines), the Myth and Blood code review (`/mnt/project-files/myth-and-blood.md` section 10, MB-1 to MB-20, already merged into O6.4.1, O5.3.2, O5.5.2 and J12.6.1), and the merged G-03 field view (`packages/app-ui/src/field-view/`).

## 1. Ground rules (what binds every package)

1. **Realism first.** Marlon (2026-11-25): how the game plays matters more than how it looks; light play animation is wanted. O6.1.1: presentation work goes in this order: (1) marker legibility, (2) route, assignment and coverage overlays, (3) call sheet reading speed, (4) dense tables, (5) film controls, (6) everything else. Each package below carries its rank. No character art, 3D or visual effects before the Q2 and Q3 gates pass.
2. **Every visual and every sound names the football information it carries.** If it carries none it is deferred or cut. The cue table (PV-02) has a required "information" column.
3. **The engine is the only source of motion and of game sound timing.** Field motion is playback of engine positions (O6.4.1). Every field cue and every game sound fires on the exact engine tick of its event (MB-1). Crowd level is the engine's `noise` (MB-6). No sound or visual is ever triggered by a script's idea of drama.
4. **Nothing on the live field delays or embellishes.** No screen shake, hit-stop, slow motion, screen flash, gore or streak banners during play (O6.4.1, MB "do not copy"). Slow motion, freeze frames and drawing on film live only in the film room (O2.6).
5. **No truth leaks.** Overlays and sounds during a game use only sources tagged "user-visible" (I9.3.2). A crowd reacts to the ruling on the field (B11), never to the truth layer. True ratings are never drawn (MA-48).
6. **No music during play.** Music plays only in menus, the week and career screens (MB-11).
7. **Code first.** Every graphic and sound is drawn or synthesized by code in the repository, so it rebuilds from source with no files to license. Recorded or licensed assets are an optional later layer, each with a licence row (section 5), and every recorded cue keeps a synthesized fallback (MB-18).
8. **Legal lines (A6).** No real team names, logos, uniforms, mascots, slogans, photographs, headshots or voices. Teams are generated text plus simple generated shapes in generated colours. The schema has no image field for team marks (P3.2.1). No recognisable songs or chants.
9. **Cosmetic randomness never touches the game.** Section 6.
10. **Accessibility is part of each package, not a later pass.** Section 7.

## 2. Visual style

Plain, flat, functional: a coaching whiteboard and an all-22 film cut-up, not a broadcast video game. One typeface family with tabular figures (O6.2.1). Colours come only from design tokens (`packages/app-ui/src/tokens/tokens.json`); a lint fails on any literal colour. Three themes (light, dark, high contrast) and three colour-vision palettes (O5.5.1). Colour is never the only signal: team is also outline style, position group is shape, state is icon or text.

Typeface: the system UI font stack for body text and tables (no font file, nothing to license). The two period display faces in 2.1 are drawn by code. A bundled font is allowed only under the SIL Open Font License with its licence file and a register row (section 5).

## 2.1 Era look: classic 1970s and 1980s pro football (Marlon, 2026-11-26 04:59 UTC)

Marlon: "use stuff authentic to classic 70s/80s NFL". The look and sound take their style from 1970s and 1980s pro football. This is a skin only. The rules stay modern ("the rules have always been the rules"), and every piece of football information in sections 3 and 4 is unchanged. The era look is the default theme ("Classic"). The plain light, dark and high-contrast themes stay available, and the era look must pass the same contrast, greyscale and legibility tests (O5.5.1). Under O6.1.1 the skin carries no information of its own, so it may never make information harder to read. If it does, the plain style wins.

**Period facts behind the look** (status per A5; research on 2026-11-26 from the pages named; nothing here is a game rule):

| Fact | Status | Sources |
| --- | --- | --- |
| US NFL broadcasts had no permanent on-screen score box until Fox's "Fox Box" in the 1994 season | Verified | Wikipedia "Score bug"; Awful Announcing, scorebug 30th anniversary; Grantland "Score" |
| TV text in the period came from character generators, mainly as lower-third captions; the Chiron IV (1977) was the workhorse of mobile sports graphics from the late 1970s through most of the 1980s | 2 of 3 (lower thirds: Verified) | Wikipedia "Chyron Corporation"; ChyronHego "50 years of character generation"; TV Technology "Tracing the evolution of television's electronic graphics" |
| Early character-generator text was blocky: the 1967 Videograph had one uppercase-only, slightly jagged font with no proportional spacing; the 1972 Chiron II added up to six loadable fonts | 1 of 3 | TV Technology (as above) |
| Coaches studied 16mm film in the 1970s; the NFL moved coaching film to videotape in 1986 | 16mm: Verified; 1986: 2 of 3 | NFL.com film study article; Athletic Business, January 1992; Chiefs "Hank Stram's 16mm projector" (16mm only) |
| Officials used pea whistles before the pealess Fox 40, first used professionally at the 1987 Pan Am Games | 1987: Verified; pea whistles before: 2 of 3 | Fox 40 company history; Sportskeeda whistle history; Refereeing World blog |
| Stadium scoreboards were large lamp (light-bulb) boards; the first big video board (Diamond Vision) arrived in 1980 | Lamp boards: 1 of 3; 1980: 2 of 3 | Mental Floss "100 years of scoreboard watching"; Wikipedia "Jumbotron"; Daktronics company history |
| Stadium organs and marching bands played during stoppages in the period | Assumption (not researched yet; PV-10 checks it before use) | none |

**What the era look means for each part:**
- **Score strip.** No broadcast score box existed in the period, but the game needs the score always visible (O2.1). So the strip is drawn as a stadium **lamp scoreboard**: a grid of round lamps in amber or white on a dark panel, with segmented clock digits. Everything on it is the same public game state as 3.4.
- **Banners and stoppage text.** These are drawn as **character-generator lower thirds**: a code-drawn blocky uppercase display font with a hard drop shadow, flat colour bars, cut on and off with no motion (O6.4.1). They follow the same banner-queue rules.
- **Field.** Flat grass or period artificial-turf colour (by venue), painted numbers in a blocky stencil style, a plain end zone with the generated team name in block letters. Markers stay O6.3.1 shapes, with period team colours from the generator (two flat colours, no gradients).
- **Film room.** A **16mm coaching-film look** for seasons before 1986 in the world history, and a **videotape look** from 1986 on: still grain (a fresh grain pattern each frame from `cosmetic.display`, never moving marker positions), a soft vignette, reel leader title cards ("REEL 2  3RD QTR"), and a frame counter in the corner. No gate weave or jitter, because that would move positions. Grain and vignette turn off under reduced motion and high contrast. A "plain film" switch removes them.
- **Sound.** A pea-whistle trill (a warble in the synthesized whistle), a period-feel crowd bed (the same engine-driven level), and a 16mm projector run sound on the ambience bus in the film room, optional and off by default. Stadium organ stings and band hits in stoppages only, once the period fact is checked. Referee announcements stay text, now drawn as character-generator lower thirds.
- **Menu music.** Original brass and orchestral pieces in a period sports-film style, composed in code. **No NFL Films music**, no imitation of any specific piece or composer, and no real broadcasters' voices or catchphrases.
- **Icons.** Flat, thick-line, two-colour, in the period's print and TV-graphics style.
- **Never:** NFL or team marks, the NFL shield, real uniforms, real stadium names, real broadcaster names or voices, NFL Films footage or music, or trade dress copied from a real broadcast package.

## 3. Asset list: graphics

Each row: what it is, the football information it carries, how it is made, rank (O6.1.1), phase (R1: v1 ships first; v2 after).

### 3.1 Field (O2.3.1, I9.1.1; extends G-03)

| Asset | Information carried | Made by | Rank | Phase |
| --- | --- | --- | --- | --- |
| Turf surface, flat token colour | Background contrast for markers | Token | 1 | v1 (done in G-03) |
| Yard lines, hash marks, numbers, goal posts, boundary, end lines from the rulebook (`markings.json`, NFL Rule 1-2, PROVISIONAL per G-03 notes) and the college set (B13; values owed, CR-G03-3) | Distance and spot; hash position matters to play calling | Code, from rule data | 1 | v1 |
| Mowing stripes every 5 yards, very low contrast, off in high contrast | Faster distance reading between yard lines | Code | 6 | v2 |
| Line of scrimmage and line to gain, kept until the next snap (MB-3) | Where the ball is and how far to go | Code | 1 | v1 |
| End zone and midfield team name text in generated colours | Which end each team defends | Code, generated names (A6) | 6 | v1 |
| Weather layer: rain or snow streaks, field wetness tint, from the engine's weather and footing state (J12) | Footing and ball security conditions | Code; particle positions from the cosmetic stream (section 6) | 6 | v2 |
| Wind arrow and speed on the strip, from the engine's wind and gust values (J12.3) | Kicking and deep-ball conditions | Code | 4 | v1 |
| Day, dusk, night tint by kickoff time | None beyond the clock; deferred unless it aids contrast | Token variant | 6 | deferred |

### 3.2 Players, ball and markers (O2.3.2, O6.3.1, I9.1.2)

| Asset | Information carried | Made by | Rank | Phase |
| --- | --- | --- | --- | --- |
| Position-group markers (O6.3.1 shape table, `markers.json`), jersey number, facing tick, team outline style | Who is where and facing which way; the pre-snap look | Code (done in G-03) | 1 | v1 |
| Ball marker with size and shadow by flight height | Ball height: catchable, tipped, over a defender | Code | 1 | v1 |
| Ball carrier ring | Who has the ball | Code | 1 | v1 |
| Contact bar, thickness in 3 or 4 tiers from the J6 contest result (MB-2) | How hard the hit was: ball security and injury exposure | Code | 2 | v1 (needs PV-00) |
| Tackle flatten (marker squashes on the tackle tick) | Down by contact, the play's end spot | Code | 2 | v1 |
| Flag icon at the foul spot, whistle ring at the dead-ball tick | A foul and where; when the play ended | Code | 2 | v1 |
| Merged on-field text: yards, FLAG, UNDER REVIEW; one size at any zoom, no stacking, repeats merge as "FLAG x2" (MB-4) | The result | Code | 2 | v1 |
| **Figure mode** (optional view): top-down player silhouettes (helmet circle, shoulder ellipse, number), shoulders turn with the engine's body facing, simple stride by speed | Body orientation (hips and shoulders), leverage, pursuit angles: the "light play animation" Marlon asked for | Code-drawn vector shapes, driven only by engine trajectory fields | 6 | after Q2 and Q3 (O6.1.1) |

The current G-03 cue list (`cues.ts`: passLine, ring, cross, flash, flag, whistle, boundary) has two items the O6.4.1 list does not name (`passLine`, `boundary`) and one name that clashes with the no-flash rule (`flash` for a fumble). PV-04 reconciles code and bible: rename `flash` to a loose-ball ring with no brightness change and ask the bible thread to list throw line and boundary mark as allowed cues (amendment A-4, section 10).

### 3.3 Overlays during a game (I9.3.2; only "user-visible" sources)

| Asset | Information carried | Rank | Phase |
| --- | --- | --- | --- |
| Own call drawn before the snap: routes, blocking, the read; own defense's assignments (O6.3.2 line symbols) | What was called | 2 | v1 |
| Own personnel and formation labels | Grouping and formation | 2 | v1 |
| Kicking lines: field goal spot and distance, punt aim area (own call) | Kick decision inputs | 2 | v1 |
| Booth labels drawn as said, with the speaker's name (I7.2.1) | What the booth thinks it saw, with its source | 2 | v1 |
| Chart counts on hover over an opponent formation, as charted with errors (I7.4.1) | Tendency read | 4 | v1 |
| Pre-play intel card, hedged words, never a true count (MB-5) | Scouting estimate (D6) | 2 | v1 |

### 3.4 Broadcast-style strip and banners (O2.1.3, MB-14)

The strip is the console's score bug, always visible, text and shapes only:

| Asset | Information carried | Rank | Phase |
| --- | --- | --- | --- |
| Score bug: team short names in generated colours, score, quarter, game clock, play clock, down and distance, ball spot, timeouts as dots, possession mark | Public game state | 1 | v1 |
| Noise meter, reading the same `noise` that drives the crowd sound | Silent-count and relay pressure (J12.6.1) | 2 | v1 |
| Wind indicator (3.1) | Kicking conditions | 4 | v1 |
| Banner queue: kickoff, quarter end, two-minute warning, score, timeout, challenge, review result, injury timeout. One bar at a time, ranked, skippable by click or Escape, half length and still under reduced motion, timed on the wall clock, never shown while the play clock is under 10 s | Game events | 3 | v1 |
| Penalty card text: foul, player number, enforcement, accept or decline outcome (O2.4.3) | The penalty and its options | 2 | v1 |
| Stoppage panels: drive summary, game stats, injury report as published. Shown only during stoppages (I9.2.2) | Between-play context | 4 | v1 |

### 3.5 Film room (O2.6, N1, I9.3.1; extends G-63)

| Asset | Information carried | Rank | Phase |
| --- | --- | --- | --- |
| Transport: play, pause, frame step, 0.25 / 0.5 / 1 / 2 speed, scrub, loop a range (G-03 `SPEEDS` lacks 0.25; G-63 has its own; PV-12 unifies them) | Detail of timing and technique | 5 | v1 |
| Freeze on a chosen tick with a hold marker; slow motion; instant replay of the last play in a stoppage (I9.3.1) | Study of the decisive moment | 5 | v1 |
| As-run against as-drawn overlay (routes, protection), shown after the game only | Execution errors | 2 | v1 |
| Staff inference of the opponent's call, with confidence mark, never as truth (O2.6.2) | What the staff believes | 2 | v1 |
| Telestrator: the user draws lines, circles and arrows on a frozen tick; drawings save with the cut-up | Teaching and self-scout notes (N1) | 5 | v2 |
| Spotlight on one player (others dimmed) | Grading one player's technique | 5 | v1 |
| Cut-up title cards: plain text cards between clips | Clip context (down, distance, call) | 5 | v1 |

### 3.6 Interface art (O6, O2.5)

| Asset | Information carried | Made by | Rank | Phase |
| --- | --- | --- | --- | --- |
| Icon set (about 40): timeout, challenge flag, whistle, injury, review, weather kinds, wind, possession, call confirm, warning, lock, film, notebook, phone, and so on | State at a glance, always paired with text or a label | Code-drawn SVG from tokens | 3 | v1 |
| Injury icon: a plus in a circle in a token colour, never a red cross on white (the Red Cross emblem is legally protected; status: 1 of 3, to be checked in PV-13) | Injury | Code | 3 | v1 |
| Disabled choices stay visible with the reason ("no timeouts left", "illegal: 12 on field") (MB-15) | Why an action is not available | Code | 3 | v1 |
| Hint bar names the keys for the current state (MB-13, O2.5.2) | Input speed | Code | 3 | v1 |
| Generated team identity: name, colours (two plus an alternate, contrast-checked), a simple generated shape (stripe pattern or geometric badge from a small grammar), never a logo | Telling teams apart | Code, seeded by the world (not cosmetic: identity is part of the save) | 6 | v1 |
| Diagrams in the play and defense designers (O3.1, O3.2): same markers and line symbols as the field | Assignments | Code (shared component) | 2 | v1 |

## 4. Asset list: audio

Audio is sparse by design (O5.3.2). Every sound has a visual twin (O5.5.2) listed in the cue table. All sounds are synthesized at run time with the Web Audio API from recipes stored as data in the repository; no audio files ship in v1.

### 4.1 Buses (mixer groups, each with its own volume and off switch)

`master`, `crowd`, `officials` (whistle, referee mic tone), `contact`, `cadence`, `ui`, `ambience` (stadium, weather), `music`. This splits the current `audio.whistleCrowd` setting in `app-services/src/settings/schema.ts` into `crowd` and `officials` and adds four buses (amendment A-3).

### 4.2 Sound list

| Sound | Bus | Driven by (engine or UI source) | Information carried | Phase |
| --- | --- | --- | --- | --- |
| Crowd bed | crowd | Level equals J12.6.1 `noise` for the play, eased between plays only; home or away perspective by the user's team | When the road offense is in a silent-count situation; the sound is the meter | v1 |
| Crowd reaction, one per play from a ranked list: touchdown, turnover, big gain, sack, flag against home, review reversal (MB-7) | crowd | The ruling on the field (B11 events), priority queue | Which way the play went | v2 |
| Pre-snap crowd swell on the visitor's third and fourth down | crowd | Falls out of `noise` itself (`situationFactor`), no separate script | Same as the bed | v1 |
| Whistle: dead ball, foul stoppage, inadvertent whistle where the engine models one | officials | Engine whistle event tick | The play is over | v1 |
| Referee mic tone before an announcement, with the announcement as text on the booth line (no voice) | officials | Penalty and review result events | A ruling is coming | v1 |
| Snap cue: a short thump on the snap tick | contact | Engine snap event | The play started | v1 |
| Contact by tier: 3 or 4 synthesized thuds, rate-limited so a pile-up is one sound, a few pitch variants (MB-9) | contact | J6 contest result tier on the contact tick | How hard the hit was | v2 (needs PV-00) |
| Ball sounds: catch, drop, kick foot strike, upright or crossbar hit | contact | Engine catch, drop, kick and post events | Ball outcome | v2 |
| Cadence: the quarterback's count as rhythmic voice-like tones (no words), hard counts audible, a silent count makes no sound; under high `noise` on the road the cadence is masked by the crowd bed naturally | cadence | J5 pre-snap events (cadence, hard count, silent count, snap) | Snap timing; hearing a hard count; why the road line is late | v1 |
| Call relay tone when the call reaches the huddle; a garbled relay plays a broken tone (I2.4.1) | cadence | J5.1.3 and I2.4.1 relay events | The call got in, or did not | v1 |
| Play clock tick under 10 s (optional, off by default, exists) with a visible pulse | ui | Play clock | Time pressure | v1 |
| Call confirm: two-note tone when a call is sent; optional quiet hover tick; one per 120 ms at most (MB-12) | ui | Console input | The call was taken | v1 |
| Alerts: injury, challenge window, timeout called, two-minute warning | ui | Game events | Something needs a decision | v1 |
| Stadium ambience between plays: generic PA chime, generic band hits, only in stoppages, never real songs | ambience | Stoppage state | None beyond setting; off by default, rank 6 | v2 |
| Weather: rain bed, wind level from engine wind speed, gust swells on the engine's gust values (J12.3.1) | ambience | Engine weather and gust state | Conditions for kicks and throws | v2 |
| Menu music: a few short loops (title, week hub, career and offseason screens) composed by a script in the repository and synthesized; a route check refuses music on game-calling and film routes | music | Route | None (allowed only off the field) | v2 |

Mix rules from O5.3.2 (already in the bible): ducking of the crowd to about half for up to 2.5 s under the mic tone, play clock warning and alerts, returning over about 1 s (MB-10); pan by the event's field x relative to the view centre, width about 0.7 (MB-8); no rubber-band mix.

## 5. How assets are made, and the licence register

1. **Code first.** Graphics are SVG or Canvas drawn from tokens and data files. Sounds are Web Audio graphs built from recipe data (oscillators, filtered noise, envelopes). Recipes live with the code (`packages/app-ui/src/audio/recipes/`), so every sound is reviewable text.
2. **Offline rendering (optional, v2).** If decoded files help performance or a richer sound is wanted, a script renders recipes to Ogg files in a batch (Myth and Blood's `tools/sfx/` pattern, MB-19). Rendered files are build outputs, rebuilt from the recipes, and keep the live synthesized fallback.
3. **Licensed assets (only if ever needed).** Allowed: CC0 or public-domain dedications for audio and images; SIL OFL for fonts; MIT, BSD or Apache code. Not allowed: non-commercial, no-derivatives, "royalty-free" licences that bar redistribution, unknown provenance, or anything with real team, player, song or chant content. Real crowd recordings need a licence check and a content check (no team names chanted).
4. **AI-generated assets.** Only for art that carries no football information (concept art, mood boards, possibly title-screen art). Only from a service whose terms allow commercial redistribution, with the model, terms and prompt recorded in the register. Never a real person's likeness or voice, never a real team, stadium or broadcast.
5. **Tools available to the PV threads (Marlon, 2026-11-26: "you have tools and skills to help as well").** Code stays the source for anything that carries football information. These tools are for producing, previewing and checking assets, and for art that carries no information (title screen, mood boards). Every file a tool produces that ships in the game gets a register row. Any AI-generated file records its model, the service's terms link and the prompt, and passes the A6 checks (no real marks, people, voices, stadiums or broadcasts).

   | Tool | Best use here | Ships in the game? |
   | --- | --- | --- |
   | `frontend-design` skill | Styling screens, the Classic theme's tokens, lower-third and lamp-scoreboard components (PV-05, PV-18) | Yes, as code |
   | `dataviz` skill | Tendency tables, charts, analytics and self-scout visuals (O3.6, N2), in the era palette | Yes, as code |
   | `codesign` (IMG.LY CoDesign) | Drafting icons, title cards, reel leaders and mood boards; exports SVG or PNG (PV-13, PV-18) | SVG exports may ship if redrawn into token colours; its AI generation counts as AI assets |
   | `animation-studio` skill | Title and menu animations with code-made sound; offline rendering of sound recipes (PV-07, PV-11) | Yes, if the output is rebuildable from the repo |
   | `image-generation` and `art-suite` skills, OpenArt connector (images and video) | Concept art and the era mood board; possibly title-screen art | Only non-information art, with a register row (model, terms, prompt) |
   | MuseScore Studio 4 and music21 (PC) | Draft the menu loops as scores, then port the notes into code recipes (PV-11) | No; the code recipe ships |
| SoundCraft (PC, alpha) | Reference listening and editing for sound recipes; the cloud has no audio output (PV-07, PV-10) | Files only with a register row |
| VectorCraft (PC, alpha) | Icon and field-art sketches, redrawn into token SVG (PV-13, PV-03) | No; the token SVG ships |
| Playwright with soundfile, numpy and Pillow (PC) | Offline Web Audio renders with peak and RMS checks, screenshots, greyscale and contrast checks (PV-04, PV-05, PV-07, PV-17). True LUFS loudness needs a library that is not installed, so PV-07 sets its loudness check with RMS until one is added | Test tools only |
| Blender (PC) | Pose reference for figure mode, only after the Q2 and Q3 gates (PV-16) | No |

   Full list: `/mnt/project-files/pc-tools-inventory.md` (2026-11-26; installed versions read from the registry, command lines unverified until first use). ffmpeg, ImageMagick, Inkscape and SoX are not on the PC's PATH, and no package needs them.

6. **Register.** `assets/LICENSES.json`, one row per non-code asset file: path, sha256, source URL, licence id, author, date retrieved, and for AI assets the model and prompt. PV-15 adds a checker the release gate (G-100) calls: every file under an asset folder has a row and every row's file exists; the existing name and mark scan also covers image files.

## 6. Cosmetic randomness, kept apart from the game

Problem (MB-16): Myth and Blood found that sharing one random stream between the game and its effects made seeded runs differ.

Design:
- **Two cosmetic streams**, `cosmetic.display` and `cosmetic.audio`, keyed `hash(worldSeed, 'cosmetic', channel, game, play)` with engine-core's stream generator, built in `app-services` (app-ui cannot import engine-core) and handed to app-ui by a small factory. Variation draws (crowd timing, pitch variants, rain particle positions, stride phase) use only these.
- **One way only.** Nothing in a core package reads a cosmetic stream, and no cosmetic value is written into game state. The stream key includes the play, so replaying a play in film gives the same crowd and the same rain, and the user's film is consistent.
- **No platform random in presentation.** A lint rule extends the forbidden-call check to `app-ui` and `app-services`: no `Math.random`, no `crypto.getRandomValues` for presentation. Wall-clock time is allowed only for banner timing and input, never for game sound timing.
- **J13 catalogue.** The bible's stream table gets a `cosmetic` row marked presentation-only (amendment A-2), so the reserved name never collides with an engine stream.
- **Tests.** (1) Same seed gives identical game results on all three performance tiers with audio on and off and with the cosmetic seed changed (O5.3.2 acceptance plus MB-16). (2) A play replayed twice produces identical cosmetic draw sequences. (3) The lint fails a planted `Math.random` in app-ui.

## 7. Accessibility

Already in the bible (O5.5.1, O5.5.2) and enforced per package:
- Every sound has a visual twin in the cue table; a test fails a sound row with no visual row.
- Reduced motion replaces playback with stills at each event tick, removes transitions and halves banners; each field cue has its own switch.
- Text contrast at least 4.5 to 1 in every theme (WCAG 2.2 SC 1.4.3, Verified in O5.5.1); greyscale screenshot test on the field.
- Screen reader text for each play result and a table equivalent of the pre-snap look.

New in this plan (amendments A-3 and A-6):
- **Per-bus volume** (4.1) and a **mono** switch (pan collapsed) for single-sided hearing.
- **Captions strip**: a short line naming each game sound as it plays ("whistle", "crowd rising", "hard count"), on by default when audio is off.
- **No flashing**: nothing on screen flashes more than three times in any one second (WCAG 2.2 SC 2.3.1, Three Flashes or Below Threshold; status in this plan: 1 of 3, PV-14 verifies it before it is cited as a rule).
- **Loudness**: all synthesized sounds normalised to one loudness target so no bus jumps; the target value is an Assumption to be set in PV-07 and checked by the mix test.
- No accessibility setting pauses or slows game time (Marlon, 2026-11-25).

## 8. Work packages

Same table format as game-build-plan.md section 5. "Rank" is the O6.1.1 order. Owned paths follow section 2 of that file; a package never edits barrels, package-map, golden, `packages/schema`, `test-results/` or settings shared with another package without the integrator.

Model policy (game-build-plan.md section 0): Fable for genuinely hard modules, Opus for normal feature code and UI, Sonnet for data, content tables and test scaffolding.

### PW1: can start now (9)

| WP | Title | Bible | Owns | Needs | Acceptance | Rank | Model |
|----|-------|-------|------|-------|------------|------|-------|
| PV-00 | Presentation contract requests | J6, J12.6.1, J5, B11, I9.3.2 | change requests to the integrator; `packages/app-services/src/presentation/feed/` adapter and tests | main | Integrator has CRs for: contest tier on contact events, `noise` and wind on each play record, J5 cadence, hard-count, silent-count and relay events, ruling events for crowd reactions, the "user-visible" tag on every overlay source. Adapter turns a play record into a typed presentation feed; fixture tests pass | 1 | Opus |
| PV-01 | Cosmetic random streams and lint | J13, P1.1.1, MB-16 | `packages/app-services/src/cosmetic/`; lint rule request to the integrator | main | Section 6 tests 1 to 3 pass | 1 | Opus (small; determinism test is the hard part) |
| PV-02 | Cue table and feel tests | O5.5.2, O6.4.1, MB-1, MB-20 | `packages/app-ui/src/presentation/cues/` (`cue-table.json` plus tests) | main | One row per engine event kind: visual cue, sound, bus, caption text, setting switch, information carried; tests: every event with a cue has a visual twin, no row lacks "information", stingers never overlap | 2 | Sonnet: data table and tests |
| PV-06 | Audio engine core | O5.3.2, MB-7, MB-8, MB-10, MB-18 | `packages/app-ui/src/audio/engine/` | main | Web Audio graph with the 8 buses, ducking, pan, per-sound rate limiter, ranked queue, synthesized fallback path; runs against a fake audio context in tests; no sound when a bus is off | 6 | Opus |
| PV-07 | Synthesized sound recipes | O5.3.2, MB-9, MB-12, MB-19, 2.1 | `packages/app-ui/src/audio/recipes/` | PV-06 | Every sound in 4.2 has a recipe in the era style of 2.1 (pea-whistle warble, period crowd, projector run, organ only once PV-10 checks the fact); offline render test measures each recipe's peak and loudness inside the target; pitch variants draw from `cosmetic.audio` | 6 | Opus |
| PV-11 | Menu music | MB-11, 2.1 | `packages/app-ui/src/audio/music/` | PV-06 | 3 or 4 short original brass and orchestral loops in a period sports-film style, composed in code; no NFL Films music and no imitation of a specific piece or composer; route test: no music on game-calling, film or any route under the game frame | 6 | Opus |
| PV-13 | Icon set and interface states | O6.2, O2.5.2, O2.5.3, MB-13, MB-15, 2.1 | `packages/app-ui/src/presentation/icons/` | main | About 40 SVG icons from tokens in the flat, thick-line, two-colour period style, each with a text label; contrast check in all themes and palettes; injury icon checked against the protected-emblem rule with 3 sources | 3 | Opus |
| PV-15 | Asset licence register and checker | A6, P4, G-100 | `assets/LICENSES.json`, `scripts/assets/check-licences.mjs` | main | Rows hold model, terms link and prompt for AI assets; checker passes on the empty register, fails a planted unlisted file and a planted row with a disallowed licence; G-100 thread told how to call it | 6 | Sonnet: scripted check |
| PV-18 | Classic era skin | 2.1, O6.2, O5.5.1, O2.6 | `packages/app-ui/src/presentation/era/` (Classic theme tokens, lamp-grid font, character-generator font, film grain and leader cards) | main; PV-05 and PV-12 consume it | Both display fonts drawn by code with no font file; Classic tokens pass every contrast and greyscale test; grain draws from `cosmetic.display`, never shifts a marker, and turns off under reduced motion and high contrast; 16mm look before 1986 and tape look after in the world calendar; a scan finds no NFL or real-broadcast names or marks | 6 | Opus |

### PW2: after the named PW1 packages and engine events (8)

| WP | Title | Bible | Owns | Needs | Acceptance | Rank | Model |
|----|-------|-------|------|-------|------------|------|-------|
| PV-03 | Field art pass | O2.3.1, O2.3.5, I9.1.1, MB-3, MB-4 | `packages/app-ui/src/field-view/` (field drawing files only) | G-03 (merged), PV-02 | Line of scrimmage and line to gain persist to the next snap; merged text never stacks at any zoom; college markings when CR-G03-3 lands; weather layer from engine state; stripes off in high contrast; 60 fps kept (P6) | 1 | Opus |
| PV-04 | Field cues by contact tier | O6.4.1, MB-1, MB-2, MB-17 | `packages/app-ui/src/field-view/` (cue files only; serialised after PV-03, same folder) | PV-00, PV-02, PV-03 | Cues fire on the event tick (test at tick boundaries); contact bar tier equals the engine tier; `flash` replaced by a loose-ball ring; each cue has a switch | 2 | Opus |
| PV-05 | Score bug, noise meter and banner queue | O2.1.3, J12.6.1, MB-14 | `packages/app-ui/src/presentation/strip/`, `packages/app-ui/src/presentation/banners/` | PV-00, PV-02, G-60 console layout | Strip shows every 3.4 item; banner queue tests: one at a time, ranked, Escape skips, nothing shown with the play clock under 10 s; reduced motion halves and stills | 1 | Opus |
| PV-08 | Crowd driver | J12.6.1, B11, MB-6, MB-7 | `packages/app-ui/src/audio/crowd/` | PV-00, PV-06, PV-07 | Bed level tracks `noise` (correlation test over a recorded game); reactions follow ruling events only; home and away perspective right; one reaction per play | 2 | Opus |
| PV-09 | Cadence and call relay audio | J5.1.3, J5.6.1, I2.4.1 | `packages/app-ui/src/audio/cadence/` | PV-00, PV-06, PV-07 | Cadence tones on the engine's cadence ticks; silent count is silent; hard counts audible; relay garble plays the broken tone; masked under high road `noise` by the mix, not by a rule | 2 | Opus |
| PV-10 | Stadium and weather ambience | J12.2, J12.3.1 | `packages/app-ui/src/audio/ambience/` | PV-00, PV-06, PV-07 | PA and band only in stoppages; wind and gust follow engine values; off by default | 6 | Sonnet: small, recipe-driven |
| PV-12 | Film room presentation | O2.6, N1, I9.3.1 | `packages/app-ui/src/screens/film/` presentation files, by agreement with the G-63 owner | G-63 merged, PV-02 | One speed table (0.25 to 2) shared with G-03; freeze, slow motion, spotlight, title cards, as-run overlays; telestrator saves with the cut-up; none of these appear on the live field (route test) | 5 | Opus |
| PV-14 | Audio and motion accessibility | O5.3.2, O5.5.1, O5.5.2 | settings changes sent to the G-98 owner; `packages/app-ui/src/presentation/captions/` | PV-02, PV-06, G-98 | 8 bus volumes and mono in settings; captions strip; flash-rate check verified with 3 sources then enforced by test; every sound row has a visual twin | 3 | Opus |

### PW3: after the gates (2)

| WP | Title | Bible | Owns | Needs | Acceptance | Rank | Model |
|----|-------|-------|------|-------|------------|------|-------|
| PV-16 | Figure mode (light play animation) | O6.1.1, O6.4.1, I9.1.2 | `packages/app-ui/src/field-view/figures/` | Q2 and Q3 gates pass, PV-04 | Top-down figures driven only by engine trajectory fields (position, facing, speed); marker-to-figure test finds no position difference at ticks; toggle off by default; 60 fps on the P6.2 machine | 6 | Opus |
| PV-17 | Presentation QA suite | Q1, O5.5, MB-20 | `packages/app-ui/test/presentation-qa/` | PW2 | Screenshot set per theme and colour-vision palette; greyscale and contrast checks; offline audio mix test (levels, ducking, overlap); same-seed test with audio on and off on all three tiers; long runs on Marlon's PC | 1 | Sonnet: test scaffolding |

### Model summary

| Model | Packages |
|-------|----------|
| Fable | none (no package here is core simulation or AI; PV-01's determinism risk is covered by its tests) |
| Opus | PV-00, PV-01, PV-03, PV-04, PV-05, PV-06, PV-07, PV-08, PV-09, PV-11, PV-12, PV-13, PV-14, PV-16, PV-18 (15) |
| Sonnet | PV-02, PV-10, PV-15, PV-17 (4) |

## 9. Open items for Marlon

1. Classic era look as the default theme (plan: yes, with the plain themes one setting away). Body text stays in system fonts; the period display faces are drawn by code.
2. Spoken words: the cadence and referee announcements use tones plus on-screen text, no voice. A generated (not real-person) voice is possible later if wanted.
3. Figure mode after the gates: wanted, or keep markers only.
4. Whether menu music is wanted at all (default plan: on in menus, user volume).

## 10. Bible amendments sent to "Apply bible fixes from modules"

- A-1 O6 new leaf O6.8 "Asset sources": sections 1 items 7 and 8 and section 5 (code first, licence register, allowed licences, AI-asset rule).
- A-2 J13.2.1: reserved `cosmetic` stream row, presentation only, never read by core, keyed per play (section 6).
- A-3 O5.3.2: eight audio buses replace "whistle and crowd cues"; mono switch; captions strip.
- A-4 O6.4.1: allowed cue list adds throw line and boundary mark (already drawn by G-03); a fumble is a loose-ball ring, not a flash; film-only effects listed (slow motion, freeze, spotlight, telestrator).
- A-5 J5, J6, J12 outputs: cadence, relay, contact tier and wind values exposed read-only to presentation, like the MB-6 `noise` amendment.
- A-6 O5.5.2: three-flash limit (to be cited only after PV-14 verifies it).
- A-7 O6.2 and O5.3.2: a "Classic" (1970s and 1980s) theme is the default skin, bound by O6.1.1 and the contrast rules; period display fonts drawn by code; film-room 16mm or tape look by world year; no NFL, broadcast or NFL Films marks, music or voices (section 2.1).
- A-8 O6.8 (with A-1): tools and AI-asset rule from section 5 item 5.
