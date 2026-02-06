import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { logger } from './LoggerService';

export interface RecordingResult {
  uri: string;
  duration: number;
}

class AudioRecordingService {
  private recording: Audio.Recording | null = null;
  private isRecording: boolean = false;

  async requestPermissions(): Promise<boolean> {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        logger.warn('AudioRecording', 'Microphone permission denied');
        return false;
      }
      logger.info('AudioRecording', 'Microphone permission granted');
      return true;
    } catch (error) {
      logger.error('AudioRecording', 'Failed to request permissions', error);
      return false;
    }
  }

  async startRecording(): Promise<void> {
    if (this.isRecording) {
      logger.warn('AudioRecording', 'Recording already in progress');
      return;
    }

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      this.recording = recording;
      this.isRecording = true;
      logger.info('AudioRecording', 'Recording started');
    } catch (error) {
      logger.error('AudioRecording', 'Failed to start recording', error);
      throw error;
    }
  }

  async stopRecording(): Promise<RecordingResult | null> {
    if (!this.isRecording || !this.recording) {
      logger.warn('AudioRecording', 'No active recording to stop');
      return null;
    }

    try {
      await this.recording.stopAndUnloadAsync();
      const uri = this.recording.getURI();
      const status = await this.recording.getStatusAsync();

      this.isRecording = false;
      this.recording = null;

      if (!uri) {
        logger.error('AudioRecording', 'Recording URI is null');
        return null;
      }

      const duration = status.durationMillis ? status.durationMillis / 1000 : 0;

      logger.info('AudioRecording', 'Recording stopped', {
        uri,
        duration,
      });

      return {
        uri,
        duration,
      };
    } catch (error) {
      logger.error('AudioRecording', 'Failed to stop recording', error);
      this.isRecording = false;
      this.recording = null;
      throw error;
    }
  }

  async cancelRecording(): Promise<void> {
    if (!this.isRecording || !this.recording) {
      return;
    }

    try {
      await this.recording.stopAndUnloadAsync();
      const uri = this.recording.getURI();

      if (uri) {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      }

      this.isRecording = false;
      this.recording = null;
      logger.info('AudioRecording', 'Recording cancelled');
    } catch (error) {
      logger.error('AudioRecording', 'Failed to cancel recording', error);
      this.isRecording = false;
      this.recording = null;
    }
  }

  getIsRecording(): boolean {
    return this.isRecording;
  }
}

export const audioRecordingService = new AudioRecordingService();
