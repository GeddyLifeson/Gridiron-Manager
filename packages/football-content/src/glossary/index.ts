// G-93 glossary: term records (A4.1.1), links (N5.2.1) and the A4.5.11 block list.
export * from './types.ts';
export { TERMS, BLOCK_LIST } from './data.ts';
export { createGlossary, glossary, type Glossary } from './glossary.ts';
export { validateGlossary, KNOWN_LEVEL_OVERLAPS, type GlossaryProblem } from './validate.ts';
