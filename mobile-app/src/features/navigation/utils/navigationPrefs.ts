import { kvGet, kvSet } from '../../../utils/persistentKv';
import { logAsyncError } from '../../../utils/asyncErrors';

const ORIGIN_KEY = 'vibedrive_nav_origin_query';
const DEST_KEY = 'vibedrive_nav_dest_query';
const LAST_USER_LOCATION_KEY = 'vibedrive_last_user_location';

export type LastUserLocation = {
  latitude: number;
  longitude: number;
};

export async function loadLastUserLocation(): Promise<LastUserLocation | null> {
  try {
    const raw = await kvGet(LAST_USER_LOCATION_KEY);
    if (!raw) {
      return null;
    }
    const p = JSON.parse(raw) as { latitude?: unknown; longitude?: unknown };
    if (
      typeof p.latitude !== 'number' ||
      typeof p.longitude !== 'number' ||
      Number.isNaN(p.latitude) ||
      Number.isNaN(p.longitude)
    ) {
      return null;
    }
    return { latitude: p.latitude, longitude: p.longitude };
  } catch (e) {
    logAsyncError('navigationPrefs', 'loadLastUserLocation', e);
    return null;
  }
}

export async function saveLastUserLocation(
  latitude: number,
  longitude: number
): Promise<void> {
  try {
    const payload = JSON.stringify({ latitude, longitude });
    await kvSet(LAST_USER_LOCATION_KEY, payload);
  } catch (e) {
    logAsyncError('navigationPrefs', 'saveLastUserLocation', e);
    return;
  }
}

export async function loadNavigationQueries(): Promise<{
  origin: string;
  dest: string;
}> {
  try {
    const [origin, dest] = await Promise.all([
      kvGet(ORIGIN_KEY),
      kvGet(DEST_KEY),
    ]);
    return {
      origin: origin ?? '',
      dest: dest ?? '',
    };
  } catch (e) {
    logAsyncError('navigationPrefs', 'loadNavigationQueries', e);
    return { origin: '', dest: '' };
  }
}

export async function saveNavigationQueries(
  origin: string,
  dest: string
): Promise<void> {
  try {
    const o = origin ?? '';
    const d = dest ?? '';
    await Promise.all([kvSet(ORIGIN_KEY, o), kvSet(DEST_KEY, d)]);
  } catch (e) {
    logAsyncError('navigationPrefs', 'saveNavigationQueries', e);
    return;
  }
}
