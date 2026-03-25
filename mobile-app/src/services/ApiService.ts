import { Platform } from 'react-native';
import { logger } from './LoggerService';
import { getPhpApiUrl } from '../config/api';

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

  async sendAudioToChat(
    audioUri: string,
    token: string,
    sessionId?: number | null
  ): Promise<{ session_id: number; data?: Record<string, unknown> } | null> {
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
      if (sessionId != null) {
        formData.append('session_id', String(sessionId));
      }
      const response = await fetch(`${this.baseUrl}/chat`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });
      const raw = await response.text();
      let data: Record<string, unknown> = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        logger.error('ApiService', 'Chat response not JSON', { raw: raw.slice(0, 100) });
        return null;
      }
      if (!response.ok) {
        logger.error('ApiService', 'Chat request failed', {
          status: response.status,
          data,
        });
        const message = (data?.message as string) || '';
        if (response.status === 429 || message.toLowerCase().includes('rate limit')) {
          const rateLimitError = new Error(
            'OpenAI rate limit exceeded. Please try again in a few minutes.'
          );
          logger.warn('ApiService', rateLimitError.message);
          throw rateLimitError;
        }
        return null;
      }
      const inner = data.data as Record<string, unknown> | undefined;
      let sid: number | undefined;
      if (typeof inner?.session_id === 'number' && inner.session_id > 0) {
        sid = inner.session_id;
      } else if (typeof inner?.session_id === 'string') {
        const n = parseInt(inner.session_id, 10);
        if (!Number.isNaN(n) && n > 0) sid = n;
      }
      if (sid !== undefined) {
        return { session_id: sid, data: inner };
      }
      return null;
    } catch (error: any) {
      if (error?.message?.includes('rate limit')) {
        throw error;
      }
      logger.error('ApiService', 'Send audio to chat failed', error);
      return null;
    }
  }
}

export const apiService = new ApiService();
