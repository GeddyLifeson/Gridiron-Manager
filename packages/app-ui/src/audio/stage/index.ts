// Sound stage: the composition step that starts the sound stack (engine, crowd, cadence, ambience,
// field sounds, menu music) and the captions strip, and keeps them in step with settings, screens and
// each play's presentation feed. The app-ui barrel line is the exports integrator's.
export { SoundStage, DEFAULT_LEAD_SECONDS, type SoundStageOptions, type SettingsGetter, type StageFeed, type StagePlace, type PlayHandover, type FrameReport } from './stage.ts';
export { CAMERA_CUE_SOUND, RULING_STINGER, FieldSoundDriver, fieldSoundFor, planFieldSounds, type FieldCueLike, type FieldFeedLike, type FieldPlanItem, type FieldEvent } from './field-sounds.ts';
export { SoundStageCaptions, createBrowserSoundStage, fetchAssetLoader, placeFromNav, settingsGetter, unlockOnFirstInput, useSoundStageSync, type SoundStageCaptionsProps } from './host.tsx';
