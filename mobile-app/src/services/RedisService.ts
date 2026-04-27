import { logger } from './LoggerService';
import { getPhpApiUrl } from '../config/api';
import * as FileSystem from 'expo-file-system/legacy';

interface RedisMessage {
  userId: string;
  type: string;
  data: any;
  timestamp?: string;
}

class RedisService {
  async publishAudioRecording(
    userId: string,
    audioUri: string,
    duration: number,
    metadata?: Record<string, any>
  ): Promise<boolean> {
    try {
      logger.info('RedisService', 'Starting audio recording publish', {
        userId,
        audioUri,
        duration,
      });

      const fileInfo = await FileSystem.getInfoAsync(audioUri);
      if (!fileInfo.exists) {
        logger.error('RedisService', 'Audio file does not exist', { audioUri });
        return false;
      }

      const filename = audioUri.split('/').pop() || 'recording.m4a';
      let audioBase64: string | null = null;

      try {
        if (fileInfo.size && fileInfo.size > 0) {
          audioBase64 = await this.readAudioAsBase64(audioUri);
          logger.debug('RedisService', 'Audio file read as Base64', {
            size: audioBase64.length,
          });
        }
      } catch (readError) {
        logger.warn(
          'RedisService',
          'Failed to read audio as Base64, continuing without it',
          {
            error: readError,
          }
        );
      }

      const message: RedisMessage = {
        userId,
        type: 'audio_recording',
        data: {
          audio_uri: audioUri,
          filename,
          duration,
          file_size: fileInfo.size || 0,
          timestamp: new Date().toISOString(),
          ...(audioBase64 && { audio_base64: audioBase64 }),
          ...metadata,
        },
        timestamp: new Date().toISOString(),
      };

      logger.info('RedisService', 'Publishing message to Redis', {
        userId,
        type: message.type,
        dataSize: JSON.stringify(message.data).length,
      });

      return await this.publishToRedis(message);
    } catch (error) {
      logger.error('RedisService', 'Failed to publish audio recording', error, {
        userId,
        audioUri,
        duration,
      });
      return false;
    }
  }

  private async readAudioAsBase64(uri: string): Promise<string> {
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return base64;
    } catch (error) {
      logger.error('RedisService', 'Failed to read audio file', error);
      throw error;
    }
  }

  async publishVoiceConfirmation(
    userId: string,
    choice: 'confirm' | 'reject'
  ): Promise<boolean> {
    const message: RedisMessage = {
      userId,
      type: 'voice_confirmation',
      data: { choice },
      timestamp: new Date().toISOString(),
    };
    return this.publishToRedis(message);
  }

  private async publishToRedis(message: RedisMessage): Promise<boolean> {
    try {
      const apiUrl = getPhpApiUrl();
      const url = `${apiUrl}/v1/redis/publish`;

      logger.debug('RedisService', 'Sending request to API', { url });

      const requestBody = {
        channel: 'driver_updates',
        message: JSON.stringify(message),
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      logger.debug('RedisService', 'API response received', {
        status: response.status,
        statusText: response.statusText,
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('RedisService', 'Publish failed', {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
          url,
        });
        return false;
      }

      const result = await response.json();
      logger.info('RedisService', 'Message published to Redis', {
        userId: message.userId,
        type: message.type,
        subscribers: result?.data?.subscribers,
        result,
      });
      return true;
    } catch (error: any) {
      logger.error('RedisService', 'Failed to publish to Redis', error, {
        message: error?.message,
        stack: error?.stack,
        url: `${getPhpApiUrl()}/v1/redis/publish`,
      });
      return false;
    }
  }
}

export const redisService = new RedisService();
