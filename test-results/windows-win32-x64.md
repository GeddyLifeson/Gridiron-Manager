# Phase 0 check on Windows: PASS

Run on Marlon's PC with `npm run check`, commit f583d58, win32 10.0.26200 x64, node 22.23.2, 2026-11-26T00:18:46Z.
Transcribed from the run's own summary.md and gate files (they were not copied back as files).

| Step | Result | Seconds |
| --- | --- | --- |
| typecheck (TypeScript strict) | pass | 9.6 |
| lints (P1.2.1, P1.2.2, P1.1.1, P1.1.2, Q1.2.1, Q6.2.1) | pass | 4.8 |
| unit, property and schema tests (vitest) | pass | 80.7 |
| headless golden gate, 1 and N workers (Q1.3.1) | pass | 39.2 |
| browser golden gate and save round trip (R1.2.1 items 1-2) | pass | 48.8 |
| desktop shell golden gate (R1.2.1 item 1) | pass | 50.4 |
| desktop native save copied out (P5.1.1) | pass | 1.1 |
| desktop save opens and replays in Node (R1.2.1 item 2) | pass | 10.2 |

| Gate | ok | digest | notes |
| --- | --- | --- | --- |
| node-win32-x64 | true | c937f74b50151fce | |
| browser-chromium 158 | true | c937f74b50151fce | save round trip browser ↔ Node passed |
| browser-webkit 27.2 | true | c937f74b50151fce | |
| browser-firefox 159 | not run | | Firefox would not start on this PC ("side-by-side configuration is incorrect", mozglue assembly); not a game failure |
| desktop-win32-x64 (WebView2 / Edge 158) | true | c937f74b50151fce | native save: 4 commands, state 758b31a9a2710d5c, same as the Linux desktop save |
