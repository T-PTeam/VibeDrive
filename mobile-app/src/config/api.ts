import Constants from 'expo-constants';
import { Platform } from 'react-native';

const PORT = '8080';
const DEFAULT_LAN_HOST = '192.168.1.103';

function resolveLoopbackUrlForDevice(url: string): string {
  if (!__DEV__) return url;
  const trimmed = url.replace(/\/$/, '');
  if (!/^(https?:\/\/)(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(trimmed)) {
    return url;
  }
  if (Platform.OS === 'android' && !Constants.isDevice) {
    try {
      const u = new URL(trimmed);
      u.hostname = '10.0.2.2';
      return u.toString().replace(/\/$/, '');
    } catch {
      return url;
    }
  }
  if (!Constants.isDevice) {
    return trimmed;
  }
  const devHost =
    Constants.expoConfig?.hostUri?.split(':')[0] ??
    process.env.EXPO_PUBLIC_API_HOST ??
    DEFAULT_LAN_HOST;
  try {
    const u = new URL(trimmed);
    u.hostname = devHost;
    const resolved = u.toString().replace(/\/$/, '');
    return resolved;
  } catch {
    return url;
  }
}

function getDevHost(): string {
  if (Platform.OS === 'web') return 'localhost';
  if (Constants.isDevice) {
    return process.env.EXPO_PUBLIC_API_HOST ?? DEFAULT_LAN_HOST;
  }
  if (Platform.OS === 'ios') return 'localhost';
  if (Platform.OS === 'android') return '10.0.2.2';
  return 'localhost';
}

function getBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) {
    return resolveLoopbackUrlForDevice(envUrl.replace(/\/$/, ''));
  }
  if (__DEV__) return `http://${getDevHost()}:${PORT}`;
  return `http://localhost:${PORT}`;
}

export const getApiUrl = (): string => getBaseUrl();

export const API_CONFIG = {
  baseUrl: getApiUrl(),
  signalRHub: '/driverhub',
};

export const getPhpApiUrl = (): string => {
  const envUrl = process.env.EXPO_PUBLIC_PHP_API_URL;
  if (envUrl) {
    return resolveLoopbackUrlForDevice(envUrl.replace(/\/$/, ''));
  }
  const base = getBaseUrl();
  return `${base}/api`;
};
