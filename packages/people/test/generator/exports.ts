// One import point for the generator tests: the module barrel plus internals the tests check.
export * from '../../src/generator/index.ts';
export { minEigenvalue as minEig } from '../../src/generator/linalg.ts';
