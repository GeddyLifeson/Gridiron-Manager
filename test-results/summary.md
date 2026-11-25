# Phase 0 check: PASS

Commit 686842e on linux 6.18.44-fc-v880 x64, node 22.23.5, 2026-11-25T23:53:26.260Z.

| Step | Result | Seconds |
| --- | --- | --- |
| typecheck (TypeScript strict) | pass | 1 |
| lints (P1.2.1, P1.2.2, P1.1.1, P1.1.2, Q1.2.1, Q6.2.1) | pass | 0.5 |
| unit, property and schema tests (vitest) | pass | 9.5 |
| headless golden gate, 1 and N workers (Q1.3.1) | pass | 3.9 |
| browser golden gate and save round trip (R1.2.1 items 1-2) | pass | 5 |
| desktop shell golden gate (R1.2.1 item 1) | pass | 1.9 |
| desktop native save copied out (P5.1.1) | pass | 0.2 |
| desktop save opens and replays in Node (R1.2.1 item 2) | pass | 0.5 |
