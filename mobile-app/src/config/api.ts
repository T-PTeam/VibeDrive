import { Platform } from 'react-native';

const DEV_API_URL =
  process.env.EXPO_PUBLIC_API_URL || 'http://192.168.0.155:5009';

export const getApiUrl = (): string => {
  if (__DEV__) {
    if (Platform.OS === 'android') {
      return DEV_API_URL;
    }
    if (Platform.OS === 'ios') {
      return DEV_API_URL;
    }
    if (Platform.OS === 'web') {
      return 'http://localhost:5009';
    }
  }

  return process.env.EXPO_PUBLIC_API_URL || 'http://192.168.0.155:5009';
};

export const API_CONFIG = {
  baseUrl: getApiUrl(),
  signalRHub: '/driverhub',
};
