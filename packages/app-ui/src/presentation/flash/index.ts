// PV-14 no-flashing rule: checker and onset limiter.
export { FLASH_RULE, MAX_CHANGES_PER_WINDOW, FlashGuard, checkFlashes, isSaturatedRed, luminanceChanges, maxInWindow, redChanges, type FlashReport, type FlashSample } from './flash.ts';
