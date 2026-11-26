# Certified mode and the coaching record file (G-95: N4.3, N4.4, P8.1, P7.4.1, P5.7.2)

| File | What |
| --- | --- |
| `conditions.ts` | Certified ruleset version, start checks, breaking events with reasons and text keys, per-game voiding (reload; more than 2 resumes), `allowPeoplePack` switch (off) |
| `identity.ts` | Career identity and session counter (P8.1.2), local index interface, older-copy check |
| `signatures.ts` | Ed25519 check of official pack signatures through Web Crypto (P7.4.1); the public key is passed in |
| `open.ts` | `openCertified`: opens the save (state chain checked by the save core), then the copy counter, the decision-log chain (injected), and application breaks; `markCopy` |
| `record-file.ts` | Writes and reads the record data file: certified flag, chain head, ruleset, content hash; the record's own checks are injected (models `rating.verifyRecord`) |

The store imports only `@gm/schema`, so the decision chain check and the record checks come in as functions. The certified flag is an honest-play mark in v1: local checks can be defeated by a modified application (P7.4.1 edge case); server re-simulation is P8.2.1, later. See `packages/models/src/rating/README.md` for readings and change requests (CR-G95-1 to 4).
