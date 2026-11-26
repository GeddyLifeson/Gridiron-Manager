# Interface test harness (G-73)

Test code for Q1.5.1 (greyscale), Q1.5.2 (keyboard-only game) and Q1.5.3 (route crawl). Nothing here ships.

| File | What it does |
|------|--------------|
| `keyboard.ts` | `VirtualKeyboard`: real key codes through the shell's own key pipeline, on a virtual clock (no wall clock). |
| `trace.ts` | `runTrace`: plays a scripted key trace against the play clock; a call that outruns the clock is a delay of game caused by reach. `pauseRefusals`: sends pause commands to a core probe. |
| `pause-scan.ts` | `findPauseCommands`: fails if any key action or game-time screen stops, slows or holds a clock outside practice and the school. |
| `crawl.ts` | `crawl`: opens every route for every seat, checks errors, empty regions, missing bindings, refused routes, and controls the seat has no right to. |
| `greyscale.ts` | Grey-level pair check for state colours and the marker-table rule (O6.3.1). |

Conventions screen packages follow so the crawl can see them:

- A control that runs a command carries `data-command="<command>"`. The seat must hold the right (S3).
- A region whose data is not wired sets `data-binding-missing="<key>"`. The crawl fails the route.

Open for the career screens package (G-85): `placeholderSeats()` lists every screen for every rung at both levels with no command rights. Pass real seats built from the S3 rows (`listed`, `rights`) to `crawl({ seats })`.
Open for the console package (G-60): give `runTrace` a `KeyDriver` that knows the console's call keys; the shell's `VirtualKeyboard` stops at `passed-to-console`.

Run:

- `npx vitest run packages/app-ui/test/harness` (also part of `npm test`).
- `npx tsx scripts/ui/keyboard-crawl.ts [--engine chromium|firefox|webkit]` presses real keys in a real browser and compares each result with `VirtualKeyboard`, so the model cannot drift from `Shell.tsx`. It bundles with esbuild (installed with vite).
