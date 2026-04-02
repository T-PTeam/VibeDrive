import { InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';

export const TTS_DEFAULT_LANGUAGE = 'en-US';

export const TTS_SPEECH = {
  language: TTS_DEFAULT_LANGUAGE,
  pitch: 1.0,
  rate: 1.05,
  volume: 1.0,
} as const;

export const DRIVE_SPEAKER_AUDIO_MODE = {
  allowsRecordingIOS: false,
  playsInSilentModeIOS: true,
  staysActiveInBackground: false,
  interruptionModeIOS: InterruptionModeIOS.DoNotMix,
  interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
  shouldDuckAndroid: false,
  playThroughEarpieceAndroid: false,
};

export const TTS_ANDROID_SPEAKER_PRIMING_URI =
  'https://raw.githubusercontent.com/anars/blank-audio/master/1-second-of-silence.mp3';

export const TTS_MESSAGES = {
  monitoringStarted: 'Give me some minutes and I will find you addition cargos',
  welcomeDriving: 'Keep the shiny side up',
  voiceUpdated: 'Voice updated',
} as const;
