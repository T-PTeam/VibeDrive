export const STORAGE_HANDS_FREE_ENABLED = 'hands_free_enabled';
export const STORAGE_VAD_PRESET = 'vad_sensitivity_preset';
export const STORAGE_VAD_PAUSE_PRESET = 'vad_pause_before_send_preset';

export type VadPreset = 'quiet' | 'normal' | 'noisy';

export const VAD_PRESET_TO_DB: Record<VadPreset, number> = {
  quiet: -45,
  normal: -35,
  noisy: -25,
};

export type VadPausePreset = 'short' | 'standard' | 'long';

export const VAD_PAUSE_PRESET_TO_MS: Record<VadPausePreset, number> = {
  short: 2000,
  standard: 3000,
  long: 4000,
};
