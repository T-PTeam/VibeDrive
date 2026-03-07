import * as Location from 'expo-location';
import { getPhpApiUrl } from '../config/api';
import { logger } from './LoggerService';

const LOCATION_INTERVAL_MS = 60000;

class LocationService {
  private baseUrl = getPhpApiUrl();
  private intervalId: ReturnType<typeof setInterval> | null = null;

  setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  async requestPermissions(): Promise<boolean> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  }

  async sendLocation(userId: string): Promise<boolean> {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return false;
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const res = await fetch(`${this.baseUrl}/v1/driver/location`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy ?? undefined,
          timestamp: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        logger.warn('LocationService', 'Send location failed', {
          status: res.status,
        });
        return false;
      }
      logger.debug('LocationService', 'Location sent');
      return true;
    } catch (e: unknown) {
      const err = e as { message?: string; code?: string };
      logger.error('LocationService', 'Send location error', {
        message: err?.message ?? String(e),
        code: err?.code,
      });
      return false;
    }
  }

  startWatching(userId: string) {
    this.stopWatching();
    this.sendLocation(userId);
    this.intervalId = setInterval(() => {
      this.sendLocation(userId);
    }, LOCATION_INTERVAL_MS);
    logger.info('LocationService', 'Started watching', { userId });
  }

  stopWatching() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('LocationService', 'Stopped watching');
    }
  }
}

export const locationService = new LocationService();
