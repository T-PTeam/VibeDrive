import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import DriveScreen from './src/screens/DriveScreen';
import NavigationScreen from './src/screens/NavigationScreen';
import SubscriptionPricesScreen from './src/screens/SubscriptionPricesScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import UserSettingsScreen from './src/screens/UserSettingsScreen';
import { signalRService } from './src/services/SignalRService';
import { getApiUrl, getPhpApiUrl } from './src/config/api';
import { logger } from './src/services/LoggerService';

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
  Navigation: {
    userId?: string;
    userName?: string;
    originQuery?: string;
    destQuery?: string;
  };
  SubscriptionPrices: undefined;
  Settings: undefined;
  UserSettings: { userId?: string; destQuery?: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  useEffect(() => {
    const apiUrl = getApiUrl();
    const phpApiUrl = getPhpApiUrl();
    signalRService.setBaseUrl(apiUrl);
    signalRService.onStateChange((state) => {
      logger.debug('App', 'SignalR state changed', { state });
    });
    logger.info('App', 'SignalR service initialized', { url: apiUrl });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    void fetch(`${apiUrl}/api/ping`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async (res) => {
        const text = await res.text().catch(() => '');
        void text;
      })
      .catch((e) => {
        void e;
      })
      .finally(() => clearTimeout(timeoutId));
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
            name="Navigation"
            component={NavigationScreen}
            options={{
              title: 'Navigation',
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
            name="Settings"
            component={SettingsScreen}
            options={{
              title: 'Settings',
            }}
          />
          <Stack.Screen
            name="UserSettings"
            component={UserSettingsScreen}
            options={{
              title: 'Driver Settings',
            }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
