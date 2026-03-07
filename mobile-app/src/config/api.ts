import { Platform } from 'react-native';

const DEV_API_URL =
  process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.104:5009';

export const getApiUrl = (): string => {
  if (__DEV__) {
    if (Platform.OS === 'web') {
      return 'http://localhost:5009';
    }
    return DEV_API_URL;
  }
  return process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.104:5009';
};

export const API_CONFIG = {
  baseUrl: getApiUrl(),
  signalRHub: '/driverhub',
};

export const getPhpApiUrl = (): string => {
  if (__DEV__) {
    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      return (
        process.env.EXPO_PUBLIC_PHP_API_URL || 'http://192.168.1.104/api'
      );
    }
    if (Platform.OS === 'web') {
      return 'http://localhost/api';
    }
  }

  return process.env.EXPO_PUBLIC_PHP_API_URL || 'http://192.168.1.100/api';
};
