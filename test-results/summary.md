# Phase 0 check: PASS

Commit cb06db3 (with uncommitted changes) on linux 6.18.44-fc-v880 x64, node 22.23.5, 2026-11-26T02:43:59.525Z.

| Step | Result | Seconds |
| --- | --- | --- |
| typecheck (TypeScript strict) | pass | 2.6 |
| lints (P1.2.1, P1.2.2, P1.1.1, P1.1.2, Q1.2.1, Q6.2.1) | pass | 1.8 |
| unit, property and schema tests (vitest) | pass | 126.8 |
| headless golden gate, 1 and N workers (Q1.3.1) | pass | 5.2 |
| browser golden gate and save round trip (R1.2.1 items 1-2) | pass | 6.8 |
| browser build works offline after the first visit (P2.3.2, G-06) | pass | 3.1 |
| desktop shell golden gate (R1.2.1 item 1) | skipped: no desktop build (run: npm run desktop:build) | 0 |
| desktop native save copied out (P5.1.1) | skipped: no desktop build | 0 |
| desktop save opens and replays in Node (R1.2.1 item 2) | skipped: no desktop build | 0 |
