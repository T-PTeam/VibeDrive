import { getApiUrl } from '../config/api';
import { logger } from './LoggerService';
import type { ApiSuccessResponse } from '../types/loads';
import type {
  GeocodeResultDto,
  GeocodeSuggestionDto,
  RouteResultDto,
} from '../types/navigation';

class NavigationService {
  private baseUrl = getApiUrl();

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
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...options?.headers,
        },
        ...options,
      });
      const text = await res.text();
      const json =
        text.length > 0 ? (JSON.parse(text) as ApiSuccessResponse<T>) : null;
      if (!res.ok) {
        logger.warn('NavigationService', `Request failed ${path}`, {
          status: res.status,
          body: json,
        });
        return null;
      }
      return json;
    } catch (error: unknown) {
      const err = error as { message?: string; name?: string };
      if (err?.name === 'AbortError') {
        return null;
      }
      logger.error('NavigationService', `Request error ${path}`, {
        message: err?.message ?? String(error),
        name: err?.name,
      });
      return null;
    }
  }

  async geocode(query: string): Promise<GeocodeResultDto | null> {
    const q = encodeURIComponent(query);
    const out = await this.request<GeocodeResultDto>(
      `/api/v1/navigation/geocode?query=${q}`
    );
    return out?.data ?? null;
  }

  async suggest(
    query: string,
    signal?: AbortSignal
  ): Promise<GeocodeSuggestionDto[]> {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      return [];
    }
    const q = encodeURIComponent(trimmed);
    const out = await this.request<GeocodeSuggestionDto[]>(
      `/api/v1/navigation/suggest?query=${q}`,
      { signal }
    );
    return out?.data ?? [];
  }

  async getRoute(
    originQuery: string,
    destQuery: string
  ): Promise<RouteResultDto | null> {
    const out = await this.request<RouteResultDto>('/api/v1/navigation/route', {
      method: 'POST',
      body: JSON.stringify({
        origin_query: originQuery,
        dest_query: destQuery,
      }),
    });
    return out?.data ?? null;
  }
}

export const navigationService = new NavigationService();
