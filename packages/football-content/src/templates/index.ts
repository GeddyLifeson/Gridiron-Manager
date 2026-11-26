// Text templates engine (P4.6.1). G-08. Template data files live in packs under `text/<language>/`
// (P4.1.1); the shipped tables are G-32's (`packages/football-content/data/templates/`).
export * from './types.ts';
export { parseTemplate, usedParams, type Token, type ParseResult } from './parse.ts';
export { selectVariant, renderEntry, formatNumber, checkValue, TemplateBook, PLURAL_RULES, type VariantChoice } from './render.ts';
export { validateTemplateFile, templateCoverage, sampleValue, RUNGS, LEVELS, TEMPLATE_KEY, type TemplateProblem, type TemplateValidateOptions, type CoverageProblem } from './validate.ts';
