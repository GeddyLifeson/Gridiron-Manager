// New game screen package (Marlon 2026-11-26; X10.1, X10.3, E1.7). App.tsx renders NewGameFlow before a
// career exists and hands its onStart to the career root.
export { NewGameFlow, type NewGameFlowProps } from './NewGameFlow.tsx';
export { nt, hasNewGameText, duration } from './text.ts';
