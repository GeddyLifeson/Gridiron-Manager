// @gm/app-services, decision log read model (film.decision_log; N3.2, N3.3). Never reads the truth view.
// The integrator re-exports it: `export * as decisionLog from './read-models/decision-log/index.ts';`
export * from './model.ts';
