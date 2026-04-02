import React, { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import DriveScreen from './src/screens/DriveScreen';
import SubscriptionPricesScreen from './src/screens/SubscriptionPricesScreen';
import NavigationScreen from './src/screens/NavigationScreen';
import UserSettingsScreen from './src/screens/UserSettingsScreen';
import { signalRService } from './src/services/SignalRService';
import { loadsService } from './src/services/LoadsService';
import { navigationService } from './src/services/NavigationService';
import { locationService } from './src/services/LocationService';
import { getApiUrl, getPhpApiUrl } from './src/config/api';
import { logger } from './src/services/LoggerService';
import { PHP_API_USER_ID_KEY } from './src/constants/auth';

try {
  const WebBrowser = require('expo-web-browser');
  if (WebBrowser?.maybeCompleteAuthSession) {
    WebBrowser.maybeCompleteAuthSession();
  }
} catch (error) {
  logger.warn('App', 'expo-web-browser not available (Expo Go limitation)');
}

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Drive: { userId?: string; userName?: string };
  SubscriptionPrices: undefined;
  UserSettings: { userId?: string; destQuery?: string };
  Navigation: {
    originQuery?: string;
    destQuery?: string;
    userId?: string;
    userName?: string;
  };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const apiUrl = getApiUrl();
    const phpUrl = getPhpApiUrl();
    signalRService.setBaseUrl(apiUrl);
    navigationService.setBaseUrl(apiUrl);
    loadsService.setBaseUrl(phpUrl);
    locationService.setBaseUrl(phpUrl);
    locationService.startWatching();
    signalRService.onStateChange((state) => {
      logger.debug('App', 'SignalR state changed', { state });
    });
    logger.info('App', 'SignalR service initialized', { url: apiUrl });
    return () => {
      locationService.stopWatching();
    };
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (prev === 'active' && (next === 'background' || next === 'inactive')) {
        (async () => {
          const userId = await SecureStore.getItemAsync(PHP_API_USER_ID_KEY);
          if (userId) {
            await locationService.sendLocation(userId);
          }
        })().catch(() => undefined);
      }
      if ((prev === 'background' || prev === 'inactive') && next === 'active') {
        locationService.startWatching();
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Login"
          screenOptions={{
            headerShown: true,
          }}
        >
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{
              title: 'Login',
            }}
          />
          <Stack.Screen
            name="Register"
            component={RegisterScreen}
            options={{
              title: 'Register',
            }}
          />
          <Stack.Screen
            name="Drive"
            component={DriveScreen}
            options={{
              title: 'Drive',
            }}
          />
          <Stack.Screen
            name="SubscriptionPrices"
            component={SubscriptionPricesScreen}
            options={{
              title: 'Subscription Plans',
            }}
          />
          <Stack.Screen
            name="UserSettings"
            component={UserSettingsScreen}
            options={{
              title: 'User settings',
            }}
          />
          <Stack.Screen
            name="Navigation"
            component={NavigationScreen}
            options={{
              title: 'Navigation',
            }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
