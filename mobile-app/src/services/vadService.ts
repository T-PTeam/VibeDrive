import { Audio } from 'expo-av';
import { logger } from './LoggerService';

export interface VADConfig {
  silenceThresholdDb: number;
  minSpeechDurationMs: number;
  silenceDurationMs: number;
  sampleIntervalMs: number;
}

const DEFAULT_CONFIG: VADConfig = {
  silenceThresholdDb: -35,
  minSpeechDurationMs: 300,
  silenceDurationMs: 3000,
  sampleIntervalMs: 100,
};

const ROLLING = 5;

class VADService {
  private config: VADConfig = { ...DEFAULT_CONFIG };
  private active = false;
  private meterHistory: number[] = [];
  private state: 'silence' | 'speaking' = 'silence';
  private speechStartAt: number | null = null;
  private silenceStartAt: number | null = null;
  private onSpeechEnd: (() => void) | null = null;
  private recording: InstanceType<typeof Audio.Recording> | null = null;
  private fired = false;
  private maxSpeechAt = 0;

  updateConfig(partial: Partial<VADConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  getConfig(): VADConfig {
    return { ...this.config };
  }

  start(
    onSpeechEnd: () => void,
    recording: InstanceType<typeof Audio.Recording> | null
  ): void {
    if (!recording || this.active) {
      return;
    }
    this.stopInternal();
    this.active = true;
    this.fired = false;
    this.onSpeechEnd = onSpeechEnd;
    this.recording = recording;
    this.meterHistory = [];
    this.state = 'silence';
    this.speechStartAt = null;
    this.silenceStartAt = null;
    this.maxSpeechAt = 0;

    recording.setProgressUpdateInterval(this.config.sampleIntervalMs);
    recording.setOnRecordingStatusUpdate((status) => {
      if (!this.active || this.fired || !status.isRecording) {
        return;
      }
      const raw =
        typeof status.metering === 'number' && !Number.isNaN(status.metering)
          ? status.metering
          : -160;
      this.meterHistory.push(raw);
      if (this.meterHistory.length > ROLLING) {
        this.meterHistory.shift();
      }
      const avg =
        this.meterHistory.reduce((a, b) => a + b, 0) /
        Math.max(1, this.meterHistory.length);
      const now = Date.now();
      const th = this.config.silenceThresholdDb;

      if (this.state === 'silence') {
        if (avg > th) {
          if (this.speechStartAt === null) {
            this.speechStartAt = now;
          } else if (
            now - this.speechStartAt >=
            this.config.minSpeechDurationMs
          ) {
            this.state = 'speaking';
            this.silenceStartAt = null;
            this.maxSpeechAt = now;
          }
        } else {
          this.speechStartAt = null;
        }
      } else if (this.state === 'speaking') {
        if (avg > th) {
          this.maxSpeechAt = now;
          this.silenceStartAt = null;
        } else {
          if (this.silenceStartAt === null) {
            this.silenceStartAt = now;
          } else if (
            now - this.silenceStartAt >=
            this.config.silenceDurationMs
          ) {
            this.fireEnd();
          }
        }
      }
    });
  }

  private fireEnd(): void {
    if (this.fired) {
      return;
    }
    this.fired = true;
    this.active = false;
    const cb = this.onSpeechEnd;
    this.onSpeechEnd = null;
    if (this.recording) {
      try {
        this.recording.setOnRecordingStatusUpdate(null);
      } catch {
        logger.warn('VADService', 'Failed to clear recording status listener');
      }
    }
    this.recording = null;
    cb?.();
  }

  stop(): void {
    if (!this.active && !this.recording) {
      return;
    }
    this.active = false;
    this.fired = true;
    this.onSpeechEnd = null;
    if (this.recording) {
      try {
        this.recording.setOnRecordingStatusUpdate(null);
      } catch {}
    }
    this.recording = null;
    this.meterHistory = [];
    this.state = 'silence';
    this.speechStartAt = null;
    this.silenceStartAt = null;
  }

  private stopInternal(): void {
    this.stop();
  }
}

export const vadService = new VADService();
