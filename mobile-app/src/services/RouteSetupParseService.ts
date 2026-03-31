import { getPhpApiUrl } from '../config/api';
import { logger } from './LoggerService';

export interface RouteSetupParseResult {
  dest_city?: string | null;
  weight_kg?: number | null;
  volume_m3?: number | null;
  ai_message?: string | null;
}

interface ServerEnvelope<T> {
  status?: string;
  code?: number;
  data?: T;
  message?: string | null;
}

class RouteSetupParseService {
  async parseRouteSetup(text: string): Promise<RouteSetupParseResult | null> {
    const trimmed = text.trim();
    if (!trimmed) {
      return null;
    }

    const url = `${getPhpApiUrl()}/v1/driver/route/parse-setup`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: trimmed }),
      });

      const rawText = await res.text();
      const json =
        rawText.length > 0
          ? (JSON.parse(rawText) as ServerEnvelope<RouteSetupParseResult>)
          : null;

      if (!res.ok) {
        logger.error('RouteSetupParseService', `parse-setup failed ${url}`, {
          status: res.status,
          body: json,
        });
        return null;
      }

      if (json?.status !== 'success' || json.data == null) {
        logger.error(
          'RouteSetupParseService',
          'Unexpected parse-setup response',
          {
            json,
          }
        );
        return null;
      }

      return json.data;
    } catch (error: unknown) {
      const err = error as { message?: string; name?: string };
      logger.error('RouteSetupParseService', `Request error ${url}`, {
        message: err?.message ?? String(error),
        name: err?.name,
      });
      return null;
    }
  }
}

export const routeSetupParseService = new RouteSetupParseService();
