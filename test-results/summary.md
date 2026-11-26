# Phase 0 check: PASS

Commit 1132134 on linux 6.18.44-fc-v880 x64, node 22.23.5, 2026-11-26T03:34:18.678Z.

| Step | Result | Seconds |
| --- | --- | --- |
| typecheck (TypeScript strict) | pass | 3.6 |
| lints (P1.2.1, P1.2.2, P1.1.1, P1.1.2, Q1.2.1, Q6.2.1) | pass | 2.6 |
| unit, property and schema tests (vitest) | pass | 282.2 |
| headless golden gate, 1 and N workers (Q1.3.1) | pass | 5.8 |
| browser golden gate and save round trip (R1.2.1 items 1-2) | pass | 8.7 |
| browser build works offline after the first visit (P2.3.2, G-06) | pass | 2.9 |
| desktop shell golden gate (R1.2.1 item 1) | skipped: no desktop build (run: npm run desktop:build) | 0 |
| desktop native save copied out (P5.1.1) | skipped: no desktop build | 0 |
| desktop save opens and replays in Node (R1.2.1 item 2) | skipped: no desktop build | 0 |
