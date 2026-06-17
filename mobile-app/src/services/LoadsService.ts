import { getPhpApiUrl } from '../config/api';
import { logger } from './LoggerService';
import type {
  ActiveRouteDto,
  DriverSettingsDto,
  FreightLoadDto,
  ApiLoadsResponse,
  ApiSuccessResponse,
  MonitoringSessionDto,
} from '../types/loads';

class LoadsService {
  private baseUrl = getPhpApiUrl();

  setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  private async request<T>(
    path: string,
    options?: RequestInit
  ): Promise<ApiSuccessResponse<T> | null> {
    try {
      const url = `${this.baseUrl}${path}`;
      const res = await fetch(url, {
        ...options,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });
      const text = await res.text();
      const json =
        text.length > 0 ? (JSON.parse(text) as ApiSuccessResponse<T>) : null;
      if (!res.ok) {
        const isDriverSettings404 =
          res.status === 404 && path.includes('/v1/user/driver-settings');
        if (isDriverSettings404) {
          logger.debug('LoadsService', 'No saved driver settings', { path });
          return null;
        }
        const isGetRoute404 =
          res.status === 404 &&
          path.includes('driver/route') &&
          (options?.method === undefined || options?.method === 'GET');
        const isLaravel404 =
          json &&
          typeof json === 'object' &&
          'message' in json &&
          typeof (json as { message?: string }).message === 'string' &&
          (json as { message?: string }).message?.includes(
            'could not be found'
          );
        if (isGetRoute404 && !isLaravel404) {
          logger.debug('LoadsService', 'No active route', { path });
        } else if (isGetRoute404 && isLaravel404) {
          logger.warn(
            'LoadsService',
            'Wrong backend: request hit Laravel instead of VibeDrive PHP API. Set EXPO_PUBLIC_PHP_API_URL to your VibeDrive backend (e.g. http://<host>/api).',
            { path }
          );
        } else {
          logger.error('LoadsService', `Request failed ${path}`, {
            status: res.status,
            body: json,
          });
        }
        return null;
      }
      return json;
    } catch (error: unknown) {
      const err = error as { message?: string; name?: string };
      logger.error('LoadsService', `Request error ${path}`, {
        message: err?.message ?? String(error),
        name: err?.name,
      });
      return null;
    }
  }

  async getDriverSettings(userId: string): Promise<DriverSettingsDto | null> {
    const q = encodeURIComponent(userId);
    const out = await this.request<DriverSettingsDto>(
      `/v1/user/driver-settings?user_id=${q}`
    );
    return out?.data ?? null;
  }

  async getTtsVoice(userId: string): Promise<string | null | undefined> {
    const q = encodeURIComponent(userId);
    const out = await this.request<{ tts_voice_identifier: string | null }>(
      `/v1/user/tts-voice?user_id=${q}`
    );
    if (out === null) {
      return undefined;
    }
    const id = out.data?.tts_voice_identifier;
    if (typeof id === 'string' && id.trim() !== '') {
      return id.trim();
    }
    return null;
  }

  async setTtsVoice(
    userId: string,
    ttsVoiceIdentifier: string | null
  ): Promise<boolean> {
    const out = await this.request<{ tts_voice_identifier: string | null }>(
      '/v1/user/tts-voice',
      {
        method: 'PUT',
        body: JSON.stringify({
          user_id: userId,
          tts_voice_identifier: ttsVoiceIdentifier,
        }),
      }
    );
    return out !== null;
  }

  async getActiveRoute(userId: string): Promise<ActiveRouteDto | null> {
    const q = encodeURIComponent(userId);
    const out = await this.request<ActiveRouteDto>(
      `/v1/driver/route?user_id=${q}`
    );
    return out?.data ?? null;
  }

  async getProposedLoads(userId: string): Promise<FreightLoadDto[]> {
    const q = encodeURIComponent(userId);
    const out = await this.request<ApiLoadsResponse>(
      `/v1/driver/loads?user_id=${q}`
    );
    if (!out?.data?.loads) return [];
    return out.data.loads;
  }

  async startMonitoring(
    userId: string,
    destCity: string,
    weightKg: number,
    volumeM3: number,
    originCity?: string
  ): Promise<MonitoringSessionDto | null> {
    const body = {
      user_id: userId,
      dest_city: destCity,
      weight_kg: weightKg,
      volume_m3: volumeM3,
      origin_city: originCity ?? null,
    };
    const out = await this.request<MonitoringSessionDto>('/v1/driver/route', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return out?.data ?? null;
  }

  async acceptLoad(
    userId: string,
    loadId: string
  ): Promise<ActiveRouteDto | null> {
    const out = await this.request<ActiveRouteDto>('/v1/driver/loads/accept', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, load_id: loadId }),
    });
    return out?.data ?? null;
  }
}

export const loadsService = new LoadsService();
