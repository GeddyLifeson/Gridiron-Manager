// @gm/app-services, install board read model (O3.3.2 over G5, D9.4 and H1).
export * from './types.ts';
export { buildInstallView, installLock, type InstallInput, type InstallUnitInput, type SlatedPlayer } from './model.ts';
export { installSpec, INSTALL_MODEL, INSTALL_TASKS, type InstallSource, type InstallParams } from './spec.ts';
