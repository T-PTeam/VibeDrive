import { Platform } from 'react-native';
import { logger } from './LoggerService';

const getPhpApiUrl = (): string => {
  if (__DEV__) {
    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      return process.env.EXPO_PUBLIC_PHP_API_URL || 'http://192.168.0.155/api';
    }
    if (Platform.OS === 'web') {
      return 'http://localhost/api';
    }
  }

  return process.env.EXPO_PUBLIC_PHP_API_URL || 'http://192.168.0.155/api';
};

class ApiService {
  private baseUrl: string = getPhpApiUrl();

  setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  async uploadAudio(
    audioUri: string,
    userId: string,
    additionalData?: Record<string, any>
  ): Promise<any> {
    try {
      const formData = new FormData();

      const filename = audioUri.split('/').pop() || 'recording.m4a';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `audio/${match[1]}` : 'audio/m4a';

      formData.append('audio', {
        uri: audioUri,
        name: filename,
        type: type,
      } as any);

      formData.append('user_id', userId);

      if (additionalData) {
        Object.keys(additionalData).forEach((key) => {
          formData.append(key, String(additionalData[key]));
        });
      }

      logger.info('ApiService', 'Uploading audio', {
        uri: audioUri,
        userId,
        url: `${this.baseUrl}/audio/upload`,
      });

      const response = await fetch(`${this.baseUrl}/audio/upload`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('ApiService', 'Upload failed', {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });
        throw new Error(
          `Upload failed: ${response.status} ${response.statusText}`
        );
      }

      const result = await response.json();
      logger.info('ApiService', 'Upload successful', result);
      return result;
    } catch (error) {
      logger.error('ApiService', 'Upload error', error);
      throw error;
    }
  }
}

export const apiService = new ApiService();
