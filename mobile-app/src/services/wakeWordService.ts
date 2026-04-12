import type { EventSubscription } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { logger } from './LoggerService';

const MODEL_ID = 'model-wake-en';

const WAKE_PHRASES = ['hey max', 'hey max', 'max', 'okay max'];

function grammarPhrases(): string[] {
  return [...WAKE_PHRASES, '[unk]'];
}

function normalizeResultText(raw: string): string {
  const t = raw.trim();
  if (!t) {
    return '';
  }
  try {
    const parsed = JSON.parse(t) as { text?: string };
    if (parsed && typeof parsed.text === 'string') {
      return parsed.text.toLowerCase().trim();
    }
  } catch {
    return t.toLowerCase();
  }
  return t.toLowerCase();
}

function matchesWakePhrase(normalized: string): boolean {
  return WAKE_PHRASES.some((phrase) =>
    normalized.includes(phrase.toLowerCase())
  );
}

class WakeWordService {
  isListening = false;
  private onWake: (() => void) | null = null;
  private starting = false;
  private lastWakeAt = 0;
  private resultSub: EventSubscription | null = null;
  private partialSub: EventSubscription | null = null;
  private errorSub: EventSubscription | null = null;

  getUnavailableReason(): string | null {
    if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
      return 'Hands-free requires a development build (Expo Go is not supported). Run: eas build --profile development --platform android';
    }
    return null;
  }

  private clearSubscriptions(): void {
    this.resultSub?.remove();
    this.resultSub = null;
    this.partialSub?.remove();
    this.partialSub = null;
    this.errorSub?.remove();
    this.errorSub = null;
  }

  private handleVoskText(raw: string): void {
    const normalized = normalizeResultText(raw);
    if (!normalized || normalized === '[unk]') {
      return;
    }
    if (matchesWakePhrase(normalized)) {
      const now = Date.now();
      if (now - this.lastWakeAt < 1500) {
        return;
      }
      this.lastWakeAt = now;
      try {
        this.onWake?.();
      } catch (e) {
        logger.error('WakeWordService', 'Wake callback error', e);
      }
    }
  }

  async start(onWakeWordDetected: () => void): Promise<void> {
    const reason = this.getUnavailableReason();
    if (reason) {
      this.isListening = false;
      logger.info('WakeWordService', reason);
      return;
    }
    if (this.starting) {
      return;
    }
    this.starting = true;
    try {
      await this.stop();
      const vosk =
        require('react-native-vosk') as typeof import('react-native-vosk');
      this.onWake = onWakeWordDetected;
      try {
        await vosk.loadModel(MODEL_ID);
      } catch (eLoad: unknown) {
        const msg = eLoad instanceof Error ? eLoad.message : String(eLoad);
        if (
          typeof msg === 'string' &&
          (msg.includes('Failed to create a model') ||
            msg.toLowerCase().includes('model'))
        ) {
          logger.error(
            'WakeWordService',
            'Vosk model missing or invalid in this app binary. From repo folder mobile-app run: npm run vosk:model (downloads the small EN model into assets/model-wake-en). EAS runs this automatically via eas-build-pre-install. Then rebuild the dev client (eas build --profile development --platform android).',
            eLoad
          );
        } else {
          logger.error('WakeWordService', 'Vosk loadModel failed', eLoad);
        }
        throw eLoad;
      }
      await vosk.start({ grammar: grammarPhrases() });
      this.clearSubscriptions();
      this.resultSub = vosk.onResult((res: string) => {
        this.handleVoskText(res);
      });
      this.partialSub = vosk.onPartialResult((res: string) => {
        this.handleVoskText(res);
      });
      this.errorSub = vosk.onError((e: unknown) => {
        logger.error('WakeWordService', 'Vosk error', e);
      });
      this.isListening = true;
    } catch (e) {
      if (!(e instanceof Error && e.message?.includes('Failed to create'))) {
        logger.error('WakeWordService', 'Failed to start Vosk', e);
      }
      this.isListening = false;
      this.clearSubscriptions();
      try {
        const vosk =
          require('react-native-vosk') as typeof import('react-native-vosk');
        vosk.stop();
        vosk.unload();
      } catch {}
    } finally {
      this.starting = false;
    }
  }

  async stop(): Promise<void> {
    this.isListening = false;
    this.onWake = null;
    this.clearSubscriptions();
    if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
      return;
    }
    try {
      const vosk =
        require('react-native-vosk') as typeof import('react-native-vosk');
      vosk.stop();
      vosk.unload();
    } catch (e) {
      logger.warn('WakeWordService', 'Vosk stop/unload failed', e);
    }
  }
}

export const wakeWordService = new WakeWordService();
