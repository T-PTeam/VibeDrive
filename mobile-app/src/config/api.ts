import Constants from 'expo-constants';
import { Platform } from 'react-native';

const PORT = '8080';
const DEFAULT_LAN_HOST = '192.168.1.101';

function applyExpoPublicApiHost(url: string): string {
  const host = process.env.EXPO_PUBLIC_API_HOST?.trim();
  if (!host || !__DEV__) {
    return url;
  }
  try {
    const u = new URL(url.replace(/\/$/, ''));
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') {
      u.hostname = host;
      return u.toString().replace(/\/$/, '');
    }
  } catch {
    return url;
  }
  return url;
}

function isTunnelHostname(host: string): boolean {
  const h = host.toLowerCase();
  return h.includes('exp.direct') || h.includes('exp.host');
}

function getLanHostForDevice(): string {
  const explicit = process.env.EXPO_PUBLIC_API_HOST?.trim();
  if (explicit) {
    return explicit;
  }
  const fromUri = Constants.expoConfig?.hostUri?.split(':')[0]?.trim();
  if (fromUri && !isTunnelHostname(fromUri)) {
    return fromUri;
  }
  return DEFAULT_LAN_HOST;
}

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
  const devHost = getLanHostForDevice();
  try {
    const u = new URL(trimmed);
    u.hostname = devHost;
    return u.toString().replace(/\/$/, '');
  } catch {
    return url;
  }
}

function getDevHost(): string {
  if (Platform.OS === 'web') return 'localhost';
  if (Constants.isDevice) {
    return getLanHostForDevice();
  }
  if (Platform.OS === 'ios') return 'localhost';
  if (Platform.OS === 'android') return '10.0.2.2';
  return 'localhost';
}

function getBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) {
    const withHost = applyExpoPublicApiHost(envUrl.replace(/\/$/, ''));
    return resolveLoopbackUrlForDevice(withHost);
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
    const withHost = applyExpoPublicApiHost(envUrl.replace(/\/$/, ''));
    return resolveLoopbackUrlForDevice(withHost);
  }
  const base = getBaseUrl();
  return `${base}/api`;
};
