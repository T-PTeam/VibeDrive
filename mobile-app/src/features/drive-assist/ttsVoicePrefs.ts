import { kvGet, kvRemove, kvSet } from '../../utils/persistentKv';
import { logAsyncError } from '../../utils/asyncErrors';

const KEY = 'vibedrive_tts_voice_identifier';

export async function getStoredTtsVoiceId(): Promise<string | null> {
  try {
    const v = await kvGet(KEY);
    return v?.trim() ? v.trim() : null;
  } catch (e) {
    logAsyncError('ttsVoicePrefs', 'getStoredTtsVoiceId', e);
    return null;
  }
}

export async function setStoredTtsVoiceId(
  identifier: string | null
): Promise<void> {
  try {
    if (identifier?.trim()) {
      await kvSet(KEY, identifier.trim());
    } else {
      await kvRemove(KEY);
    }
  } catch (e) {
    logAsyncError('ttsVoicePrefs', 'setStoredTtsVoiceId', e);
    return;
  }
}
