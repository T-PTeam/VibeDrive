import * as Speech from 'expo-speech';
import { VoiceQuality } from 'expo-speech';
import { Audio } from 'expo-av';
import { Platform } from 'react-native';
import { logger } from '../../services/LoggerService';
import { logAsyncError } from '../../utils/asyncErrors';
import { getStoredTtsVoiceId, setStoredTtsVoiceId } from './ttsVoicePrefs';
import {
  TTS_DEFAULT_LANGUAGE,
  TTS_SPEECH,
  DRIVE_SPEAKER_AUDIO_MODE,
  TTS_ANDROID_SPEAKER_PRIMING_URI,
} from './ttsConstants';

let autoPickedVoiceId: string | undefined | null = null;

export function invalidateTtsVoiceCache(): void {
  autoPickedVoiceId = null;
}

export { DRIVE_SPEAKER_AUDIO_MODE } from './ttsConstants';

async function prepareLoudspeakerTtsSession(): Promise<Audio.Sound | null> {
  await Audio.setAudioModeAsync({ ...DRIVE_SPEAKER_AUDIO_MODE });
  if (Platform.OS === 'web') {
    return null;
  }
  try {
    const { sound } = await Audio.Sound.createAsync({
      uri: TTS_ANDROID_SPEAKER_PRIMING_URI,
    });
    await sound.playAsync();
    return sound;
  } catch (e) {
    logAsyncError('speakDriverLine', 'prepareLoudspeakerTtsSession', e);
    return null;
  }
}

export type ResolvedTtsSpeech = {
  voice?: string;
  language: string;
};

export function buildTtsSpeechOptions(
  opts: ResolvedTtsSpeech
): Parameters<typeof Speech.speak>[1] {
  return {
    ...TTS_SPEECH,
    language: opts.language,
    ...(opts.voice ? { voice: opts.voice } : {}),
    ...(Platform.OS === 'ios'
      ? { useApplicationAudioSession: true as const }
      : {}),
  };
}

export async function getResolvedTtsSpeechOptions(): Promise<ResolvedTtsSpeech> {
  let voices: Awaited<ReturnType<typeof Speech.getAvailableVoicesAsync>>;
  try {
    voices = await Speech.getAvailableVoicesAsync();
  } catch {
    return { language: TTS_DEFAULT_LANGUAGE };
  }

  const stored = await getStoredTtsVoiceId();
  if (stored) {
    const match =
      voices.find((v) => v.identifier === stored) ??
      voices.find((v) => v.identifier.toLowerCase() === stored.toLowerCase());
    if (match) {
      return {
        voice: match.identifier,
        language: match.language?.replace('_', '-') || TTS_DEFAULT_LANGUAGE,
      };
    }
    await setStoredTtsVoiceId(null);
    invalidateTtsVoiceCache();
  }

  const env = process.env.EXPO_PUBLIC_TTS_VOICE_IDENTIFIER?.trim();
  if (env) {
    const match =
      voices.find((v) => v.identifier === env) ??
      voices.find((v) => v.identifier.toLowerCase() === env.toLowerCase());
    if (match) {
      return {
        voice: match.identifier,
        language: match.language?.replace('_', '-') || TTS_DEFAULT_LANGUAGE,
      };
    }
    return { voice: env, language: TTS_DEFAULT_LANGUAGE };
  }

  if (autoPickedVoiceId !== null) {
    const match = voices.find((v) => v.identifier === autoPickedVoiceId);
    if (match) {
      return {
        voice: match.identifier,
        language: match.language?.replace('_', '-') || TTS_DEFAULT_LANGUAGE,
      };
    }
  }

  try {
    const enUs = voices.filter(
      (v) => v.language?.toLowerCase().replace('_', '-') === 'en-us'
    );
    const pool =
      enUs.length > 0
        ? enUs
        : voices.filter((v) => v.language?.toLowerCase().startsWith('en'));
    const enhanced = pool.find((v) => v.quality === VoiceQuality.Enhanced);
    const picked = enhanced ?? pool[0];
    autoPickedVoiceId = picked?.identifier ?? undefined;
    if (picked) {
      return {
        voice: picked.identifier,
        language: picked.language?.replace('_', '-') || TTS_DEFAULT_LANGUAGE,
      };
    }
  } catch {
    autoPickedVoiceId = undefined;
  }
  return { language: TTS_DEFAULT_LANGUAGE };
}

function speakWithOptions(
  text: string,
  opts: ResolvedTtsSpeech,
  silentSound: Audio.Sound | null,
  onError?: (err: unknown) => void,
  allowRetryWithoutVoice = true
): Promise<void> {
  return new Promise((resolve) => {
    const unloadSilent = () => {
      if (silentSound) {
        silentSound
          .unloadAsync()
          .catch((e) =>
            logAsyncError('speakDriverLine', 'unloadSilentSound', e)
          );
      }
    };
    const base = {
      ...buildTtsSpeechOptions(opts),
      onStart: () => {
        logger.debug('DriveAssist', 'TTS started');
      },
      onDone: () => {
        logger.debug('DriveAssist', 'TTS finished');
        unloadSilent();
        resolve();
      },
      onError: (err: Error) => {
        logger.error('DriveAssist', 'TTS error', err);
        unloadSilent();
        if (opts.voice && allowRetryWithoutVoice) {
          try {
            Speech.stop();
          } catch (e) {
            logAsyncError('speakDriverLine', 'speechStopBeforeRetry', e);
          }
          void speakWithOptions(
            text,
            { language: TTS_DEFAULT_LANGUAGE },
            null,
            onError,
            false
          ).then(resolve);
          return;
        }
        if (onError) {
          onError(err);
        }
        resolve();
      },
    };
    Speech.speak(text, base);
  });
}

export async function speakDriverLine(
  text: string,
  onError?: (err: unknown) => void
): Promise<void> {
  try {
    Speech.stop();
  } catch (e) {
    logAsyncError('speakDriverLine', 'speechStopBeforeSpeak', e);
  }
  logger.info('DriveAssist', 'TTS using main speaker (primed session)', {
    platform: Platform.OS,
  });
  const priming = await prepareLoudspeakerTtsSession();
  const opts = await getResolvedTtsSpeechOptions();
  await speakWithOptions(text, opts, priming, onError, true);
}
