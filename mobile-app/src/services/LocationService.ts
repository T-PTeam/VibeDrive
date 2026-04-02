import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import { getPhpApiUrl } from '../config/api';
import { PHP_API_USER_ID_KEY } from '../constants/auth';
import { saveLastUserLocation } from '../features/navigation/utils/navigationPrefs';
import { logger } from './LoggerService';
import { logAsyncRejection } from '../utils/asyncErrors';

const LOCATION_SYNC_INTERVAL_MS = 900000;

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
      const res = await fetch(`${this.baseUrl}/v1/user/last-location`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
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

  private async sendLocationIfLoggedIn(): Promise<boolean> {
    const userId = await SecureStore.getItemAsync(PHP_API_USER_ID_KEY);
    if (!userId) return false;
    return this.sendLocation(userId);
  }

  async fetchLastLocationAndHydrate(userId: string): Promise<boolean> {
    try {
      const q = encodeURIComponent(userId);
      const res = await fetch(
        `${this.baseUrl}/v1/user/last-location?user_id=${q}`,
        {
          method: 'GET',
          headers: { Accept: 'application/json' },
        }
      );
      if (!res.ok) {
        return false;
      }
      const envelope = (await res.json()) as {
        status?: string;
        data?: {
          latitude?: number;
          longitude?: number;
        };
      };
      const d = envelope?.data;
      if (
        typeof d?.latitude !== 'number' ||
        typeof d?.longitude !== 'number' ||
        Number.isNaN(d.latitude) ||
        Number.isNaN(d.longitude)
      ) {
        return false;
      }
      await saveLastUserLocation(d.latitude, d.longitude);
      return true;
    } catch (e: unknown) {
      logger.debug('LocationService', 'fetchLastLocation failed', {
        message: e instanceof Error ? e.message : String(e),
      });
      return false;
    }
  }

  startWatching() {
    this.stopWatching();
    this.sendLocationIfLoggedIn().catch(
      logAsyncRejection('LocationService', 'sendLocationOnStartWatching')
    );
    this.intervalId = setInterval(() => {
      this.sendLocationIfLoggedIn().catch(
        logAsyncRejection('LocationService', 'sendLocationInterval')
      );
    }, LOCATION_SYNC_INTERVAL_MS);
    logger.info('LocationService', 'Started watching');
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
